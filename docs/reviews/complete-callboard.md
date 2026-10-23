# Call Board functional candidate — 23 October 2026

The redesigned workspace now has durable records and explicit service boundaries. It retains the approved dashboard, slim navigation, day/night themes, and three-column calling workspace. The Overview recent-activity panel is removed; Activity remains the dedicated daily call log. Automatic callback suggestions are excluded.

Branch: `codex/complete-callboard-2026-10-23`.
Base: `bb15643`, the approved Dashboard V14 refinement. The original application routes remain available. Nothing has been deployed or merged.

## Review the disconnected copy

Run `bun run remake:export`, then `bun run remake:preview`, and open `http://127.0.0.1:4175/remake/index.html`. Alternatively extract the delivered preview ZIP and open `callboard-preview.html` in Chrome or Edge. The HTML is self-contained, uses synthetic fixtures, and blocks network connections with its content security policy.

Changes save in this browser. Data → Export full backup provides a portable JSON snapshot; restore replaces records only in the disconnected copy. Browser storage can be unavailable for local files: the UI reports this and preserves an unreadable previous snapshot instead of overwriting it. Local reload pauses sessions and recovers an ended call/draft; it never restarts a call.

## Implemented workflows

| Area | Behavior |
| --- | --- |
| Overview | Monthly selector, comparable metrics, original multicolor chart/funnel, independently scrolling appointments and manually flagged callbacks, collapsed yearly summary; no recent-activity feed. |
| Leads | Add/edit/delete, search, paging, selectable standard/custom columns, stage/outcome filters, separate Worth a callback view linked from Overview. Never called requires zero attempts and blank outcome; No outcome also includes attempted calls awaiting disposition. |
| ASK FOR | Primary name/role and collapsible details; multiple business contacts with roles, direct numbers and email. Select a contact number without creating another business. |
| Dialer | Vertical phone card, direct arbitrary numbers, normalization and permanent do-not-call protection, Previous, Save, Save & next. Typing and selecting outcomes never advance the queue. Normal call end/save uses inline status. |
| Call controls | Provider-acknowledged mute, hold/resume, add/remove decision makers, primary/additional leg states, end and recording preference for future calls. Every attempted dial gets one log/counter increment. |
| Metrics | Ringing, talk and hold tracked separately; triage/offered/booked contribute to connected metrics without counting the same call twice. Historical booked achievements survive record-only booking deletion. |
| Sessions | Deduplicated queues; start/pause/resume/stop, elapsed session time distinct from talk time. No automatic dialing. |
| Activity | Selected-day metrics, search, recording filter, saved notes/outcomes and participant details. Authenticated recording media loads on explicit request after a provider recording is available. |
| Follow-ups | Manually schedule/reschedule/complete/cancel; overdue/today/upcoming in IST; timezone/DST validation. Terminal/suppressed leads do not receive pending follow-ups. These are reminders, not auto-calls. |
| Scripts | Opener/gatekeeper/voicemail templates, duplicate/edit/delete, field insertion, rendered lead preview and unresolved-value warnings. Available in the call guide. |
| Pipeline/fields | Editable/reorderable stages with outcome bindings and deletion safeguards; text, number, date, select, checkbox and URL fields shared by leads/import/export. |
| Bookings | Every hour plus custom time, IST/invitee basis, DST handling, conflict checks, in-call booking preserving draft; title defaults to Ash x business. Native Google Calendar invitations, deterministic event IDs for retries, calendar/Meet links, location and guest fields. Delete removes only the app record. |
| Data | CSV/XLSX first-sheet parsing, column mapping, normalized row review, duplicate/suppression checks, add-only/fill-blank modes, batch counts, formula-safe CSV, validated portable JSON backups. |
| Settings | Persisted per-user workspace label/profile/microphone/recording preference, day/night toggle, real connection states, original-app link and sign-out. |

## Existing backend and integrations

The new `/callboard` route uses the existing AuthProvider, workspace membership, Supabase tables, Twilio configuration/token signing and Google Calendar OAuth hook. It does not seed demo records into a connected workspace. Loading errors and an absent migration block entry explicitly.

`src/remake/live/repository.ts` pages scoped legacy tables, checks the workspace document revision before/after loading, and saves transitions through one workspace-scoped revision-checked RPC. Concurrent stale saves fail visibly without overwriting newer records. Advanced contacts/configuration/follow-up metadata is additive. Personal profile and microphone defaults are selected by authenticated user. Logs use the existing insert-only call-count trigger; retries update the same log ID. Session queue membership and normalized numbers are synchronized.

Review-only migration: `drizzle/migrations/0007_callboard_workspace_state.sql`. It adds the workspace state document, its RLS/transaction function, and a service-only voice-attempt registry. **It has not been applied or execution-tested.** Existing migrations and table definitions must be present. Do not apply this automatically to the published workspace.

The new server voice commands authenticate membership and call-attempt ownership, check canonical suppressed numbers (including additional contacts) with bounded paging, and control only that attempt’s provider legs. TwiML and recording callbacks validate Twilio signatures and account/attempt association. Recording URLs are validated before storage. Provider credentials stay server-side.

The existing `/api/public/twiml/voice` delegates to the new handler only when the redesigned phone supplies its explicit workspace/attempt parameters. Original-dialer requests keep their existing behavior. Reuse the existing TwiML application pointing to that endpoint on the candidate’s public HTTPS origin; separate candidate credentials/application configuration may be appropriate when evaluating another host. No provider configuration was read or changed during this work.

Google uses the existing frontend OAuth client configuration and connected account. Native Calendar determines the organizer; a Gmail sending alias cannot override it. Calendar sends no additional organizer-time prose. Valid unexpired Google sessions survive reload; this hook still requires reconnection when its access token expires. Calendar event creation and database persistence are separate operations; the form reports partial success and retries the same event ID rather than creating a second invitation.

## Material limitations before a live rollout

- In-call DTMF is deliberately disabled for this conference topology: SDK tones on the browser leg cannot be represented as verified IVR delivery. Manual number entry and the disconnected keypad work. A provider-supported direct-call/DTMF path needs implementation and controlled media testing before enabling live tones.
- Audio/microphone registration, hold media, contact joining/removal, provider termination and recording delivery have not been exercised against Twilio. The provider core uses injected mocked ports; SDK lifecycle code was reviewed and compiled. This is a release candidate, not a verified live replacement.
- The SQL migration requires review and execution testing in a disposable database before adoption. No SQL tests/migrations were run against any database here.
- Native invitation delivery, Meet availability and mail placement require an authorized controlled acceptance test. No invitation/email was sent. An API response cannot establish inbox placement.
- Full JSON replacement is available in the disconnected copy only. It is explicitly disabled for connected workspaces; CSV add/fill and exports are implemented. This avoids presenting a multi-table live replacement as a safe backup restore.
- Revision checks coordinate redesigned clients. Writes made through the original application do not participate in this new document revision protocol; avoid concurrently editing the same workspace from both versions during acceptance testing.

## Verification

- `bun run test:unit`: 29 existing pure/mocked tests pass.
- `bun run test:remake`: 99 synthetic tests pass (479 assertions), including domain, data, template, state recovery, mapping and mocked voice/security tests.
- Full TypeScript check passes.
- Scoped lint for changed application/service/tests passes without errors or warnings.
- `bun run build:check`: full client/SSR/Nitro build passes in an explicit source allowlist copy without dotenv files or inherited service credentials. Generated route tree updated by the build.
- `bun run remake:export`: disconnected build/export passes.
- Existing guarded dialer smoke: three viewports, themes, explicit disposition/save, navigation, manual dialing, keypad, recording snapshot, multiple contacts, in-call booking, deletion, metrics, containment and timers; zero provider requests.
- `bun run smoke:remake-workflows`: configuration CRUD, scheduled callback, import review/confirmation and reload persistence, responsive 1440/768/390px and night keypad contrast; zero provider requests.
- Existing anonymous auth smoke passes after the documented cold optimizer retry. No authentication or form submissions.

Existing failures are separate: source/test lint on baseline `bb15643` and this branch both report **708 errors and 11 warnings** outside the new checked scope. Unrestricted `bun run lint` did not finish and was stopped after eight minutes; the bounded source/test comparison verifies no additional source lint failures. Build also retains existing inputValidator deprecation/plugin timing notices. No deployment, merge, real call, recording, conference, invitation, live import or live database write occurred.
