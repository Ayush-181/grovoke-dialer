# Bookings and Google Calendar

The Bookings tab supports a lead lookup or a manually entered appointment, weekday suggestions, custom dates/times, 15/30/45/60-minute durations, invitees, shared notes, location, and optional Google Meet. Select either IST or the invitee’s US timezone as the input timezone. Both full dates and times appear in the summary. US daylight saving is applied by IANA timezone rules; nonexistent times are rejected and repeated times offer both occurrences.

## Enable storage

Apply `drizzle/migrations/0000_bookings.sql` to the same Supabase project used by the application. Use your usual Lovable database migration deployment workflow. This adds the `bookings` table, index, and row-level security: workspace members read bookings and creators insert/update their own bookings. Existing tables are preserved.

This migration is included in the repository; it has **not** been applied to the hosted project by this change. Without it, the page shows a storage error and invites cannot be sent. Google credentials are never saved to this table.

## Configure Google

1. Create/select a project in Google Cloud Console and enable **Google Calendar API**.
2. Configure the Google Auth Platform consent screen. Include your app’s domain and support email. During testing, add the Google accounts that should connect as test users. Public production use may require Google verification for Calendar scopes.
3. Create an OAuth client with application type **Web application**.
4. Add the exact origins where this app runs under **Authorized JavaScript origins** (scheme, hostname, and port; no path). Include your deployed app origin. For local development, add `http://localhost:3000` and `http://127.0.0.1:3000` if used. Preview origins must be registered individually.
5. Set the public client ID as `VITE_GOOGLE_CALENDAR_CLIENT_ID` in deployment/environment settings. For local development, put it in the existing ignored `.env.local` file without overwriting other settings. Restart development or rebuild the deployed app after setting it. The value ends in `.apps.googleusercontent.com`; no client secret is needed or used.
6. Open Bookings, click **Connect Google Calendar**, choose the account whose primary calendar you want to use, and grant all requested permissions.

The browser uses Google Identity Services’ OAuth token flow. It requests Calendar event permissions, free/busy permissions, and the Google account’s email to identify which calendar is connected. Short-lived access tokens are retained in tab-session storage, scoped to the signed-in app user, so reloading or leaving and returning to Bookings preserves the active connection. They are never stored in the database. Reconnect after token expiry or closing the tab. Automatic renewal across token expiry requires a backend authorization-code flow with securely stored refresh tokens. Disconnect revokes the connection and clears its cached authorization. Signing out of the app also clears the cached Google authorization.

Allow the browser to reach `accounts.google.com` and `www.googleapis.com`. If cloud browser network rules restrict these destinations, add them alongside the existing Supabase domain. Account consent happens in the user’s browser.

## Sending and recovery

Availability is checked on the connected account’s **primary** calendar and checked again before sending. It does not check guests’ calendars or other calendars in the account. Google Calendar does not offer an atomic availability-and-create operation, so another event added simultaneously can still overlap.

Clicking **Send invite** stores a pending booking in Supabase, creates a Google Calendar event with `sendUpdates=all`, and marks the booking confirmed. In native Google Calendar mode, Google sends guests the invitation; each guest’s calendar displays its own local timezone. Professional email mode is described below. A unique, stable event ID makes retries safe after timeouts or a failed database status update. Pending invitations remain visible with **Retry sync**, available only to their creator. Reconnect the same Google account to retry.

Upcoming and past bookings are paginated. “Invite sent” means Google accepted the event; it does not indicate attendee acceptance or email delivery. Bookings are snapshots: changes/cancellations made directly in Google Calendar are not automatically synced back. Open the event in Google Calendar to reschedule or cancel. Google Meet creation depends on the connected account’s capabilities; Google may populate its link asynchronously. Open the calendar event if the link has not appeared in the table.

## Validation

From the checkout:

```sh
npm run build
node_modules/.bin/tsc --noEmit
/workspace/.onboarding-tools/node_modules/.bin/bun test tests/bookings.test.ts
```

The tests cover IST/US date rollover, seasonal offsets, DST gaps/folds, Arizona, duration conflicts, Google error handling, invitation payloads, and retry deduplication. They mock Google requests and do not send real invitations.

After configuration and migration deployment, use a test Google account to confirm an existing busy event disables overlapping slots, then submit a future appointment to a test invitee. Verify the event time in both zones, invitation receipt, and that retrying after a failed status save reuses the same event. Hosted migration, real OAuth consent, and actual invitation delivery require configured access and have not been validated locally.

## Configured deployment

The public Google OAuth client ID is configured in the tracked `.env` as `VITE_GOOGLE_CALENDAR_CLIENT_ID` for `https://grovoke-dialer.lovable.app`. This is a public browser identifier, not a client secret. Register `https://grovoke-dialer.lovable.app` as an Authorized JavaScript origin in this Google OAuth client. Preview origins need separate registration. A deployment environment value with the same name overrides `.env`; ensure any existing override uses the intended client ID. Rebuild and publish in Lovable after syncing this change.

## Professional invitation sender

Google sends invitations from the connected account’s primary calendar. To use a professional Google Workspace email, choose **Change account**, reconnect, and select that Workspace account. Add it to Google OAuth test users if the app is in Testing. A non-Google address or email alias cannot replace the organizer by editing booking details. Use a calendar owned by the professional account or a separate email-delivery integration. Existing bookings remain associated with the account originally used.

## Enable ash@grovoke.com professional invitations

`VITE_BOOKING_INVITE_FROM=ash@grovoke.com` enables Gmail-based invitations. The Google account you connect must have that exact address verified under Gmail Settings → Accounts and Import → Send mail as. The app verifies the alias through Gmail before allowing the connection.

1. Enable **Gmail API** in the same Google Cloud project as the OAuth web client.
2. Add these permissions to Google Auth Platform → Data Access:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.settings.basic`
3. Apply `drizzle/migrations/0001_professional_invites.sql` through Lovable’s migration deployment workflow. This adds sender and delivery-receipt fields without changing old bookings.
4. Rebuild and publish in Lovable. Reconnect once to grant the new Gmail permissions using the account that owns the verified alias. Your old calendar-only session is intentionally invalidated when the required permissions change.

New invitations are emailed through Gmail with From, Reply-To, and the `.ics` calendar organizer set to `ash@grovoke.com`. Guests can add the standard calendar invitation to Google Calendar, Outlook, or other compatible calendars. The app stores a separate private copy on your connected Google Calendar with no attendee notifications from your personal account. Google Meet, if enabled, is still hosted by that Google account. The app does not automatically process guest RSVP emails or synchronize cancellations/rescheduling of these email invitations. Existing native Google Calendar bookings keep their original delivery method.

Email delivery is different from Google event creation: Gmail has no send-idempotency key. The app claims each pending email before sending and stores Gmail’s receipt. Explicit rejected requests can be retried. On a timeout, an ambiguous failure, or a failed receipt save, it stops automatic resends and asks you to review Gmail Sent mail. Reconcile the booking’s delivery status in the database after checking delivery instead of blindly sending a duplicate.

Authorization survives same-tab reloads until the short-lived Google access token expires. This change does not implement backend refresh-token storage or automatic renewal across expiry. Gmail API, hosted migration deployment, and actual professional-email delivery require your deployment settings and are not verified by local mocked tests.
