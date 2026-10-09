# Call Board design preview

This is the user-approved **Porcelain & Jade** direction with the information
layout from the Ivory & Plum mockup. It lives outside the original TanStack
application. The original routes, auth gates, provider hooks, database schema,
and connected Lovable main branch are unchanged by this prototype.

## Review the interactive copy

The generated `.smoke-work/callboard-preview.html` is self-contained. Download it
and open it in a browser; it needs no provider account, credentials, dependencies,
or internet connection. Its content security policy blocks network connections.
If your browser restricts local HTML, run `bun run remake:preview` after exporting
and use the server's displayed port and `/remake/index.html` path.

To develop it from this branch:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run remake:dev
```

Open the local Vite server's `/remake/index.html` path. To export a new standalone
copy, run `bun run remake:export`. The command prints the output location.
`bun run remake:build` builds the sandbox without exporting the HTML. These
commands copy only an explicit source allowlist into `.smoke-work`, exclude dotenv
files, and clear inherited service credentials before starting Vite. The original
app's Vite configuration is not loaded. No new dependencies are required.

The preview uses fictional businesses, reserved example email addresses, and
555 phone numbers. Changes to leads, calls, sessions, profiles and bookings last
only for the current page session. **Reload resets demo data.** Day/Night mode and
the recording preference are the only saved local settings. No audio is captured.

## Approved design

- Warm porcelain canvas, white cards, forest navigation and restrained jade
  actions. Night mode uses charcoal/green surfaces, soft white text and lower
  saturation accents. Both modes use the same components and layout.
- Day/Night switch in the header and Settings; system preference on first visit,
  remembered manual choice thereafter. Native controls and chart colors adapt.
- Charts use slate blue, teal, jade, ochre and terracotta. Text, legends, stage
  values and percentages carry meaning alongside color. The funnel keeps its
  downward taper as one contiguous SVG, with shared edges between stages.
- Three-column calling workspace: searchable queue left, lead context and
  editable **ASK FOR** and call/save controls center, outcomes and milestones right.
  The global sidebar and lead queue collapse independently. Desktop/tablet keep
  the center and outcome panels visible without internal scrolling; only the lead
  queue scrolls. On shorter desktop screens, expanded contact/callback editors
  stay anchored over their section so they do not push the call controls below
  the viewport. Narrow phones stack panels with normal page scrolling.
- Visible focus, labelled controls, reduced motion, dialog focus management,
  scrollable tables, draft navigation warnings and explicit do-not-call protection.
- Existing React/Radix/lucide stack. The font stack prefers Manrope/Inter with
  system fallbacks; the offline preview uses installed fonts and loads no external
  font. Mono readouts use JetBrains Mono/system monospace.

## Calling flow

1. Pick a lead or open a session queue. Navigation never starts a call.
2. Edit **ASK FOR** name and role; expand it for direct number and email.
   Override the lead timezone in the header, beside its live clock.
3. Explicitly start a simulated dial. The counter increments once per attempt.
4. Mute, send keypad digits, add/remove simulated teammates, or end the conference.
   Removing a teammate leaves the original call active. Hang-up stays visible.
5. Choose an outcome and capture notes. Editing never advances. **Triage held**,
   **Appointment offered**, and **Appointment booked** update the current attempt’s
   metrics immediately. They require an actual simulated dial, and a call with
   overlapping milestones or a connected outcome counts only once in Connected.
   Other lead/contact edits still require Save. Milestones remain recorded if
   unsaved contact edits are discarded.
6. Toggle **Worth a callback**, optionally adding lead-local date/time and reason.
   This stays separate from the actual call outcome and creates no automatic call.
7. **Save** persists the draft without moving. **Save & next** persists it and opens
   the next lead without dialing. **Previous** revisits earlier leads. Save/advance
   are disabled during an active call. At the final lead, the queue completes.
   These controls live inside the main dialer, without a hovering footer. End call
   and Save use inline feedback and show no popup/toast.
8. Leaving an edited lead prompts Keep editing / Discard & continue / Save & continue.
   The browser also warns before reloading a dirty draft or active simulated call.

The global recording toggle applies to new dials. Each simulated call snapshots
the preference when starting; changing Settings does not change an active call.
Conferencing, recording, microphone selection, keypad and call logging use a pure
mock state adapter. They do not access a device, microphone, phone number or SDK.

## Screens and limits

| Screen     | Interactive preview                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Overview   | Selectable monthly metrics derived from the mock call log, contiguous colored funnel, daily chart, secondary expandable yearly summary, upcoming demo bookings                                   |
| Leads      | Search, outcomes, never-called (blank outcome), callbacks, selection, confirmed deletion, synthetic CSV mapping/import                                                                           |
| Dialer     | Compact three-column calling flow, collapsible queue/ASK FOR, inline call/save controls, milestone buttons, callback flag, mock conference/keypad                                                |
| Sessions   | Create a named queue, Start/Pause/Resume/Stop, elapsed working time (excluding pauses), talk time, calls, progress                                                                               |
| Activity   | Daily metrics and date selection in IST, filtered call log, outcomes, notes, durations and recording indicators                                                                                  |
| Bookings   | Editable `Ash x {business}` title, all 24 hourly slots, arbitrary time, duration, guests, notes/location/Meet, IST/US conversion, DST gap/fold handling, conflict checking, record-only deletion |
| Time Zones | Live clocks and comparing a chosen IST instant across US zones, including Arizona                                                                                                                |
| Settings   | Recording toggle, microphone preference, Day/Night, demo profile, integration setup explanation                                                                                                  |

Analytics aggregate the **same synthetic call records** shown in Activity. Dials
are logged at attempt start; durations update while the call runs. Daily, monthly
and annual periods use IST calendar dates and the attempt’s start timestamp.
An empty period shows zero, and overlapping milestones never duplicate a call
in Connected. Deleting a booking record does not erase its call milestone.

Starting a session opens its queue and starts the session timer without dialing.
Pause freezes elapsed time and blocks dialing; Resume keeps the selected lead
and its draft. Stop ends any active mock call and freezes elapsed time. A session
counts only attempts started while it is active; talk time sums those attempts.
Only one session can run at once. Restarting a stopped session retains its
cumulative elapsed total. Reload clears all demo sessions. No invitation is sent.
The original native Google Calendar invitation delivery is retained in the original
app; a Gmail alias still cannot change the Google Calendar organizer.

This is a design/workflow prototype, not a production replacement. Live auth,
workspace isolation, inbound/missed calls, provider availability, microphone/audio,
Twilio auto-dial orchestration, real recordings/playback, CSV uploads, secure
settings persistence and Google OAuth/invitations still belong to the original
application. After design approval, adapt these views to its existing services,
implement recording defaults on the server call path, and verify provider behavior
in a separately authorized test setup. Never replace production with this mock.

## Safe verification

```sh
bun run test:unit
bun run test:remake
bunx --no-install tsc --noEmit
bunx --no-install eslint src/remake remake/vite.config.ts tests/remake.test.ts scripts/remake*.mjs scripts/smoke-remake.js scripts/smoke-auth.mjs
bun run remake:export
```

For browser checks, keep `bun run remake:dev` running and use `bun run smoke:remake`.
For the actual standalone build, run `bun run remake:preview` and, in another
terminal, `bun run smoke:remake-export`. Both use the pinned isolated Playwright
CLI and committed config. Install request and WebSocket guards **before** navigation;
permit only local frontend GETs, block all provider traffic/mutations, and close
all sockets. An attempted local Vite development socket is closed and classified
as expected; all other sockets fail the check. No microphone permission is granted.

The smoke covers explicit save behavior, Previous, navigation drafts, saved ASK FOR,
callbacks, call counts, recording snapshots, conference/mute/keypad, 24 hourly
slots, bookings, session timers, milestone aggregation, IST period filters,
collapsible navigation/queue/contact details, desktop scroll containment, keyboard
focus, and every screen at 1280/768/390px.
Screenshots are synthetic and remain ignored under `.playwright-cli`.

Do not read dotenv, attach to an authenticated browser, enable live integrations,
call real numbers, run migrations, deploy, merge, or rewrite published history.
