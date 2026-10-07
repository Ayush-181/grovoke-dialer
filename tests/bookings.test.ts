import { afterEach, describe, expect, test } from "bun:test";
import { bookingInstants, nextWeekdays, overlapsBusy } from "../src/lib/booking-time";
import { toDateTimeLocalValue } from "../src/lib/timezones";
import {
  calendarBusy,
  existingCalendarInvite,
  GoogleCalendarError,
  sendCalendarInvite,
} from "../src/lib/google-calendar";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init))) as typeof fetch;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("booking timezone conversion", () => {
  test("Eastern summer appointment rolls into the next IST day", () => {
    const instant = bookingInstants("2026-07-14T15:00", "America/New_York")[0]!;
    expect(instant.toISOString()).toBe("2026-07-14T19:00:00.000Z");
    expect(toDateTimeLocalValue(instant, "Asia/Kolkata")).toBe("2026-07-15T00:30");
  });
  test("Eastern winter applies standard time", () => {
    const instant = bookingInstants("2026-12-14T10:00", "America/New_York")[0]!;
    expect(toDateTimeLocalValue(instant, "Asia/Kolkata")).toBe("2026-12-14T20:30");
  });
  test("IST appointment maps to the previous American day", () => {
    const instant = bookingInstants("2026-07-15T01:00", "Asia/Kolkata")[0]!;
    expect(toDateTimeLocalValue(instant, "America/Los_Angeles")).toBe("2026-07-14T12:30");
  });
  test("rejects nonexistent spring-forward time", () => {
    expect(bookingInstants("2026-03-08T02:30", "America/New_York")).toEqual([]);
  });
  test("fall-back time provides both explicit occurrences", () => {
    expect(
      bookingInstants("2026-11-01T01:30", "America/New_York").map((d) => d.toISOString()),
    ).toEqual(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]);
  });
  test("Arizona does not observe summer daylight saving", () => {
    expect(bookingInstants("2026-07-14T10:00", "America/Phoenix")[0]!.toISOString()).toBe(
      "2026-07-14T17:00:00.000Z",
    );
  });
  test("rejects invalid date and empty input", () => {
    expect(bookingInstants("2026-02-30T10:00", "Asia/Kolkata")).toEqual([]);
    expect(bookingInstants("", "Asia/Kolkata")).toEqual([]);
  });
  test("day suggestions skip the weekend without using machine timezone", () => {
    expect(nextWeekdays("2026-10-09")).toEqual([
      "2026-10-09",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
    ]);
  });
  test("conflicts consider duration; adjacent events are allowed", () => {
    const busy = [{ start: "2026-10-07T10:00:00Z", end: "2026-10-07T10:30:00Z" }];
    expect(overlapsBusy(new Date("2026-10-07T09:30:00Z"), 30, busy)).toBe(false);
    expect(overlapsBusy(new Date("2026-10-07T09:45:00Z"), 30, busy)).toBe(true);
    expect(overlapsBusy(new Date("2026-10-07T10:30:00Z"), 30, busy)).toBe(false);
  });
});

const booking = {
  id: "a7f1a399-27c5-4244-9446-e9991d7b7290",
  title: "Demo",
  starts_at: "2026-12-14T15:00:00Z",
  ends_at: "2026-12-14T15:30:00Z",
  lead_timezone: "America/New_York",
  attendees: ["guest@example.com"],
  notes: "Discovery",
  location: "Online",
  add_meet: true,
  google_event_id: "a7f1a39927c542449446e9991d7b7290",
};

describe("Google Calendar requests", () => {
  test("availability errors cannot masquerade as free slots", async () => {
    mockFetch(() => json({ calendars: { primary: { errors: [{ reason: "notFound" }] } } }));
    await expect(
      calendarBusy("test-token", new Date(booking.starts_at), new Date(booking.ends_at)),
    ).rejects.toThrow("availability could not be checked");
  });
  test("reads primary-calendar busy periods", async () => {
    const busy = [{ start: booking.starts_at, end: booking.ends_at }];
    mockFetch((url, init) => {
      expect(url).toEndWith("/freeBusy");
      expect(JSON.parse(init!.body as string).items).toEqual([{ id: "primary" }]);
      return json({ calendars: { primary: { busy } } });
    });
    expect(
      await calendarBusy("test-token", new Date(booking.starts_at), new Date(booking.ends_at)),
    ).toEqual(busy);
  });
  test("creates an invitation with timezone, attendees, Meet, and a stable ID", async () => {
    mockFetch((url, init) => {
      expect(url).toContain("sendUpdates=all");
      const event = JSON.parse(init!.body as string);
      expect(event.id).toBe(booking.google_event_id);
      expect(event.start).toEqual({ dateTime: booking.starts_at, timeZone: booking.lead_timezone });
      expect(event.attendees).toEqual([{ email: "guest@example.com" }]);
      expect(event.conferenceData.createRequest.requestId).toBe(booking.id);
      return json({ id: event.id });
    });
    expect((await sendCalendarInvite("test-token", booking)).id).toBe(booking.google_event_id);
  });
  test("retries recover the same event rather than sending another invitation", async () => {
    const methods: string[] = [];
    mockFetch((url, init) => {
      methods.push(init?.method ?? "GET");
      if (init?.method === "POST") return json({}, 409);
      expect(url).toEndWith(booking.google_event_id);
      return json({ id: booking.google_event_id, status: "confirmed" });
    });
    expect((await sendCalendarInvite("test-token", booking)).id).toBe(booking.google_event_id);
    expect(methods).toEqual(["POST", "GET"]);
  });
  test("expired Google authorization returns an actionable failure", async () => {
    mockFetch(() => json({}, 401));
    await expect(sendCalendarInvite("test-token", booking)).rejects.toThrow("Reconnect");
  });
  test("missing event is recoverable, permission errors are not treated as missing", async () => {
    mockFetch(() => json({}, 404));
    expect(await existingCalendarInvite("test-token", booking.google_event_id)).toBeNull();
    mockFetch(() => json({}, 403));
    await expect(
      existingCalendarInvite("test-token", booking.google_event_id),
    ).rejects.toBeInstanceOf(GoogleCalendarError);
  });
  test("cancelled event cannot be reported as successfully sent", async () => {
    mockFetch((_url, init) =>
      init?.method === "POST"
        ? json({}, 409)
        : json({ id: booking.google_event_id, status: "cancelled" }),
    );
    await expect(sendCalendarInvite("test-token", booking)).rejects.toThrow("cancelled");
  });
});
test("professional email flow creates a private calendar copy without personal-account notifications", async () => {
  mockFetch((url, init) => {
    expect(url).toContain("sendUpdates=none");
    expect(JSON.parse(init!.body as string).attendees).toEqual([]);
    return json({ id: booking.google_event_id });
  });
  await sendCalendarInvite("test-token", { ...booking, delivery_method: "gmail" });
});
