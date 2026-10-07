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
  const wrap = (text: string) =>
    base64(text)
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? "";
  return [
    `From: Grovoke <${from}>`,
    `To: ${booking.attendees.join(",\r\n ")}`,
    `Reply-To: ${from}`,
    `Subject: ${encodedSubject(booking.title)}`,
    `Message-ID: <${uid}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap(
      `${booking.title}\n\n${booking.starts_at} to ${booking.ends_at} (UTC)\n\n${description}\n\nOpen the attached calendar invitation to see the time in your timezone.`,
    ),
    `--${boundary}`,
    "Content-Type: text/calendar; charset=UTF-8; method=REQUEST",
    "Content-Disposition: attachment; filename=invitation.ics",
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
