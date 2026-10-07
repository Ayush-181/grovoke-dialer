import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { calendarBusy, existingCalendarInvite, sendCalendarInvite } from "./google-calendar";
import { sendGmailInvite, verifyInviteSender, GmailInviteError } from "./gmail-invites";
import { overlapsBusy } from "./booking-time";

export type Booking = Tables<"bookings">;

export async function deliverBooking(token: string, booking: Booking): Promise<void> {
  // Recover a previous successful send before checking conflicts with our own event.
  let event = await existingCalendarInvite(token, booking.google_event_id);
  if (event?.status === "cancelled")
    throw new Error("This event was cancelled in Google Calendar. Create a new booking.");
  if (!event) {
    const start = new Date(booking.starts_at);
    const end = new Date(booking.ends_at);
    if (start.getTime() <= Date.now())
      throw new Error("This appointment time has passed. Create a new booking.");
    const busy = await calendarBusy(token, start, end);
    if (overlapsBusy(start, (end.getTime() - start.getTime()) / 60_000, busy)) {
      throw new Error(
        "Your Google Calendar is busy at this time. Choose another time for a new booking.",
      );
    }
    event = await sendCalendarInvite(token, booking);
  }
  let messageId = booking.gmail_message_id;
  if (booking.delivery_method === "gmail" && booking.email_delivery_status !== "sent") {
    if (
      booking.email_delivery_status === "sending" ||
      booking.email_delivery_status === "uncertain"
    ) {
      throw new Error(
        "This email’s delivery is uncertain. Check Gmail Sent mail before resending; automatic retry is stopped to avoid duplicate invitations.",
      );
    }
    if (!booking.invite_from) throw new Error("The professional invitation sender is missing.");
    await verifyInviteSender(token, booking.invite_from);
    const { error: lockError } = await supabase
      .from("bookings")
      .update({ email_delivery_status: "sending" })
      .eq("id", booking.id)
      .eq("workspace_id", booking.workspace_id)
      .eq("email_delivery_status", "not_sent")
      .select("id")
      .single();
    if (lockError)
      throw new Error(
        "This invitation is already being sent or needs delivery review. Refresh bookings before retrying.",
      );
    try {
      messageId = await sendGmailInvite(token, booking, booking.invite_from, event.hangoutLink);
    } catch (error) {
      const status =
        error instanceof GmailInviteError && error.definiteFailure ? "not_sent" : "uncertain";
      await supabase
        .from("bookings")
        .update({ email_delivery_status: status })
        .eq("id", booking.id)
        .eq("workspace_id", booking.workspace_id);
      throw error;
    }
  }
  const { error } = await supabase
    .from("bookings")
    .update({
      status: "confirmed",
      ...(booking.delivery_method === "gmail"
        ? { email_delivery_status: "sent", gmail_message_id: messageId }
        : {}),
      google_event_url: event.htmlLink ?? null,
      meet_url: event.hangoutLink ?? null,
    })
    .eq("id", booking.id)
    .eq("workspace_id", booking.workspace_id)
    .select("id")
    .single();
  if (error)
    throw new Error(
      booking.delivery_method === "gmail"
        ? "Gmail accepted the invitation but the receipt could not be saved. Check Sent mail; automatic resend is stopped to avoid duplicates."
        : "Google received the invitation, but its booking status could not be saved. Use Retry to sync it without sending a duplicate.",
    );
}
