import type { BusyPeriod } from "./booking-time";

const API = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

async function googleRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new GoogleCalendarError(
      response.status === 401
        ? "Google connection expired. Reconnect your calendar."
        : response.status === 403
          ? "Google Calendar denied access. Check calendar permissions and that the Calendar API is enabled."
          : "Google Calendar could not complete this request. Please try again.",
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

export async function calendarBusy(token: string, start: Date, end: Date): Promise<BusyPeriod[]> {
  const data = await googleRequest<{
    calendars: Record<string, { busy?: BusyPeriod[]; errors?: unknown[] }>;
  }>(token, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      items: [{ id: "primary" }],
    }),
  });
  const calendar = data.calendars["primary"];
  if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) {
    throw new Error("Calendar availability could not be checked. Reconnect and try again.");
  }
  return calendar.busy;
}

export type CalendarInvite = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  lead_timezone: string;
  attendees: string[];
  notes: string;
  location: string;
  add_meet: boolean;
  google_event_id: string;
};
export type CalendarEvent = {
  id: string;
  htmlLink?: string;
  hangoutLink?: string;
  status?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
};

/** Google accepts a deterministic base32hex ID: retries cannot send a second invite. */
export async function sendCalendarInvite(
  token: string,
  booking: CalendarInvite,
): Promise<CalendarEvent> {
  try {
    return await googleRequest<CalendarEvent>(
      token,
      "/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1",
      {
        method: "POST",
        body: JSON.stringify({
          id: booking.google_event_id,
          summary: booking.title,
          description: booking.notes,
          location: booking.location,
          start: { dateTime: booking.starts_at, timeZone: booking.lead_timezone },
          end: { dateTime: booking.ends_at, timeZone: booking.lead_timezone },
          attendees: booking.attendees.map((email) => ({ email })),
          ...(booking.add_meet
            ? {
                conferenceData: {
                  createRequest: {
                    requestId: booking.id,
                    conferenceSolutionKey: { type: "hangoutsMeet" },
                  },
                },
              }
            : {}),
        }),
      },
    );
  } catch (error) {
    if (!(error instanceof GoogleCalendarError) || error.status !== 409) throw error;
    const event = await googleRequest<CalendarEvent>(
      token,
      `/calendars/primary/events/${booking.google_event_id}`,
    );
    if (event.status === "cancelled")
      throw new Error("This event was cancelled in Google Calendar. Create a new booking.");
    return event;
  }
}

export async function existingCalendarInvite(
  token: string,
  id: string,
): Promise<CalendarEvent | null> {
  try {
    return await googleRequest<CalendarEvent>(token, `/calendars/primary/events/${id}`);
  } catch (error) {
    if (error instanceof GoogleCalendarError && error.status === 404) return null;
    throw error;
  }
}
