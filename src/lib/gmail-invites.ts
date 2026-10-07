import { displayBookingTime } from "./booking-time";
import { HOME_ZONE, zoneDef } from "./timezones";
import type { CalendarInvite } from "./google-calendar";
export const GMAIL_INVITE_SCOPES =
  "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.settings.basic";
export class GmailInviteError extends Error {
  constructor(
    message: string,
    public definiteFailure: boolean,
  ) {
    super(message);
    this.name = "GmailInviteError";
  }
}
async function gmailRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GmailInviteError(
      "Gmail delivery could not be confirmed. Check Sent mail before sending again.",
      false,
    );
  }
  if (!response.ok)
    throw new GmailInviteError(
      response.status === 403
        ? "Gmail denied access. Enable Gmail API and reconnect with email permissions."
        : "Gmail rejected the invitation. Check your connection and verified sending alias.",
      response.status >= 400 && response.status < 500,
    );
  return response.json() as Promise<T>;
}
export async function verifyInviteSender(token: string, from: string): Promise<void> {
  const alias = await gmailRequest<{ sendAsEmail: string; verificationStatus: string }>(
    token,
    `/settings/sendAs/${encodeURIComponent(from)}`,
  );
  if (
    alias.sendAsEmail.toLowerCase() !== from.toLowerCase() ||
    alias.verificationStatus !== "accepted"
  )
    throw new Error(
      `Add and verify ${from} in Gmail Settings → Accounts and Import → Send mail as before connecting.`,
    );
}
function base64(text: string): string {
  return btoa(
    Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""),
  );
}
function encodedSubject(text: string): string {
  const chunks: string[] = [];
  let chunk = "";
  for (const char of text.replace(/[\r\n]/g, " ")) {
    if (new TextEncoder().encode(chunk + char).length > 42) {
      chunks.push(`=?UTF-8?B?${base64(chunk)}?=`);
      chunk = "";
    }
    chunk += char;
  }
  if (chunk) chunks.push(`=?UTF-8?B?${base64(chunk)}?=`);
  return chunks.join("\r\n ");
}
const icsEscape = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
const utcStamp = (value: string) =>
  new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
function foldLine(line: string): string {
  let result = "",
    current = "",
    size = 0;
  for (const char of line) {
    const bytes = new TextEncoder().encode(char).length;
    if (size + bytes > 75) {
      result += current + "\r\n";
      current = " ";
      size = 1;
    }
    current += char;
    size += bytes;
  }
  return result + current;
}
export function buildInviteMime(
  booking: CalendarInvite,
  from: string,
  meetUrl?: string | null,
): string {
  const validEmail = (email: string) =>
    /^[^\s@<>\r\n,;]+@[^\s@<>\r\n,;]+\.[^\s@<>\r\n,;]+$/.test(email);
  if (
    !validEmail(from) ||
    !booking.attendees.length ||
    booking.attendees.some((email) => !validEmail(email))
  )
    throw new Error("Invalid invitation email address.");
  const uid = `${booking.id}@${from.split("@")[1]}`;
  const description = [booking.notes, meetUrl ? `Meeting link: ${meetUrl}` : ""]
    .filter(Boolean)
    .join("\n\n");
  const calendar =
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Grovoke//Bookings//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      "SEQUENCE:0",
      `DTSTAMP:${utcStamp(new Date().toISOString())}`,
      `DTSTART:${utcStamp(booking.starts_at)}`,
      `DTEND:${utcStamp(booking.ends_at)}`,
      `SUMMARY:${icsEscape(booking.title)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      `LOCATION:${icsEscape(booking.location || meetUrl || "")}`,
      `ORGANIZER;CN=Grovoke:mailto:${from}`,
      ...booking.attendees.map(
        (email) => `ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:${email}`,
      ),
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(foldLine)
      .join("\r\n") + "\r\n";
  const boundary = `grovoke_${booking.id.replace(/-/g, "")}`;
  const alternative = `${boundary}_body`;
  const wrap = (text: string) =>
    base64(text)
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? "";
  const start = new Date(booking.starts_at),
    end = new Date(booking.ends_at);
  const localTime = `${displayBookingTime(start, booking.lead_timezone)} – ${displayBookingTime(end, booking.lead_timezone)}`;
  const indiaTime = `${displayBookingTime(start, HOME_ZONE)} – ${displayBookingTime(end, HOME_ZONE)}`;
  const duration = Math.round((end.getTime() - start.getTime()) / 60_000);
  const calendarUrl = `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: "TEMPLATE", text: booking.title, dates: `${utcStamp(booking.starts_at)}/${utcStamp(booking.ends_at)}`, details: `${description}\n\nOrganizer: ${from}`, location: booking.location || meetUrl || "", ctz: booking.lead_timezone })}`;
  const plain = `${booking.title}\n\nYou’re invited to an appointment with Grovoke.\n\nYour time (${zoneDef(booking.lead_timezone).label}): ${localTime}\nOrganizer’s time (IST): ${indiaTime}\nDuration: ${duration} minutes\nOrganizer: ${from}${booking.location ? `\nLocation: ${booking.location}` : ""}\n\n${description}\n\nAdd to Google Calendar: ${calendarUrl}\n\nFor Outlook, Apple Calendar, or another calendar, open the attached invitation.ics file. To reply, email ${from}.`;
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
    );
  const safeMeet = meetUrl && /^https:\/\//i.test(meetUrl) ? meetUrl : null;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#172033"><table role="presentation" style="width:100%;padding:28px 16px"><tr><td><table role="presentation" style="width:100%;max-width:560px;margin:auto;background:white;border:1px solid #e2e7ee;border-radius:16px"><tr><td style="padding:28px"><p style="margin:0 0 12px;color:#2463eb;font-size:12px;font-weight:bold;letter-spacing:2px">GROVOKE · APPOINTMENT</p><h1 style="margin:0 0 10px;font-size:24px">${escape(booking.title)}</h1><p style="color:#64748b">You’re invited. Here are your appointment details.</p><div style="padding:18px;background:#f1f5ff;border-radius:10px"><p style="margin:0 0 8px;font-size:12px;color:#64748b">YOUR TIME · ${escape(zoneDef(booking.lead_timezone).label.toUpperCase())}</p><p style="margin:0 0 14px;font-weight:bold">${escape(localTime)}</p><p style="margin:0;font-size:12px;color:#64748b">Organizer’s time · ${escape(indiaTime)}<br>${duration} minutes</p></div><p><strong>Organizer:</strong> <a href="mailto:${escape(from)}">${escape(from)}</a></p>${booking.location ? `<p><strong>Location:</strong> ${escape(booking.location)}</p>` : ""}${booking.notes ? `<p style="white-space:pre-wrap">${escape(booking.notes)}</p>` : ""}${safeMeet ? `<p><a href="${escape(safeMeet)}" style="color:#2463eb">Join Google Meet</a></p>` : ""}<p style="margin:24px 0"><a href="${escape(calendarUrl)}" style="display:inline-block;padding:12px 18px;background:#2463eb;color:white;border-radius:8px;text-decoration:none;font-weight:bold">Add to Google Calendar</a></p><p style="font-size:12px;color:#64748b">Using Outlook or Apple Calendar? Open the attached invitation.ics file. Reply to this email to contact your organizer.</p></td></tr></table></td></tr></table></body></html>`;
  return [
    `From: Grovoke <${from}>`,
    `To: ${booking.attendees.join(",\r\n ")}`,
    `Reply-To: ${from}`,
    `Subject: ${encodedSubject(booking.title)}`,
    `Message-ID: <${uid}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    "",
    `--${alternative}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap(plain),
    `--${alternative}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap(html),
    `--${alternative}--`,
    "",
    `--${boundary}`,
    'Content-Type: text/calendar; charset=UTF-8; method=REQUEST; name="invitation.ics"',
    'Content-Disposition: attachment; filename="invitation.ics"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap(calendar),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
export async function sendGmailInvite(
  token: string,
  booking: CalendarInvite,
  from: string,
  meetUrl?: string | null,
): Promise<string> {
  const raw = base64(buildInviteMime(booking, from, meetUrl))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const result = await gmailRequest<{ id: string }>(token, "/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw }),
  });
  if (!result.id)
    throw new GmailInviteError(
      "Gmail returned no delivery receipt. Check Sent mail before sending again.",
      false,
    );
  return result.id;
}
