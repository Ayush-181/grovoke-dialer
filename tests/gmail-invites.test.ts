import { afterEach, expect, test } from "bun:test";
import {
  buildInviteMime,
  GmailInviteError,
  sendGmailInvite,
  verifyInviteSender,
} from "../src/lib/gmail-invites";
const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});
const booking = {
  id: "a7f1a399-27c5-4244-9446-e9991d7b7290",
  title: "Demo ✓",
  starts_at: "2026-12-14T15:00:00Z",
  ends_at: "2026-12-14T15:30:00Z",
  lead_timezone: "America/New_York",
  attendees: ["guest@example.com"],
  notes: "Discuss goals\nand options",
  location: "Online",
  add_meet: false,
  google_event_id: "a7f1a39927c542449446e9991d7b7290",
};
test("invitation uses professional From, Reply-To, and calendar organizer", () => {
  const mime = buildInviteMime(booking, "ash@grovoke.com");
  expect(mime).toContain("From: Grovoke <ash@grovoke.com>");
  expect(mime).toContain("Reply-To: ash@grovoke.com");
  const section = mime
    .split("Content-Type: text/calendar")[1]!
    .split("\r\n\r\n")[1]!
    .split("\r\n--")[0]!;
  const ics = Buffer.from(section.replace(/\r\n/g, ""), "base64").toString();
  expect(ics).toContain("ORGANIZER;CN=Grovoke:mailto:ash@grovoke.com");
  expect(ics).toContain("UID:a7f1a399-27c5-4244-9446-e9991d7b7290@grovoke.com");
  expect(ics).toContain("DTSTART:20261214T150000Z");
  expect(ics).toContain("SUMMARY:Demo ✓");
  expect(ics).toContain("METHOD:REQUEST");
});
test("header injection and malformed recipients are rejected", () => {
  expect(() => buildInviteMime(booking, "ash@grovoke.com\r\nBcc: attacker@example.com")).toThrow();
  expect(() =>
    buildInviteMime({ ...booking, attendees: ["invalid"] }, "ash@grovoke.com"),
  ).toThrow();
});
test("sender must be verified in the connected Gmail account", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ sendAsEmail: "ash@grovoke.com", verificationStatus: "pending" }),
    )) as typeof fetch;
  await expect(verifyInviteSender("mock-token", "ash@grovoke.com")).rejects.toThrow("verify");
});
test("accepted alias can be used", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ sendAsEmail: "ash@grovoke.com", verificationStatus: "accepted" }),
    )) as typeof fetch;
  await verifyInviteSender("mock-token", "ash@grovoke.com");
});
test("sends MIME with the verified sender and returns Gmail receipt", async () => {
  globalThis.fetch = (async (_url, init) => {
    const raw = JSON.parse(init!.body as string).raw;
    expect(Buffer.from(raw, "base64url").toString()).toContain("From: Grovoke <ash@grovoke.com>");
    return new Response(JSON.stringify({ id: "sent-message" }));
  }) as typeof fetch;
  expect(await sendGmailInvite("mock-token", booking, "ash@grovoke.com")).toBe("sent-message");
});
test("explicit permission denial is a definite send failure", async () => {
  globalThis.fetch = (async () => new Response("", { status: 403 })) as typeof fetch;
  try {
    await sendGmailInvite("mock-token", booking, "ash@grovoke.com");
    throw new Error("Expected failure");
  } catch (e) {
    expect(e).toBeInstanceOf(GmailInviteError);
    expect((e as GmailInviteError).definiteFailure).toBe(true);
  }
});
test("network loss is ambiguous and cannot be automatically resent", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("network");
  }) as typeof fetch;
  try {
    await sendGmailInvite("mock-token", booking, "ash@grovoke.com");
    throw new Error("Expected failure");
  } catch (e) {
    expect(e).toBeInstanceOf(GmailInviteError);
    expect((e as GmailInviteError).definiteFailure).toBe(false);
  }
});
test("email includes formatted recipient time, IST, HTML, and a separate calendar attachment", () => {
  const mime = buildInviteMime(booking, "ash@grovoke.com");
  expect(mime).toContain("Content-Type: multipart/mixed");
  expect(mime).toContain('Content-Disposition: attachment; filename="invitation.ics"');
  const decodePart = (type: string) =>
    Buffer.from(
      mime
        .split(`Content-Type: ${type}`)[1]!
        .split("\r\n\r\n")[1]!
        .split("\r\n--")[0]!
        .replace(/\r\n/g, ""),
      "base64",
    ).toString();
  const plain = decodePart("text/plain"),
    html = decodePart("text/html");
  expect(plain).toContain("10:00 AM EST");
  expect(plain).toContain("8:30 PM IST");
  expect(plain).not.toContain("2026-12-14T15:00:00Z to");
  expect(html).toContain("Add to Google Calendar");
  expect(html).toContain("ash@grovoke.com");
  expect(html).toContain("dates=20261214T150000Z%2F20261214T153000Z");
});
test("email HTML escapes user-entered text", () => {
  const mime = buildInviteMime(
    { ...booking, title: '<img src=x onerror="alert(1)">', notes: "<script>alert(1)</script>" },
    "ash@grovoke.com",
  );
  const html = Buffer.from(
    mime
      .split("Content-Type: text/html")[1]!
      .split("\r\n\r\n")[1]!
      .split("\r\n--")[0]!
      .replace(/\r\n/g, ""),
    "base64",
  ).toString();
  expect(html).not.toContain("<img src=x");
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
});
