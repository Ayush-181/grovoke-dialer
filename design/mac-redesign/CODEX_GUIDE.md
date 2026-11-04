# Call Board — Mac-style redesign: build guide for Codex

Owner: Ash (solo founder). Product label stays **CALL BOARD**. This folder is a *handoff*, not
application code. Nothing in `src/` was changed to create it.

> **Precedence (read first).** `AGENTS.md` says `DESIGN.md` wins on UI questions, and `DESIGN.md`
> describes a light/blue, 56px-nav, Linear-style system. Ash has explicitly approved this
> redesign as the **new direction for the `src/remake/` UI**. For visual decisions inside
> `src/remake/`, this guide supersedes the visual rules of `DESIGN.md` (palette, nav height, type
> sizes, elevation). Everything else in `AGENTS.md` still applies in full — especially *Safe
> boundaries* and the behaviour rules listed in §1. In the last phase, update `DESIGN.md` and
> `docs/remake-design.md` so the repo no longer contradicts itself. If anything here conflicts
> with a behaviour rule in `AGENTS.md`, **the behaviour rule wins** and you flag the conflict in
> the PR description.

---

## 0. What you are building, in one paragraph

A calmer, macOS-feeling skin for the existing Call Board UI (dark by default, light supported),
plus five small additive features that the design shows: a **floating dialpad** (dial any number,
even outside the lead list), a **⌘K command palette**, an **Add-call panel** with an explicit
Dial button, a **"Worth a callback" toggle on the live call**, and an **Overview upgrade**
(stacked daily chart, daily-goal ring, balance/spend panel). Most of the work is CSS tokens and
markup polish. Features come last and reuse existing logic.

## 1. Do-not-break list (behaviour)

Keep all of these exactly as they are today:

- `workspace_id` scoping, snake_case statuses/outcomes, phone normalisation (`dialNumber`,
  `src/lib/phone.ts`), session phone de-duplication, **do-not-call blocking**.
- DTMF keypad visible and active during connecting / live / conference.
- Explicit microphone selection and its display.
- Lead timezone overrides and **DST ambiguity handling** (`src/lib/timezones.ts`,
  `src/lib/booking-time.ts`). Unknown time zones must stay *visibly unknown* — never guessed.
- Navigation never starts a call. Server/client boundaries (`*.server.ts`, server functions).
- Keyboard focus, dialog focus management, labelled icon-only buttons, `prefers-reduced-motion`.
- The existing Day/Night switch (`data-theme="night" | "day"` on `<html>`, key
  `callboard-remake-theme`). Dark = `night`, light = `day`. Both must be pixel-complete.
- Never read/print/commit `.env`, tokens, real lead data or recordings. Use synthetic data.
  Never place calls, send SMS/invites, import CSVs or write to a live database while verifying.

## 2. Where the design lives and how to view it

- Design canvas name: **"Call Board Mac Redesign"** (Ash's Claude design file). It has 13 boards.
  Optional: if `design/mac-redesign/source/*.dc.html` exists, those are the exported boards.
  They need Claude's design runtime to render, so treat them as *code you can read for exact
  CSS/markup*, not as pages to open directly.
- Everything you need to build is transcribed here: tokens (§5), component recipes (§6), screen
  specs (§7), behaviour specs (§8). Where numbers differ between this guide and a board, the
  guide wins.
- `tokens/mac-theme.css` — drop-in token overlay (variables only).
- `tokens/new-components.css` — styles for the *new* components (all classes prefixed `mx-`).

### Boards → repo targets

| Board | Repo target |
|---|---|
| Dialer (idle/live/conference/wrap + booking sheet) | `src/remake/Dialer.tsx`, `Bookings.tsx` (`BookingDialog`), `remake.css`, `dialer-completion.css` |
| Floating dialpad | **new** `src/remake/FloatingDialpad.tsx` |
| ⌘K palette | **new** `src/remake/CommandPalette.tsx` (use `src/components/ui/command.tsx`) |
| Overview | `src/remake/pages.tsx` → `Overview`, `Analytics.tsx`, `components.tsx` (`Stat`) |
| Leads | `pages.tsx` → `LeadsPage`, `Contacts.tsx` |
| Sessions | `pages.tsx` → `SessionsPage` |
| Activity | `pages.tsx` → `ActivityPage`, `RecordingPlayback.tsx` |
| Time Zones | `pages.tsx` → `TimezonesPage` |
| Follow-ups | `pages.tsx` → `FollowUpsPage` |
| Settings | `pages.tsx` → `SettingsPage` |
| Sidebar + header | `src/remake/App.tsx` (nav array ~L58, shell JSX ~L385–520), `remake.css` |
| Bookings / Configuration / Data | **no board** — tokens only (Phase 1–2), nothing structural |

## 3. Working rules

1. Branch off `codex/complete-callboard-2026-10-23`. Suggested: `design/mac-redesign-impl`.
   The connected Lovable branch syncs on push — **never push to it, never force-push, never
   rewrite history.** Open a PR; do not merge.
2. `bun install --frozen-lockfile --ignore-scripts`. Do not add dependencies. Everything needed
   (Radix, lucide-react, cmdk via `ui/command.tsx`) is already installed.
3. One phase per commit group; one component at a time inside a phase. Do not reformat files you
   are not changing. Do not run Prettier on the whole repo.
4. Before Phase 1, record the baseline: `bun run test:remake`, `bun run lint`,
   `bunx --no-install tsc --noEmit`. Note pre-existing failures separately.
5. View changes with `bun run remake:dev` (synthetic data, no credentials). For automated browser
   checks follow `docs/codex-workflow.md` (`bun run smoke:dev` + `bun run smoke:remake`).
6. Icons: **lucide-react only**, one stroke width (1.8) and size (16px, 18px in nav). Do not hand
   draw SVGs. Fonts: Inter (UI) and JetBrains Mono (numbers) already ship — prefer the system
   stack first for the Mac feel: `-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, …`.

## 4. Phases

### Phase 0 — Prep (no visual change)
- Create the branch, install, record the baseline (rule 4).
- Read: `src/remake/remake.css` (`:root` and `[data-theme="night"]`, ~top 60 lines),
  `src/remake/App.tsx` shell, `Dialer.tsx` structure, `components.tsx`.
- **Acceptance:** baseline results written in the PR description.

### Phase 1 — Tokens (the biggest win for the least risk)
1. Copy `tokens/mac-theme.css` to `src/remake/mac-theme.css`.
2. Import it in `src/remake/main.tsx` *after* `remake.css` (and after the other remake CSS files).
3. The overlay re-maps the existing variables (`--canvas`, `--card`, `--raised`, `--text`,
   `--muted`, `--border`, `--jade`, `--jade-soft`, `--forest`, `--sidebar-*`, `--blue`, `--teal`,
   `--green`, `--amber`, `--coral`, `--red`, `--red-soft`, `--shadow`) to the new palette and adds
   new ones (`--accent-fill`, `--key`, `--line2`, `--purple`, …). Note: in this codebase
   `--jade` is the **primary blue** and `--forest` is the **sidebar background**.
4. Check every page in Day and Night. Fix only contrast/legibility regressions by adjusting
   tokens, not by adding page-specific overrides.
- **Acceptance:** all 11 nav destinations render in both themes with no unreadable text; no layout
  shifts; unit tests unchanged.

### Phase 2 — Shell (sidebar + header)
Target: `App.tsx` + `remake.css` (`.sidebar`, `.brand`, `nav a`, `.sidebar-bottom`, `.workspace-body`,
`.header-*`).
- Sidebar **224px**, frosted: translucent `--side`, `backdrop-filter: blur(40px) saturate(170%)`,
  1px right hairline.
- Brand: 32px rounded-9 gradient square with the phone glyph (lucide `Phone`), wordmark
  "Call Board" 14px/700 + tagline 11px muted. Keep `translate="no"`.
- Nav grouped under small labels: **Workspace** (Overview, Leads, Dialer, Sessions, Activity),
  **Schedule** (Bookings, Time Zones, Follow-ups), **Setup** (Configuration, Data, Settings).
  Items 30px high, radius 8, 13px/500; icons tinted with accent; **active** = filled
  `--accent-fill` with white text/icon. Counts (`Leads`, `Follow-ups`) as right-aligned mono 12px.
  Keep `aria-current`, tooltips and collapsed mode.
- Optional macOS traffic-light dots at the top of the sidebar: **decorative only** (`aria-hidden`,
  not clickable) and behind a `--mx-traffic-lights` CSS flag defaulting to off — fake window
  controls can confuse in a real browser.
- Header: **52px**, hairline bottom border, title 15px/650. Keep the existing IST/zone clocks but
  restyle as pills (28px high, radius 14, `--key` fill, mono value in `--text`).
- **Acceptance:** keyboard order unchanged, skip-link works, sidebar collapse/menu scrim still
  work at 390px and 768px.

### Phase 3 — Dialer (highest value screen)
Target: `Dialer.tsx` and its CSS. Do **not** change reducer actions or voice logic.
Layout (desktop): queue column **296px** | centre column | outcomes column (the repo already has
this 3-column structure — keep it).
- **Centre column order:** lead header + local/IST clock card → **Ask-for bar** (avatar, name,
  role, *Copy number*, *Manage contacts & fields*) → **Call guide** (4 step cards: Open, Hook,
  Ask, Close) → **Call card** below the guide.
- **Call card shows only the number**, not the callee name (Ash's explicit request). Left: state
  + number + timer; right: 3×4 keypad of round keys.
- States: `idle` (green **Call {first name}** pill, mic picker beside it, keypad disabled) →
  `connecting` (pulsing ring, amber "Connecting · ringback", Cancel) → `live` (waveform, 5 round
  controls Mute/Hold/Speaker/Add call/Recording, mic picker + red **End call**) → `conference`
  (participant chips with × to drop) → `wrap` (Redial / Save & next lead).
- Keypad stays enabled in connecting/live/conference (hard rule).
- **Add call (important):** the current modal (`Modal` "Add a participant", ~L1576) has a submit
  button labelled "Dial & add to call", but it is `disabled` whenever `!connected || working`
  with **no explanation** — which is why it can look like there is only a number field. Replace
  with an **inline panel in the call card**: number field + visible green **Dial** button +
  *Close*, one-line validation hint under the field, a "Ringing · you stay on the call" state with
  *Cancel*, and when Dial is disabled show *why* (e.g. "Resume the call first"). Keep all existing
  validation: `dialNumber`, duplicate-in-call check, do-not-call (`suppressedNumber`),
  `runtime.capabilities.conference`, held-call check, and the `perform({type:"participant"})`
  call. No quick-add chips with invented people; an optional "Recent" chip is fine.
- **Worth a callback on the live call:** the repo already has the flag (`lead.callback`, toggle
  in the outcome panel ~L1301). Add a **full-width toggle button in the call card** (live, conference
  and wrap) that dispatches the same `{type:"edit", patch:{callback: !lead.callback}}`. Off:
  dashed border, label "Worth a callback", sub "Add to Follow-ups". On: amber fill + check, sub
  "In Follow-ups · tap to undo". Do not create a second source of truth.
- Outcome panel: keep existing grouped outcomes (`OUTCOMES` in `src/lib/outcomes.ts`) as pill
  buttons (36px, radius 10); selected = accent soft fill + accent border + 3px ring.
- Booking sheet (`BookingDialog` in `Bookings.tsx`): restyle only — 620px sheet, radius 18, day chips,
  16 half-hour slots, lead-local time with IST under it, DST warning banner. Keep
  `bookingInstants`/`displayBookingTime` logic untouched.
- **Acceptance:** run through idle→connecting→live→conference→wrap in *simulated* mode;
  confirm DTMF works in each; confirm an unknown-zone lead still shows the explicit unknown state.

### Phase 4 — Overview
Target: `pages.tsx` `Overview`, `Analytics.tsx`, `components.tsx`.
- Four stat cards (`Stat`): icon tile 30px radius 8, label, value 30px mono/700, delta, sparkline.
- **Calling activity → dynamic stacked column chart.** Replace the grouped bars in
  `OverviewActivityChart` with one stacked column per day: segments **Dialed** (bottom, accent),
  **Connected with owner** (teal) and **Booked** (green/amber). Legend buttons toggle each series
  (hide = remove from stack and rescale axis). 7D / 14D segmented control. Hover dims other
  columns and shows exact values (also exposed via `aria-label`/`<figcaption>`). Derive from the
  existing `metrics()` per day; "Connected with owner" = the existing `CONNECTED_OUTCOMES` that
  reached the decision maker — confirm the exact outcome set with Ash if `metrics()` does not
  already separate it. Respect IST day boundaries as the current chart does.
- Funnel, week calendar and Follow-ups card: restyle only.
- **Daily goal ring + best-time hint** (optional, Phase 6 data work): a 76px SVG ring
  (dials today ÷ goal), "N dials to go", pace sentence. Needs two new *preferences* (default
  `dailyGoal: 80`, `bestFrom: 9`, `bestTo: 11` in Austin time) added to `model.ts`
  `preferences` and editable inline. Best-time line must be **computed** from those hours via
  `wallClockToInstant`/`formatTimeInZone` — never hard-code IST text.
- **Balance panel** (replaces any Usage table): see §8.4. Wire it to the existing
  `getTwilioUsage` server function (`src/lib/twilio.functions.ts`, already used by
  `src/components/TwilioUsageCard.tsx`). Show loading, "add your Twilio credentials" and error
  states distinctly from zero.
- **Acceptance:** chart totals equal `metrics()` totals for the same logs; toggling series never
  produces NaN heights on an empty month; empty states render.

### Phase 5 — Remaining screens (restyle + small structure)
- **Leads:** toolbar (search, status segmented control, filter), table with 54px rows
  (avatar, company/city, contact/role, phone mono, local time with open/closed dot, status chip,
  tries), 380px detail drawer on the right (Call now / Book / Edit, contact grid, call history,
  notes). Keep filters/sorting/import logic.
- **Sessions:** 4 stat cards, session table with outcome-mix bar (**add a legend**: Booked, Connected,
  Not reached), right panel for the live session (timer, dials/talked/booked, goal progress,
  "Austin closes at … ", Pause / Stop).
- **Activity:** call-log table + detail panel with recording player (waveform bars, play), outcome
  chips, transcript lines. Keep `RecordingPlayback` and the recording route untouched.
- **Time Zones:** six zone cards (IST home + ET, CT, MT, AZ, PT). Add **click-to-re-anchor**: the
  selected card becomes the anchor and every card's offset/day label recomputes; below, a 24-hour
  strip per US zone shows open hours (weekdays 9–5 local) with a "now" marker. Today the page
  has an IST-only anchor and a datetime compare field — keep that field.
  Show abbreviations as **IST**, not `GMT+5:30` (Intl returns the latter; map it explicitly).
- **Follow-ups:** tabs All / Today / Upcoming / Worth a callback; rows grouped by day; a
  **"Worth a callback · pick a time"** group for flagged leads with no date; detail pane with
  *Call now* (navigates to Dialer, never auto-dials), *Mark done*, reschedule options that show
  lead-local time + IST. Source data: leads with `callback` / `callbackAt` (already in the model).
- **Settings:** two-column cards (Audio, Twilio, Calling hours & time zones, Appearance) + a
  full-width usage/credits card. Rows are label+hint on the left, control on the right.
  Keep existing fields and validation; do not display secrets.
- **Bookings / Configuration / Data:** tokens only. No structural change.
- **Acceptance:** each page has loading/empty/error states intact; tables scroll deliberately at
  390px; no page-wide horizontal overflow.

### Phase 6 — New features (additive; each is its own commit + tests where logic exists)

**6a. Floating dialpad** — new `FloatingDialpad.tsx`, mounted once in `App.tsx`, toggled by a
**Call** button in the header (shows the running timer while a call is live and the pad is
closed). Reuse, don't re-implement: `dialNumber`, `deriveLeadZone`, the do-not-call helper from
`Dialer.tsx` (extract `suppressedNumber` into a shared function if needed), `OUTCOMES`,
`formatTimeInZone`. Spec in §8.1. It must go through the same `perform`/call pipeline the
Dialer uses; if the Dialer owns the call state, lift the minimum needed into context. Never
auto-dial on open.

**6b. ⌘K command palette** — new `CommandPalette.tsx` on `ui/command.tsx` (cmdk) inside a Radix
dialog. Groups: *Dial* (appears when the query looks like a phone number), *Leads*, *Pages*,
*Actions*. The existing `shortcuts.ts` deliberately ignores any `ctrl/meta` combination so it
cannot trigger call actions; keep that. Register ⌘K / Ctrl+K in **one** place (App level), only
when not typing in an input and no other dialog is open, and have it *navigate/prefill only*,
never place a call. "Dial …" opens the floating dialpad pre-filled.

**6c. Daily goal & best-time preferences, balance panel** — as in Phase 4, with real data from
`getTwilioUsage`.

- **Acceptance:** unit tests for the pure helpers (number parsing, hours check, pace/days-left);
  `bun run test:remake`, lint and `tsc` clean; no console errors; keyboard-only operation of
  dialpad and palette works; focus returns to the trigger on close.

### Phase 7 — Docs + QA
- Update `DESIGN.md` (new palette, 52px header, 224px sidebar, type scale, round keypad,
  stacked chart) and `docs/remake-design.md`. Remove statements that now contradict the build.
- Run the §9 checklist at 390 / 768 / 1280 / 1600 px in Day and Night.
- PR description: what changed per phase, screenshots (synthetic data only), baseline vs final
  test results, and the list of open questions below. **Do not merge, deploy or enable auto-merge.**

## 5. Token reference

| Token | Night (default) | Day |
|---|---|---|
| canvas / `--bg` | `#1E1E22` | `#F4F4F8` |
| root backdrop | `#18181B` + soft blue (top-left) and purple (bottom-left) radial glows | `#ECECF1` + softer glows |
| card / `--pane` | `#28282D` | `#FFFFFF` |
| raised / `--pane2` | `#303036` | `#F7F7FA` |
| sidebar `--side` | `rgba(38,38,48,.55)` | `rgba(246,246,250,.6)` |
| hairline `--line` / `--line2` | `rgba(255,255,255,.08)` / `.15` | `rgba(0,0,0,.08)` / `.14` |
| text / muted | `#F5F5F7` / `#ABABB4` | `#1D1D1F` / `#5F5F68` |
| accent / text-on-dark / fill | `#0A84FF` / `#6CB0FF` / `#0A6CE0` | `#007AFF` / `#0062CC` / `#0066D6` |
| accent soft / line / ring | `rgba(10,132,255,.2)` / `.6` / `.28` | `rgba(0,122,255,.1)` / `.5` / `.2` |
| green / text / soft | `#30D158` / `#5BE384` / `rgba(48,209,88,.16)` | `#28CD41` / `#0E7A2E` / `rgba(40,205,65,.15)` |
| red / fill / text / soft | `#FF453A` / `#D92D20` / `#FF8179` / `rgba(255,69,58,.16)` | `#FF3B30` / `#D1271B` / `#C9150B` / `rgba(255,59,48,.12)` |
| amber / text / soft | `#FF9F0A` / `#FFB840` / `rgba(255,159,10,.16)` | `#FF9500` / `#8F5000` / `rgba(255,149,0,.16)` |
| purple / teal | `#BF5AF2` / `#2CC4CE` | `#AF52DE` / `#1FB6C1` |
| key / segmented-on | `rgba(255,255,255,.08)` / `#3D3D45` | `rgba(0,0,0,.05)` / `#FFFFFF` |
| panel shadow | `0 1px 0 rgba(255,255,255,.05) inset, 0 14px 32px -16px rgba(0,0,0,.7)` | `0 1px 2px rgba(0,0,0,.05), 0 14px 28px -16px rgba(0,0,0,.2)` |

Status colours always pair with a text label or icon. Green = open/booked/primary call action,
amber = voicemail/callback/warning, red = bad number/not interested/end call, blue = selection.

**Type:** 13px body/controls; 15px page titles (650); 11px eyebrow labels (600, +.08em,
uppercase); 12px secondary; numbers/phones/timers in mono with tabular figures; big numbers
24–40px (650–700, tracking −.02em).
**Spacing:** 4/8/12/16/24; page gutter 20–28px; card padding 16–22px; gaps 12–16px.
**Radii:** panels 14; buttons 9; pills 12–14; keypad keys and Call/End pills fully round (30/26);
sheets 18; cards in hero 18–24.

## 6. Component recipes

- **Panel:** `--pane`, 1px `--line`, radius 14, panel shadow. Cards group metrics; avoid a card per cell.
- **Button:** 36px (30px `sm`), radius 9, 1px `--line2`, `--key` fill, 13px/500. **Primary:**
  vertical gradient `--accent → --accent-fill`, white text 600, soft accent glow. Disabled: 40% opacity + `not-allowed`.
- **Chip (`mb`):** 24–26px, radius 12–13, `--key` fill, 12px/500. Variants: green (open/booked),
  accent (info), amber (warning/callback), red (blocked/bad). Status dot 8px.
- **Segmented control:** 2px padding, radius 9, track `--key`, selected = `--segon` with 0 1px 3px shadow.
- **Avatar:** 34–36px circle, 12–13px/600 white initials on one of six deep gradients (indigo,
  teal, burnt orange, rose, green, slate). Named people always get a colour; gray is filler only.
- **Keypad key:** 60px round (radius 30), `--key`, digit 23px/500 with 10px letter-spacing sub-label.
- **Call pill:** 52px, radius 26, green (`#30D158` Night / `#1FA83A` Day with white text), 16px/650,
  green glow. **End call:** 48px, radius 24, `--red-fill`, white.
- **Round control (Mute/Hold/…):** 52px circle `--key`; active = accent fill; recording = red soft.
- **Table row:** 50–54px, hairline top border, selected row = accent soft + 3px inset accent bar; hover = `--key`.
- **Toggle:** 42×24 pill; on = green; knob 18px white.
- **Input:** 32–40px, radius 8–10, `--key` fill, 1px `--line2`; focus = accent border + 3px ring.
- **Toast:** pill, `--pane`, hairline, green dot, 600 weight, bottom-centre, auto-dismiss ~2.2s (`role="status"`).
- **Motion:** colour/opacity transitions ≤150ms only; ringing pulse and waveform wrapped in
  `@media (prefers-reduced-motion: no-preference)`.

## 7. Screen specs (summary)

Content width is whatever the viewport gives; the boards are 1600×1000 for reference.

- **Dialer** — see Phase 3. Queue items: 36px avatar, name, city, right-aligned status dot + text
  ("New", "Voicemail", "Callback"…). Selected item = accent soft + accent hairline.
- **Overview** — hero banner (greeting, *Start calling*, next-up lead) over four stat cards;
  below, 3 columns: *Calling activity* (stacked chart + YTD tiles) · *Conversation funnel* + week
  calendar · *Follow-ups* + *Balance*. **Keep the hero modest** (≈ 200px). The goal ring and
  best-time line fit best in the *Sessions* live panel or a small hero card; do not let the banner
  out-weigh the chart.
- **Floating dialpad** — 392px glass card (radius 26, blur 40), traffic dots optional, "Dialpad"
  eyebrow, minimise button; display well with country-code button (+1, +91, +44), 30px mono number,
  backspace, status chip; zone row; keypad; Call/Hang up; recents.
- **⌘K palette** — 680px glass sheet, 19px search field, grouped 44px rows, selected row filled
  accent with `↵` hint, footer with ↑↓/↵ hints and result count.

## 8. Behaviour specs

### 8.1 Floating dialpad logic
- **Number entry:** digits only; US/CA (+1) max 10 digits, displayed `(512) 555-0148`.
  Validation (NANP): area code and exchange cannot start with 0 or 1 → inline error.
  India (+91): 10 digits starting 6–9. UK (+44): 10 digits, no leading 0.
- **Zone:** derive via `deriveLeadZone(state, phone)` / area-code map. If `source === "unknown"`,
  show the amber *Unknown time zone — pick one* state with manual zone buttons (ET/CT/MT/AZ/PT)
  and treat calling hours as **unchecked** until chosen. Never silently default.
- **Hours:** open = weekday and 09:00 ≤ local hour < 17:00. If closed, show next open time and
  its IST equivalent ("Opens Mon 9:00 AM CST · 8:30 PM IST for you").
- **Match:** exact-normalised match against `lead.phone`/`lead.direct` → show "In your leads" +
  company; otherwise "Not in your leads · logged as an ad-hoc call".
- **Do-not-call:** blocked state, Call disabled, explanation shown.
- **Call:** same pipeline as Dialer. Keypad sends DTMF while connecting/live. After hang-up, show
  outcome chips (Connected, Voicemail, No answer, Wrong number — use `OUTCOMES` values) and an
  optional "Also save this number to my leads" (creates a lead through existing lead actions).
- **Minimise** to a 300×60 pill showing number/timer and a hang-up button; closing the pad during
  a call must not drop the call.

### 8.2 Command palette
Filter pages/leads/actions by substring (case-insensitive) and by digits for phone numbers;
when ≥ 3 digits typed and it looks like a number, show a *Dial …* row (valid only if a full
NANP/E.164 number). Arrow keys move selection, Enter runs, Esc closes. Running a lead opens it in
the Dialer **without dialing**.

### 8.3 Stacked chart data
For each IST day in range (7 or 14): `dialed = logs that day`, `connected = logs with an outcome in
the "reached the owner" set`, `booked = logs with a booking`. Stack order bottom→top: dialed,
connected, booked. Y axis max = ceil(max stacked height ÷ 4) × 4 over **visible** series.

### 8.4 Balance panel
Inputs (all from `getTwilioUsage` unless noted): `balance`, per-category spend over the last
7 days (calls, recording, transcription/AI — map Twilio categories), `callsPerDay`.
- Spend by use case: three rows (Calls · Call recording · AI transcripts) with $ and % of spend,
  plus one stacked bar.
- **Days left = floor(balance ÷ daily cost)**, where daily cost = average daily spend over the
  last 7 days (*7-day pace*), or goal-based (*At goal*): `dailyGoal × cost per dial`
  (cost per dial = 7-day spend ÷ 7-day dials). Show "Runs out about {date}".
- Chip colour: > 14 days green, ≤ 14 amber, ≤ 7 red. `dailyCost = 0` → "Set a rate" / "—".
- **Editable** (Ash's request): in the design, an *Edit* mode lets Ash type the balance and
  per-minute rates to model scenarios. In production, balance and spend are **read-only from
  Twilio**; keep the editable *scenario* fields (rates, pace source, daily goal) in local
  preferences and clearly label them "scenario". Do not write anything to Twilio.

## 9. QA checklist
- [ ] Night and Day: every nav destination, every modal/sheet, every table, empty/loading/error.
- [ ] Contrast ≥ 4.5:1 for text (muted text on cards included); status never colour-only.
- [ ] Keyboard: tab order, visible focus ring, Esc closes overlays, focus returns to trigger.
- [ ] 390 / 768 / 1280 / 1600 px: no page-wide overflow; tables scroll deliberately; touch targets
      trend to 44px on small screens.
- [ ] `prefers-reduced-motion` stops pulsing/waveform.
- [ ] Dialer: DTMF in connecting/live/conference; mic picker visible; unknown zone explicit; DNC blocked.
- [ ] Add call: Dial disabled states explain themselves; duplicate and DNC numbers rejected.
- [ ] Worth a callback from the call card appears under Follow-ups and matches the outcome-panel toggle.
- [ ] Booking sheet shows lead-local time + IST and warns across DST changes.
- [ ] `bun run test:remake`, `bun run lint`, `bunx --no-install tsc --noEmit`, `bun run build` (in an isolated copy, no `.env`).

## 10. Known gaps in the design — do **not** copy these
- All numbers in the boards are placeholders: usage, rates ($0.014/min calls, $0.0025/min
  recording, $0.024/min transcripts), the 49-dials/day average, the 80-dial goal, the 9–11 AM
  best window, lead names/phones. Use real data or synthetic fixtures.
- The design uses a fixed clock (Fri Oct 30 2026, 10:25 AM CDT / 8:55 PM IST). Compute times.
- Lead names/phones differ slightly between the palette, dialer and leads boards. The repo's own
  fixtures are the source of truth.
- Outcome lists differ between the floating dialpad (4) and Dialer (11). Use `OUTCOMES`.
- Static boards "Main" and "Light" are pictures: their Add-call button has no panel; use the
  interactive Dialer board's behaviour.
- Bookings, Configuration and Data have no board.
- Nothing in the design was rendered in a browser during authoring; expect small overflow/spacing
  fixes during Phase 1–5 and make them in tokens/CSS, not by changing behaviour.

## 11. Open questions for Ash (raise in the PR, don't guess)
1. Which outcomes count as **"Connected with owner"** for the stacked chart?
2. Real daily dial target and best calling window (defaults: 80, 9–11 AM CT).
3. Show decorative macOS traffic-light dots in the sidebar? (default: off)
4. Should "Worth a callback" prompt for a date when toggled on during a call, or stay optional?
5. Where should the Balance panel live if the Overview hero stays small — Overview column 3 or Settings only?

## 12. Ready-to-paste prompts
- **Phase 1:** "Read design/mac-redesign/CODEX_GUIDE.md §1, §3 and Phase 1. Add
  src/remake/mac-theme.css from design/mac-redesign/tokens/mac-theme.css, import it after the other
  remake CSS, and verify all pages in Day and Night with `bun run remake:dev`. Change no behaviour. Report contrast issues."
- **Phase 2/3:** "Implement Phase 2 (shell) then Phase 3 (Dialer) from the guide. Keep reducer actions,
  voice logic, DTMF, DNC and timezone behaviour untouched. Replace the Add-a-participant modal
  with the inline Dial panel described. Run test:remake, lint and tsc."
- **Phase 4/5:** "Implement Phases 4–5. Stacked chart must equal metrics() totals. Restyle the
  remaining screens; add the Time Zones re-anchor and the Follow-ups 'pick a time' group."
- **Phase 6:** "Implement 6a–6c as separate commits with unit tests for the pure helpers.
  Dialpad and palette never auto-dial. Wire the Balance panel to getTwilioUsage."
- **Phase 7:** "Update DESIGN.md and docs/remake-design.md, run the full QA checklist, and write the PR description. Do not merge."
