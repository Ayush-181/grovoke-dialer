# Preview Call Board with Slate & Blue and a focused calling workspace

Call Board needs a calmer, coherent interface and a calling workflow that lets
the user finish editing before moving to the next lead. This adds a separate
Slate & Blue prototype covering all eight main screens. Its Day/Night switch
adapts the same layouts and charts. The calling tab follows the user’s video
reference: a compact queue, central business context with an editable call guide,
and grouped outcomes/notes on the right. It supports ASK FOR,
Previous, explicit Save / Save & next, callback flags, and simulated conference
controls. Manual number entry reuses saved main/direct numbers or creates an
independent local contact. Conferences accept typed numbers for multiple business
decision makers, preserve the primary call and record participant history without
multiplying the business’s call count. Invalid, duplicate and do-not-call numbers
are blocked. Readable type, a compact header, independently collapsible navigation
and lead list, and integrated call/save controls keep the desktop calling panels
visible. Triage and booking buttons update their metrics and count Connected
once per call. Activity shows daily metrics with an IST date picker; Overview
keeps the approved four-card and three-panel layout, with a month dropdown
and a secondary yearly summary. Its original separate funnel shapes have
tighter gaps; the right-hand card contains independently scrollable appointment
and callback lists. Utility controls are merged into the main canvas. Sessions have
Start/Pause/Resume/Stop, elapsed working time, attributed calls and talk time.
Ending or saving a call produces inline feedback without popups. All screens use
the compact breadcrumb without hero headlines. Leads has a separate Worth a
callback view, opened directly by the dashboard’s callback View all control.

Booking opens inside the dialer, prefills the current lead from its draft and
preserves notes/participants during an active call. Saving the booking updates
Booked/Connected once. New controls include main/direct-number selection, redial,
hold/resume with held seconds excluded from talk totals, quick session startup,
queue views, phone copy and keyboard shortcuts guarded against fields/dialogs.
A global recording preference is captured by each new mock dial.

The original routes and provider code remain unchanged. The sandbox imports only
pure date/outcome/phone helpers and uses synthetic leads and a pure mock call adapter.
Its independent Vite entry is never mounted in the original app. Source copies
exclude dotenv and service credentials; the standalone HTML export blocks network
connections and can be reviewed without installing or signing into anything.

Review instructions, behavior and production integration boundaries are in
[docs/remake-design.md](../remake-design.md). Review the sandbox first; approval
of its appearance is separate from integrating or replacing the live application.

Validation:

- Original pure/mocked unit suite: 29 passing. Remake workflow/metrics suite: 24 passing.
- Type check, lint on changed files, isolated sandbox export and original app build.
- Guarded browser checks on the exported HTML: all screens at desktop/tablet/mobile
  widths, theme persistence, explicit saves, Previous, unsaved navigation, callback
  and never-called filters, dashboard callback navigation, validated manual dialing,
  per-business counters, multiple decision-maker conferences and participant history,
  keypad/mute, recording snapshots, headline removal,
  all hourly booking slots, deletion confirmation, session timers, date filters,
  milestone totals, collapsible panels, in-call booking preserving drafts, call
  guide editing, shortcut guards, hold/resume/redial, quick sessions and desktop
  scroll containment (including active calls on tablets).

Existing failure: repository lint, excluding the two vendored Twilio bundles,
reports 708 errors and 11 warnings, unchanged from the workflow baseline. No
remote SQL checks, migrations, real calls/invitations, deployment or merge ran.

Research limit: public product/help sites for Close, Aircall, JustCall and
PhoneBurner returned 403. The user video and established workflow patterns guide
this iteration; no current ranking or verified competitive parity is claimed.
