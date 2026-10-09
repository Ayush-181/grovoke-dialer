# Grovoke Dialer design system

Grovoke is the repository name; the application currently labels itself CALL BOARD.
Retain that product label until a branding change is requested.

## Reference and adaptation
Informed by [VoltAgent's Linear analysis](https://github.com/VoltAgent/awesome-design-md/blob/13be5c05c63be24b57581162364167028020f043/design-md/linear.app/DESIGN.md).
Use its restrained accent, clear surface hierarchy, 4px rhythm, hairline borders,
and compact product typography. Its dark marketing canvas, lavender, proprietary
fonts, oversized heroes, and promotional screenshots are not Grovoke's theme.
The implementation in src/styles.css and src/components/AppShell.tsx is authoritative.
See docs/vendor-notices for source licenses.

## Existing tokens
Use semantic Tailwind utilities backed by the existing OKLCH variables:
- background/card: white; surface: near #F7F8FA; raised surface: pale cool gray.
- foreground: near #0A0A0A; muted-foreground: near #6B6F76.
- primary: blue near #2563EB; border: near #E4E5E8; focus: ring.
- destructive: red; warning: amber; success: green; info: blue.
These are approximations for communication, not replacement CSS values.
Blue marks the primary action or active navigation. Semantic colors communicate
call outcomes and errors; always pair them with text or an icon label.

## Typography and rhythm
Inter remains the UI font, with system fallbacks. JetBrains Mono or the mono
utility serves phone numbers, durations, counts, and timezone readouts.
Use 18px semibold page titles, 14px body/controls, and 12px secondary labels
consistent with the current shell. Keep primary information legible.
Use 4/8/12/16/24/32px spacing, 16px page gutters and compact table rows.
Retain the CSS radius scale (base 0.7rem), panel utility, subtle shadow-panel,
and the existing 56px top navigation. Avoid new decorative elevation.

## Workspace layouts
Dense lead/call/session tables are the main workspace. Group related controls,
keep filters close to results, and align numerical columns with tabular figures.
Use cards for grouped metrics or contextual details, not every table cell.
Navigation may scroll on narrow screens; preserve all destinations and the active
state. At 390px and 768px, allow deliberate table scrolling while keeping actions
reachable and avoiding page-wide overflow. Grow touch controls toward 44px.

## Components and states
Reuse Radix/shadcn components and lucide-react icons with consistent size/stroke.
Label icon-only controls and preserve keyboard focus, dialog focus management,
native form labels, and disabled/busy states. Include loading, empty, error, and
retry states that distinguish failure from zero results.
Keep the active call status and hang-up action visible. Keep keypad access during
connecting/live/conferencing. Never initiate a call as a side effect of navigation.
Show the selected microphone and timezone; distinguish unknown zones explicitly.
Bookings show lead-local date/zone and IST conversion; handle DST gaps/repeats.

## Motion and review
Prefer brief color/opacity transitions. Respect prefers-reduced-motion and avoid
ambient animation, parallax, spotlight effects, marketing layouts, or font swaps
in the operational workspace. Review one component at a time with synthetic data.
Check keyboard navigation, focus, contrast, overflow, and all meaningful states.
Only use the isolated smoke workflow for automated browser verification.
