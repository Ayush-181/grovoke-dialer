# Preview the Call Board redesign in a disconnected sandbox

Call Board needs a calmer, coherent interface and a calling workflow that lets
the user finish editing before moving to the next lead. This adds a separate
Porcelain & Jade prototype covering all eight main screens. Its Day/Night switch
adapts the same layouts and charts; the three-column dialer supports ASK FOR,
Previous, explicit Save / Save & next, callback flags, and simulated conference
controls. Readable type, a compact header, independently collapsible navigation
and lead list, and integrated call/save controls keep the desktop calling panels
visible. Triage and booking buttons update their metrics and count Connected
once per call. Activity shows daily metrics with an IST date picker; Overview
defaults to a selectable month with a secondary yearly summary. Sessions have
Start/Pause/Resume/Stop, elapsed working time, attributed calls and talk time.
Ending or saving a call produces inline feedback without popups.

A global recording preference is captured by each new mock dial.

The original routes and provider code remain unchanged. The sandbox imports only
pure date/outcome helpers and uses synthetic leads and a pure mock call adapter.
Its independent Vite entry is never mounted in the original app. Source copies
exclude dotenv and service credentials; the standalone HTML export blocks network
connections and can be reviewed without installing or signing into anything.

Review instructions, behavior and production integration boundaries are in
[docs/remake-design.md](../remake-design.md). Review the sandbox first; approval
of its appearance is separate from integrating or replacing the live application.

Validation:

- Original pure/mocked unit suite: 29 passing. Remake workflow/metrics suite: 14 passing.
- Type check, lint on changed files, isolated sandbox export and original app build.
- Guarded browser checks on the exported HTML: all screens at desktop/tablet/mobile
  widths, theme persistence, explicit saves, Previous, unsaved navigation, callback
  and never-called filters, dial counter, conference/keypad/mute, recording snapshots,
  all hourly booking slots, deletion confirmation, session timers, date filters,
  milestone totals, collapsible panels and desktop scroll containment.

Existing failure: repository lint, excluding the two vendored Twilio bundles,
reports 708 errors and 11 warnings, unchanged from the workflow baseline. No
remote SQL checks, migrations, real calls/invitations, deployment or merge ran.
