# Vertical phone card with direct number entry

Base: `codex/callboard-remake-2026-10-09`
Feature: `codex/phone-card-manual-dial-2026-10-15`

The old call strip spread controls horizontally and hid arbitrary-number entry
behind a dialog. The middle column now pairs existing lead context with a
vertical phone card: enter/paste any number or use its 3×4 keypad, then Call.
No lead-creation form is required. Existing normalized numbers reuse their lead;
new numbers get their own local record at dial time to isolate notes/outcomes.

The card retains mute, hold/resume, conference phone entry, hang-up, redial,
recording status and microphone choice. In-call keypad clicks and physical keys
focused inside the phone card send mock DTMF. The left queue and right outcome,
booking, callback and save panel retain their markup. A narrow center view can
switch between the phone and ASK FOR/guide without discarding the call.

Validation:

- 24 remake tests and 29 original pure/mocked tests passed.
- TypeScript and scoped ESLint passed.
- Scoped standalone production export passed.
- Guarded browser coverage: all eight screens at 1280/768/390, active conference
  and expanded contacts on laptop, booking during call, save/Previous, sessions,
  direct number entry/backspace/validation/suppression, Enter-to-dial, three-column
  keypad, keyboard/click DTMF, hold/resume, narrow context switch and tablet fit.
- No provider requests or browser errors. Screenshots and downloadable standalone
  artifact contain synthetic data only.

This remains the disconnected prototype. No live calling, audio, conferencing,
recordings, invitation delivery, databases, deployment or merge is included.
Previously recorded full-repository lint baseline (708 errors, 11 warnings) is
unrelated and was not rerun for this scoped change. Existing audited call/booking
metric issues are not claimed fixed by this UI change.

Review delivery: the draft PR body is prepared here. A read-only GitHub API check
returned Forbidden on 2026-10-15, so no PR was created. The standalone ZIP is
`.smoke-work/callboard-phone-card-preview.zip`; extract it and open the HTML.
