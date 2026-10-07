/** Supabase/PostgREST errors are plain objects, not necessarily Error instances. */
export function bookingErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object")
    return "Could not send the invitation. Please try again.";
  const fields = error as { message?: unknown; code?: unknown };
  const message = typeof fields.message === "string" ? fields.message : "";
  const code = typeof fields.code === "string" ? fields.code : "";
  if (
    (code === "PGRST204" || code === "42703") &&
    /invite_from|delivery_method|email_delivery_status|gmail_message_id/.test(message)
  ) {
    return "The professional-email database migration has not been applied, or the database schema cache is outdated. Apply drizzle/migrations/0001_professional_invites.sql in Lovable, refresh the schema cache, then try again. No invitation was sent.";
  }
  if (code === "PGRST205" || (code === "42P01" && /bookings/.test(message))) {
    return "The bookings table is unavailable. Apply the Bookings database migrations in Lovable before sending invitations.";
  }
  if (code === "42501") {
    return "Your account does not have permission to save this booking. Check your workspace membership and the bookings database policies.";
  }
  return message || "Could not send the invitation. Please try again.";
}
