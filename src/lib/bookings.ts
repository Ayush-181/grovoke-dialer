import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { calendarBusy, existingCalendarInvite, sendCalendarInvite } from "./google-calendar";
import { overlapsBusy } from "./booking-time";

export type Booking = Tables<"bookings">;

export async function deliverBooking(token: string, booking: Booking): Promise<void> {
  if (booking.delivery_method === "gmail") {
    throw new Error(
      "This pending booking uses the retired email delivery method. Review its existing event and sent invitation before creating a new Google Calendar booking.",
    );
  }
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
  const { error } = await supabase
    .from("bookings")
    .update({
      status: "confirmed",
      google_event_url: event.htmlLink ?? null,
      meet_url: event.hangoutLink ?? null,
    })
    .eq("id", booking.id)
    .eq("workspace_id", booking.workspace_id)
    .select("id")
    .single();
  if (error)
    throw new Error(
      "Google received the invitation, but its booking status could not be saved. Use Retry to sync it without sending a duplicate.",
    );
}
