# Call Board

================================================================================

                            Call Board

        Dark-Industrial B2B Power-Dialer CRM for Cold-Calling Local

                            Service Businesses

================================================================================

THE PROMPT

================================================================================

Build Call Board — a dark-industrial (Retool/Clay style) B2B power-dialer

CRM for cold-calling local service businesses. Use Lovable Cloud for the

backend and Twilio for voice. No web scraping, no contacts module.

Core concept:

    I import CSVs of leads into workspaces, organize them into calling

    sessions, and power through them with a browser-based auto-dialer that

    logs every call, recording, and outcome. I can also edit outcomes after

    the fact.

--------------------------------------------------------------------------------

VISUAL DIRECTION

--------------------------------------------------------------------------------

- Dark industrial UI — near-black surfaces (#0B0C0F, #14161B)

- Subtle borders, neon green accents (#22C55E)

- Inter for UI, JetBrains Mono for data/numbers

- Dense tables, not card-heavy dashboards

- Clay/Retool energy

--------------------------------------------------------------------------------

AUTH & WORKSPACES

--------------------------------------------------------------------------------

- Email/password auth via Lovable Cloud

- On signup, auto-create an organization/workspace

- All leads, sessions, calls, and logs are scoped to workspace_id

- Support workspace members

--------------------------------------------------------------------------------

LEAD MODEL

--------------------------------------------------------------------------------

A lead is a local-service business row with:

    business_name, phone, address, city, state, zip, website (optional),

    email (optional), notes (optional)

    status (snake_case):

        new, in_progress, completed, disqualified

    outcome (nullable, snake_case):

        connected_dm, connected_gk, connected_other, voicemail, busy,

        no_answer, bad_number, not_interested, do_not_call,

        callback_requested, appointment_set, dialed

    metadata_json — raw CSV preservation

- Deduplicate leads within a workspace by phone number (normalized)

- Import UI with column mapping, header detection, and a preview of the

  first 5 rows before import

--------------------------------------------------------------------------------

SESSIONS

--------------------------------------------------------------------------------

- Users create a calling session from filtered leads (by city, state,

  status, outcome, or custom search)

- Sessions have a status: pending, active, paused, completed

- Track progress

- Enforce session-level phone deduplication so the same number is not

  dialed twice in the same session

- Sessions show a "Next call" queue

--------------------------------------------------------------------------------

DIALER — TWO MODES

--------------------------------------------------------------------------------

1. Auto-dialer session page

   - Sequentially dials the session queue

   - Between calls, show a lead detail card with business info, previous

     call notes, and a quick-disposition bar

   - Start / Pause / Resume / Stop controls

2. Floating phone widget

   - Global dial pad that can call any number

   - Live call state: idle, connecting, live, conferencing

   - Call duration, mute/hangup/keyboard

   - DTMF keypad stays visible from the moment a call starts connecting

     through the entire call

--------------------------------------------------------------------------------

TIME ZONES

--------------------------------------------------------------------------------

Purpose: leads are spread across US time zones while the user is based in

India (IST). Misreading a lead's local time when booking an appointment on

a live call is a real risk, so time zone conversion needs to be fast and

impossible to misread — not a mental-math afterthought.

1. Time Zones page (its own route/tab, listed in nav)

   - An "anchor" zone selector (dropdown) + a date/time input bound to

     that zone's wall-clock time

   - A grid of zone cards, one per supported zone, each showing the

     converted time + date for the same instant, live-updating every

     second when following "now"

   - Clicking any non-anchor card immediately makes it the new anchor

     (same underlying instant, just re-anchored) — no separate "swap"

     button needed

   - A "Use Now" action resets the anchor time to the current instant and

     resumes live ticking (ticking stops the moment the user types a

     manual time, so they can compose a booking time without it drifting

     under them)

   - Supported zones: India (IST) — pinned first and visually marked as

     "Home" — Eastern, Central, Mountain, Arizona (no DST), Pacific,

     Alaska, Hawaii, London, Berlin, Dubai, Singapore, UTC

   - Each card shows: zone label, abbreviation, converted time (12-hour),

     converted date, and an "Anchor" or "Home" tag when applicable

2. Floating/compact variant

   - A small always-visible "IST ⇄ lead's zone" readout inside the

     floating phone widget and the auto-dialer session page, so the user

     doesn't have to leave the call flow to sanity-check a time before

     saying it out loud

   - This compact readout should auto-derive the lead's zone from the

     lead's state/area code when possible, defaulting to Central if

     unknown, with a manual override dropdown

3. Persistence

   - Remember the user's last-used anchor zone (per user, not per

     workspace) so the page opens on their usual reference zone next time

   - No server round-trip needed for the conversion itself — it's pure

     client-side date math, only the "last anchor" preference needs to be

     saved

--------------------------------------------------------------------------------

CALL HANDLING

--------------------------------------------------------------------------------

- Twilio browser client (Twilio Voice SDK)

- Outbound calls hit a TwiML endpoint that connects the browser to the

  dialed number

- Support conference bridge-in ("join me" mode)

- Use Web Audio API to generate a 440+480Hz ringback tone while connecting

- Capture and log: Twilio call SID, duration, recording URL, called_at

--------------------------------------------------------------------------------

CALL LOG

--------------------------------------------------------------------------------

A unified table showing all calls with columns:

    business name, phone, outcome, duration, recording (play button),

    transcript, called_at, session

- Server-side pagination and search

- Click a row to expand and show recording player + transcript

--------------------------------------------------------------------------------

OUTCOMES

--------------------------------------------------------------------------------

- Outcomes and statuses must be snake_case

- Disposition UI: one-click chips with human labels

      e.g. "Connected - DM" maps to connected_dm

- Allow editing a call's outcome after the fact from the call log

--------------------------------------------------------------------------------

DASHBOARD

--------------------------------------------------------------------------------

- Today / this week / this month call counts

- Unique leads touched

- Connection rate

- Daily calls chart

- KPIs should reflect unique leads and calls, not just totals

--------------------------------------------------------------------------------

SETTINGS

--------------------------------------------------------------------------------

- Workspace settings, user profile

- Twilio configuration (Account SID, Auth Token, Twilio phone number)

- Mic device picker so users can choose which input device Twilio uses

  (Bluetooth headsets connected after page load will otherwise be ignored)

- Default time zone anchor (used to seed the Time Zones page and the

  floating widget's compact readout)

--------------------------------------------------------------------------------

SEARCH & FILTERING

--------------------------------------------------------------------------------

- Global keyword search across leads (business name, phone, city, address)

- Lead list filtering by status, outcome, city, state, last called date

- Save filter presets to localStorage

--------------------------------------------------------------------------------

PERFORMANCE

--------------------------------------------------------------------------------

- Optimize for tens of thousands of leads

- Server-side pagination

- Materialized views if needed for dashboard stats

- Limit bulk operations

- No client-side processing of entire CSVs

--------------------------------------------------------------------------------

REQUIRED PAGES / ROUTES

--------------------------------------------------------------------------------

Dashboard, Leads, Sessions, Session Dialer, Call Log, Time Zones, Settings

Keep navigation minimal and dense.

--------------------------------------------------------------------------------

CRITICAL UX DETAILS

--------------------------------------------------------------------------------

- The DTMF keypad must stay visible from "connecting" through "live" and

  "conferencing" states — never disappear mid-dial

- Provide a microphone input selector in the dialer and widget settings so

  the active audio input device is explicit and selectable via

  Twilio device.audio.setInputDevice()

- Prevent auth-state redirect loops by waiting for auth initialization

  before route redirects

- All enums and statuses must be snake_case

- CSV import should be idempotent by phone number within a workspace

- Time zone conversion must never silently guess — if a lead's zone can't

  be derived from state/area code, show the manual override rather than

  defaulting silently

HOW IT WORKS / TECH STACK

================================================================================

--------------------------------------------------------------------------------

FRONTEND

--------------------------------------------------------------------------------

- React 18 + Vite 5 + TypeScript 5

- Tailwind CSS v3 (dark theme only, custom color tokens)

- shadcn/ui for base components (table, dialog, dropdown, select, button)

- TanStack React Query for server-state, pagination, and caching

- Recharts or Tremor for dashboard charts

- Twilio Voice SDK for browser calls

- Intl.DateTimeFormat for all time zone conversion/formatting (no moment.js

  or date-fns-tz dependency needed — native Intl with the IANA zone names

  listed above is sufficient)

--------------------------------------------------------------------------------

BACKEND

--------------------------------------------------------------------------------

- Lovable Cloud (Supabase under the hood)

- PostgreSQL

- Row Level Security (RLS) on every workspace-scoped table

- Supabase Edge Functions for Twilio TwiML and any server-side logic

- Supabase Storage for call recordings (or Twilio recording URLs)

--------------------------------------------------------------------------------

DATABASE TABLES (CORE)

--------------------------------------------------------------------------------

    workspaces         — org container

    workspace_members   — user/workspace membership

    leads               — imported business leads

    calling_sessions     — dial sessions

    session_leads        — junction with queue order and status

    dial_call_logs        — call records with outcome, recording,

                            transcript, SID

    call_transcripts       — transcript text (optional separate table)

    saved_filters           — optional filter presets

    user_preferences         — per-user settings incl. default time zone

                                anchor (small key/value table; not

                                workspace-scoped)

--------------------------------------------------------------------------------

INTEGRATIONS

--------------------------------------------------------------------------------

- Twilio Voice for outbound calls and recordings

- Lovable Cloud Auth (email/password)

- Optional: Twilio Voice Debugger for diagnosing one-way audio

--------------------------------------------------------------------------------

KEY LOGIC PATTERNS

--------------------------------------------------------------------------------

- Phone normalization: strip non-digits before dedup and before Twilio dial

- Session dedup: when building a session, only include the

  highest-priority lead per normalized phone

- Outcome editing: dial_call_logs has an outcome column that can be

  PATCHed after the call

- Mic selection: Twilio Device captures the default audio input at

  creation; always expose device.audio.availableInputDevices() and

  setInputDevice() so users can switch mics without refreshing

- Auth resilience: wait for auth state to load before routing decisions

  to prevent redirect loops

- Time zone math: derive a zone's UTC offset at a given instant via

  Intl.DateTimeFormat (format the instant in the target zone and in UTC,

  diff the two), then use a short iterative refinement (2–3 passes) to

  convert a typed wall-clock time back into a real UTC instant — this

  avoids DST edge-case bugs without pulling in a timezone library

================================================================================

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://grovoke-dialer.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7198bc9f-e384-4c87-b3ca-d374c8f8fa20).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
