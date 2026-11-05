# Mac-style redesign handoff

Design package for restyling Call Board (`src/remake/`) as a sleek, macOS-style app.

Start with **[CODEX_GUIDE.md](./CODEX_GUIDE.md)**. It splits the work into small
phases so an agent can finish each one.

```
design/mac-redesign/
  CODEX_GUIDE.md          step-by-step plan, rules, verification, prompts
  tokens/mac-theme.css    Phase 1: variable remap (Day + Night)
  tokens/mac-overrides.css Phase 2: sidebar, nav, panels, buttons, badges, keypad
  source/                 12 design boards (reference markup) + canvas.json
```

Status: nothing in here has been rendered inside the real app yet. The CSS was
written against the real selectors in `remake.css`, but each phase needs a visual
check in Day and Night. Board data is invented; do not import it.
