# Call Board — Mac-style redesign: build guide

Audience: Codex (or any coding agent) working in this repo. Work **one phase at a
time**, stop after each phase, and open a PR per phase. Do not attempt all phases
in one run.

## 0. Ground rules (read first)

**Precedence.** `AGENTS.md` behaviour rules always win. This redesign overrides the
*visual* parts of `DESIGN.md` (flat light/blue look, "avoid new decorative
elevation", 0.7rem radius). Do not edit `DESIGN.md` until the owner confirms the
redesign (see Phase 6).

**Scope.** Only touch `src/remake/*` (the Call Board preview sandbox:
`remake.css`, `App.tsx`, `Dialer.tsx`, `pages.tsx`, …) and import the files in this
folder. Do not touch the TanStack app routes, `src/styles.css`, Supabase, Twilio or
server functions.

**Do not break** (from `AGENTS.md` / `DESIGN.md`):
- DTMF keypad stays visible during connecting / live / conferencing.
- Keep the active-call status and hang-up action visible at all times.
- Keep explicit mic selection, lead timezone overrides and DST gap/repeat handling.
- Bookings show lead-local date/zone **and** IST.
- Keep `do_not_call`, phone normalisation, session phone de-duplication, snake_case
  statuses/outcomes.
- Colour never carries meaning alone: pair it with text or an icon.
- Respect `prefers-reduced-motion`; keep focus rings, labels on icon-only buttons.
- Never initiate a call, SMS, CSV import or DB write while testing.

**Never read, print, copy or commit `.env`** or any token. (A `.env` is currently
committed on this branch of a public repo: the owner should rotate those keys and
remove the file; do not open it.)

**Verification** after every phase (from `package.json`):

```sh
bun install --frozen-lockfile --ignore-scripts
bun run test:remake
bun run lint
bunx --no-install tsc --noEmit
bun run remake:build
bun run remake:dev      # then open /remake/index.html in Day and Night
```

Record pre-existing failures separately. Do not reformat the repository.

## What is in this folder

| Path | Purpose |
| --- | --- |
| `tokens/mac-theme.css` | Re-maps the existing variables (`--canvas`, `--card`, `--jade` …) to the Mac palette for Day (`:root`) and Night (`:root[data-theme="night"]`). |
| `tokens/mac-overrides.css` | Restyles sidebar, nav, panels, buttons, badges, keypad, focus. Existing class names only. |
| `source/*.dc.html`, `source/canvas.json` | The 12 design boards (markup + inline styles). Reference only; they render inside Claude's design tool, not in a browser. |

The boards use invented data (names, numbers, rates). Never copy that data into the
app.

## Design language in one paragraph

macOS-native: frosted translucent sidebar, system blue accent, soft layered shadows,
large rounded corners (8 / 10 / 14 px), colour-tinted icons, mono font for phone
numbers, timers and times. Dark and light are equal citizens. Semantic colours:
blue = primary/active, green = success, amber = warning/callback, red = danger.

## Phase 1 — Tokens (lowest risk)

1. Copy `tokens/mac-theme.css` to `src/remake/mac-theme.css`.
2. In `src/remake/main.tsx`, import it **after** `./remake.css`:
   `import "./mac-theme.css";`
3. Run the verification block. Open every tab in Day and Night.

Expected result: the whole app recolours; nothing moves. Check text contrast on the
sidebar (it is now light and translucent in Day) and on primary buttons in Night
(an existing rule gives them dark text).

## Phase 2 — Shared components

1. Copy `tokens/mac-overrides.css` to `src/remake/mac-overrides.css` and import it
   after `mac-theme.css`.
2. Review block by block: sidebar, nav pill, panels, buttons, badges, keypad.
3. `remake.css` has stacked override layers; if a rule does not win, copy the more
   specific selector instead of using `!important`.

## Phase 3 — Dialer (`Dialer.tsx`, `.page-dialer`)

Reference boards: `Main.dc.html` (live call, dark), `Light.dc.html`,
`Dialer.dc.html` (interactive states + booking), `Floating.dc.html`.

- **Call card:** large mono timer, round controls (Mute, Hold, Speaker, Add call,
  Record), red End-call pill, 3×4 keypad always visible.
- **Owner feedback on the live-call hero (apply this, it overrides the board):** do
  not show *who* is being called as a hero element; show the **number** only, keep
  the existing **"Ask for"** block as it is, and place the live-call card in the
  position where the **call guide** is, keeping the call guide above it.
- **Lead and IST times side by side**, using the existing dual-time component
  (`.dual-time`); do not duplicate time logic.
- **Outcomes:** grouped chips (Connected / Not reached / Follow up) using existing
  `.outcome-*` classes; "Save & next" is the one primary button.
- **Worth a callback:** the app already has the flag and the Follow-ups page
  (`.callback-toggle`, `FollowUpsPage`). Only restyle it as an amber toggle on the
  live card and the wrap-up screen, wired to the **same existing flag**. Do not
  add a second data path.
- **Add call:** the existing "Dial & add to call" button is disabled when the call
  is not connected or is on hold. Show a one-line reason next to it instead of a
  silent grey button.

## Phase 4 — Overview (`pages.tsx`, `.page-overview`)

Reference: `Overview.dc.html`. Start-calling banner with "Next up", four stat cards
(`.stat`, `.stats-grid`) with trend, dials-per-day chart with today highlighted,
funnel (`.funnel-*`), follow-ups, week meetings, time-zone window status.

- Use **real data from the existing model** (`metrics.ts`, `model.ts`). Board
  numbers (49 dials/day, 80-dial goal, 9–11 AM window, Twilio rates) are placeholders.
- The balance panel should reuse the existing Twilio usage card's data.

## Phase 5 — Remaining screens

One PR each, in this order: Follow-ups, Leads, Time Zones, Sessions, Activity,
Settings. Then the floating dialpad and the ⌘K palette (`Palette.dc.html`; the app
already has `shortcuts.ts` and `cmdk`).

Known inconsistencies in the boards (fix in the app, do not copy): "GMT+5:30" should
read "IST"; lead names and outcome lists differ between boards, use the app's own.

## Phase 6 — Docs

After the owner approves the result: update `DESIGN.md` so future agents do not
revert the look (radius scale, elevation, sidebar, palette), and add a short entry
to `docs/remake-design.md`.

## Open questions for the owner (raise in the PR, do not guess)

1. Which outcomes count as "connected with owner" for the funnel/chart?
2. Real daily dial target and best calling window?
3. Should the Mac look also apply to the main TanStack app, or only to the remake
   preview?
4. Keep the product label "CALL BOARD" (yes unless told otherwise).

## Prompts to paste, one per run

- **Phase 1:** "Read `design/mac-redesign/CODEX_GUIDE.md` sections 0 and 1 only.
  Do Phase 1 exactly. Run the verification commands and report results."
- **Phase 2:** "Do Phase 2 of the guide. Change only `src/remake/mac-overrides.css`
  and its import. Report anything that did not take effect."
- **Phase 3:** "Do Phase 3 for `Dialer.tsx` and its CSS only. Follow the owner
  feedback bullet. Do not change call logic."
- **Phase 4+:** same pattern, one screen per run.
