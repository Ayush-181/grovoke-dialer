<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Grovoke Dialer (Call Board)

## Project and conventions
- React 19 + TypeScript, TanStack Start/Router/Query, Vite 8, Tailwind CSS 4,
  Radix/shadcn components, Supabase, Twilio Voice SDK, and Google Calendar.
- Use Bun and the committed bun.lock: `bun install --frozen-lockfile --ignore-scripts`.
  Preserve bunfig.toml's release-age guard. Do not add bypasses without approval.
- Read DESIGN.md for UI work. Reuse src/components/ui and semantic CSS tokens.
  The active theme is light/blue in src/styles.css; older dark/green README prose
  is historical. Preserve Inter, JetBrains Mono, and lucide-react.
- Routes live in src/routes; src/routeTree.gen.ts is generated. Preserve the root
  Outlet and auth initialization gate before redirects.
- vite.config.ts already includes React, TanStack, Tailwind, Nitro and aliases
  via Lovable's wrapper. Do not duplicate plugins or add Next.js conventions.
- Keep workspace_id scoping, snake_case statuses/outcomes, phone normalization,
  session phone deduplication, and do_not_call behavior.
- Keep DTMF visible during connecting/live/conferencing; preserve explicit mic
  selection and lead timezone overrides, including DST ambiguity handling.
- Preserve server/client boundaries (*.server.ts and TanStack server functions).
  Never move Twilio credentials or database privileged keys into client bundles.

## Verification
- `bun run test:unit`: explicit existing pure/mocked test files only.
- `bun run lint`, `bunx --no-install tsc --noEmit`, `bun run build`.
  Build in a source copy without .env files or inherited service credentials.
  Record existing failures separately. Do not reformat the entire repository.
- For browser checks follow docs/codex-workflow.md and use
  `bun run smoke:dev` plus `bun run smoke:auth`.
  The smoke scope is anonymous auth UI; authenticated flows require new mocks.
- Do not run tests/lead-call-counts.sql or migrations against any remote database.

## Safe boundaries
Never read, print, copy, commit or send .env values, tokens, recordings, real lead
data, or saved browser authentication. Use synthetic fixtures and isolated browser
sessions. Never initiate calls, auto-dial sessions, conferences, SMS, calendar
invitations, CSV imports, or live database writes during verification. Do not
attach to a signed-in browser. Do not deploy, merge, or enable auto-merge.
Repo-local skills in .agents/skills are scoped guidance; these project conventions
and DESIGN.md take precedence over upstream aesthetic or Next.js suggestions.
