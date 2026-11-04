# Call Board Mac redesign

The approved handoff is preserved under design/mac-redesign. Implementation is
scoped to src/remake; the original application remains available.

## Visual system
Night defaults to charcoal surfaces (#1E1E22 / #28282D), with a Day variant.
Blue marks selection, green calling, amber callbacks and red hang-up/errors.
Text uses accessible role-specific colors, not the bright chart colors.
Sidebar: 224px expanded, grouped Workspace / Schedule / Setup navigation.
Header: 52px minimum, clocks, search, global Call, theme control.
Panels: 14px radius; sheets: 18px; keys: circular. System fonts precede Inter;
JetBrains Mono remains the numerical fallback. Reduced motion is respected.

## Connected behavior
- Command palette searches pages, leads and phone numbers; it only navigates or
  prefills. Ctrl/Command+K ignores input fields and existing dialogs.
- Floating dialpad shares App dispatch, provider actions and call state. It
  validates country-specific numbers, blocks DNC, shows explicit zones and hours,
  exposes the microphone, minimizes and closes without ending an active call.
- Inline conference panel retains duplicate, DNC, held-call and capability checks.
- Live-call callback toggle edits the existing draft flag; save to persist it.
  Follow-ups includes a group for flags without scheduled reminders and date tabs.
- Chart uses IST day boundaries and decisionMaker counts; hidden series rescale.
- Goal and scenario preferences survive backups. Balance is read-only from the
  authenticated Twilio usage function; seven-day usage is the last seven complete
  UTC days. Missing usage remains unavailable. Calling window is converted live.
- Time zone cards preserve the instant on re-anchoring; manual input pauses now,
  rejects DST gaps and explicitly resolves repeated times. Anchor is per identity.

## Verification
Run bun run test:remake, bun run test:unit, lint and TypeScript. Run
bun run build:check for an isolated full build with dummy credentials.
bun run remake:dev plus bun run smoke:remake checks all 11 destinations at
390/768/1280/1600px in both themes, plus chart, palette, dialpad, simulated call,
conference, callback and time-zone interactions. The browser blocks all provider
requests and mutations. No live calls, recordings or workspace writes are tested.

## Existing constraints and deliberate adaptations
- The live conference adapter explicitly lacks provider-verified prospect DTMF.
  The keypad stays visible and reports that limitation. Demo tones are tested.
- The current manualDial model creates a lead for a new number so persisted calls
  have an owner. The dialpad states this upfront; an optional-save ad-hoc model
  would require a separate persistence change.
- Native audio output remains under browser/OS control; there is no fake speaker
  toggle. Recording controls retain the provider's existing capabilities.
- No decorative window controls or invented metrics. Default goal 80 and Austin
  window 9–11 are editable. Callback scheduling remains optional. Balance is on
  Overview. Traffic-light decorations remain off.

Twilio category/date reference: https://www.twilio.com/docs/usage/api/usage-record
