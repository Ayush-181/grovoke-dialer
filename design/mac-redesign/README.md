# Mac-style redesign — handoff folder

Design handoff for the Call Board UI in `src/remake/`. **No application code was changed** to
create this folder.

| File | Purpose |
|---|---|
| `CODEX_GUIDE.md` | **Start here.** What to change, where, in what order, how to verify. Phases 0–7, token tables, component recipes, behaviour specs, QA checklist, ready-to-paste prompts. |
| `tokens/mac-theme.css` | Drop-in overlay that re-maps the existing remake variables to the new palette (Day + Night). Phase 1. |
| `tokens/new-components.css` | Styles for the new components (`mx-` prefix): floating dialpad, inline Add-call panel, Worth-a-callback toggle, ⌘K palette, goal ring, stacked chart, balance panel. Phase 3–6. |
| `source/` *(optional)* | The exported design boards (`*.dc.html`). Need Claude's design runtime to render — read them for exact markup/CSS; the guide is authoritative. |

## Quick start

1. Branch off `codex/complete-callboard-2026-10-23` (never push to the Lovable-connected branch).
2. Read `CODEX_GUIDE.md` §0–§3.
3. Phase 1 prompt: *"Read design/mac-redesign/CODEX_GUIDE.md §1, §3 and Phase 1. Add
   src/remake/mac-theme.css from design/mac-redesign/tokens/mac-theme.css, import it after the other
   remake CSS, and verify all pages in Day and Night with `bun run remake:dev`. Change no behaviour."*
4. Continue phase by phase; open a PR, do not merge.

## Approval and precedence

This redesign was requested and approved by the owner, Ash. For visual decisions inside
`src/remake/` it supersedes the visual rules in `DESIGN.md`; behaviour rules in `AGENTS.md` always
win. Phase 7 updates `DESIGN.md` and `docs/remake-design.md` to match.
