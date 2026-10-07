# Bookings and native Google Calendar invitations

The Bookings tab supports lead lookup or manual appointments, weekday suggestions, custom dates/times, 15/30/45/60-minute durations, invitees, notes, location, and optional Google Meet. Select IST or the invitee’s US timezone as the input timezone. The form shows both full dates and times to avoid scheduling mistakes. DST gaps are rejected and repeated times offer both occurrences.

## Invitation delivery

New bookings always create an event on the connected Google account’s primary calendar with the guests in `attendees` and `sendUpdates=all`. Google Calendar sends its own standard invitations. The app sends no separate Gmail, SMTP, or custom HTML/ICS email. Gmail sending permissions and the former `VITE_BOOKING_INVITE_FROM` setting are no longer used.

The event description contains only the notes you enter. The app does not add the organizer’s IST date/time summary to email or event details. Google controls the invitation’s layout and recipients’ calendar timezone display. Native Google invitations are not a guarantee against spam filtering.

Google identifies the connected calendar account as the organizer. A Gmail Send mail as alias does not change the Calendar organizer. To use a professional email as the Google organizer, connect a Google/Workspace account with a calendar owned by that address. The app banner shows the actual account used.

Existing records are preserved. Old pending bookings with delivery_method=gmail cannot be automatically resent; review any previously created calendar event and sent email before making a replacement booking. Old sent emails do not change when the application is updated.

## Google configuration

1. Enable Google Calendar API in your Google Cloud project.
2. Configure the OAuth consent screen and add testing accounts under Audience → Test users while in Testing.
3. Create an OAuth Web application client. Register the exact deployed origins under Authorized JavaScript origins. The published origin is `https://grovoke-dialer.lovable.app`. Preview/custom origins need their own entries. No redirect URI is required for the current popup token flow.
4. The public client ID is configured in tracked `.env` as `VITE_GOOGLE_CALENDAR_CLIENT_ID`. A deployment environment value overrides that file. No client secret is used.
5. Allow these scopes:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.freebusy`
   - `https://www.googleapis.com/auth/userinfo.email`
6. Rebuild/publish in Lovable and connect the desired calendar account in Bookings. Switching from the former professional-email mode requires reconnecting once; its cached permission marker is intentionally invalidated.

Short-lived authorization is cached in tab-session storage, scoped to the signed-in app user. It survives same-tab reloads and navigation until token expiry, usually about an hour. Closing the tab, disconnecting, signing out, or token expiry requires reconnection. Automatic renewal across expiry is not implemented; it would require a backend authorization-code/refresh-token flow.

## Database and deletion

Apply the checked-in Drizzle migrations using Lovable’s migration workflow. They create the bookings table, add historical sender/delivery fields, and grant creator-scoped deletion. This switch to native Calendar delivery requires no new migration.

Workspace members read bookings; creators insert/update/delete their own records while they remain workspace members. New records use delivery_method=google_calendar. A pending record is saved before event creation. The stable Google event ID permits retrying after a failed event response or status save without sending a second invitation.

Delete beside a row removes only its app record after confirmation. It does not cancel the Google Calendar event, remove it from guests’ calendars, or send cancellation emails. Cancel events separately in Google Calendar when needed. Keep booking dismisses the confirmation; a failed deletion leaves its error visible.

## Availability and limitations

Availability is checked on the connected account’s primary calendar, including a fresh check before sending. It does not check guests’ availability or other calendars. Google does not offer atomic availability-and-create, so simultaneous events can overlap. “Invite sent” means Google accepted the event, not that every guest received or accepted it. Edits, RSVP status, cancellations, and rescheduling performed in Google Calendar are not automatically synchronized back to the app. Google Meet creation may populate asynchronously.

## Validation

```sh
npm run build
node_modules/.bin/tsc --noEmit
/workspace/.onboarding-tools/node_modules/.bin/bun test tests/
```

Tests cover timezone rollover, DST transitions, overlaps, event payloads, native attendee notifications, exclusion of organizer timezone summaries, recovery without duplicates, retired-email guards, session restoration, and actionable database errors. Browser checks mock external APIs and send no real invitations. After publishing, use a test guest address to verify the actual Google-generated invitation.
