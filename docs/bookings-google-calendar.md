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

The browser uses Google Identity Services’ OAuth token flow. It requests Calendar event permissions, free/busy permissions, and the Google account’s email to identify which calendar is connected. Access tokens live only in memory; they are not written to browser storage or the database. Reconnect after expiry, reloading, or leaving the page. Disconnect revokes the connection.

Allow the browser to reach `accounts.google.com` and `www.googleapis.com`. If cloud browser network rules restrict these destinations, add them alongside the existing Supabase domain. Account consent happens in the user’s browser.

## Sending and recovery

Availability is checked on the connected account’s **primary** calendar and checked again before sending. It does not check guests’ calendars or other calendars in the account. Google Calendar does not offer an atomic availability-and-create operation, so another event added simultaneously can still overlap.

Clicking **Send invite** stores a pending booking in Supabase, creates a Google Calendar event with `sendUpdates=all`, and marks the booking confirmed. Google sends guests the invitation; each guest’s calendar displays its own local timezone. A unique, stable event ID makes retries safe after timeouts or a failed database status update. Pending invitations remain visible with **Retry sync**, available only to their creator. Reconnect the same Google account to retry.

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
