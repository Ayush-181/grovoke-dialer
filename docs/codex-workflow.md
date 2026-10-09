# Codex workflow for Grovoke Dialer

## Local prerequisites and first use

Use Node.js 22.12+ (verified with 24.11.0), Bun (verified with 1.4.2), Git,
and a signed-in Codex app/CLI. GitHub connector access does not automatically
authenticate local Git. Sign in with your normal Git credential manager if needed.
Never paste tokens into chat or commit them.

1. Clone https://github.com/Ayush-181/grovoke-dialer and check out this feature branch.
2. From the repository root run `bun install --frozen-lockfile --ignore-scripts`.
   Preserve bunfig.toml and its minimum release age. Inspect any dependency
   install-script requirement before enabling scripts.
3. Install only the pinned Microsoft CLI in an ignored local tools directory:
   `npm install --prefix .tools/playwright --ignore-scripts @playwright/cli@0.1.22`.
   This creates a separate tools lockfile; it does not change the app's Bun lockfile.
4. Verify `node .tools/playwright/node_modules/@playwright/cli/playwright-cli.js --help`.
   Install Chromium if absent:
   `node .tools/playwright/node_modules/playwright/cli.js install chromium`.
   Browser downloads, global tool installation, and restricted filesystem/network
   access may need local approval. The smoke workflow needs no provider sign-in.
5. Open the repo in Codex. Root AGENTS.md and repo-local .agents/skills travel with
   this branch. Installed skills are available on the next Codex turn. Do not run
   blanket skill installers or install deployment/Next.js/mobile skills.

## Safe checks

Run `bun run test:unit`, `bun run lint`, and
`bunx --no-install tsc --noEmit`. The explicit unit-test selection uses the
existing pure/mocked tests, including mocked Google requests. No SQL tests or
database migrations are part of this workflow.

Run `bun run build` only in an isolated copy containing source, public assets,
configuration and dependencies, with no dotenv files or inherited service secrets.
Do not use the tracked .env for verification. No deploy or migration command is
needed. A build passing is not evidence of live provider integration working.

## Anonymous browser smoke

In one terminal run `bun run smoke:dev`. In a second run `bun run smoke:auth`.
The server binds 127.0.0.1:4173 with strict port selection. It creates an ignored
.smoke-work source copy from an explicit allowlist, excludes the repo's .env,
clears inherited credentials, and supplies a dummy Supabase URL on unused port 9.

The CLI uses .playwright/cli.config.json and a named isolated session. The runner
opens about:blank, then installs context request and WebSocket guards before
navigation. It allows only local GET requests for anonymous routes and frontend
assets; it blocks mutation requests, API/server-function requests, external
providers, and WebSockets. Service workers are disabled. It checks auth labels,
mode switching, page errors and overflow at 1280/768/390px without submitting
forms. Screenshots are ignored in .playwright-cli.

Use the runner, not a direct CLI open of the app: configuration alone does not
install the request guards. Do not override config, reuse storage state,
attach/CDP to a browser, grant microphone permission, authenticate, submit forms,
click call/session/conference controls, import leads, send invitations, fetch
recordings or navigate production URLs.

Blocked external font/Vite HMR requests are expected; browser page errors and
missing auth controls are failures. Smoke output does not verify authenticated
routes or calling. Those require purpose-built synthetic auth/workspace/Twilio
fixtures and a reviewed extension of the allowlist, before navigation.

On a cold Vite start, dependency optimization can initially cause a duplicate-React
hydration error. Let optimization finish and rerun the anonymous smoke once in a
fresh session. If it still fails, stop and investigate; do not suppress page errors
or weaken the request guards. A warm run passed in this environment.

Stop the server with Ctrl+C. The runner closes only its named grovoke-smoke-auth or grovoke-smoke-leads session. Scratch copies
and screenshots remain ignored locally; review/delete those local folders when
done, without uploading sensitive output.

## Sources and scope

- VoltAgent/awesome-design-md Linear reference informs DESIGN.md; adapted for the
  current light/blue operational application, with the MIT notice preserved.
- Leonxlnx/taste-skill: a concise adaptation of redesign-skill preserves useful
  existing-app review guidance and removes conflicting typography/icon/motion rules.
- vercel-labs/agent-skills: six general React rules plus web-design-guidelines;
  Next.js/RSC, deployment, mobile, credential and Vercel-specific skills omitted.
- microsoft/playwright-cli: pinned local CLI and project configuration; no MCP
  server or global Codex configuration is required.

Source revisions and licensing are recorded in docs/vendor-notices/SOURCES.md.
Third-party guidance is subordinate to the project's safety and design rules.

## Synthetic Leads workspace smoke

Run `bun run smoke:leads` while `bun run smoke:dev` is running. This uses the same
pinned CLI and isolated browser config, with a separate grovoke-smoke-leads session.
The reviewed allowlist extension in `scripts/smoke-leads.js` adds only the local
`/leads` route and synthetic read responses on `http://127.0.0.1:9`. It seeds a
fabricated, short-lived session in that new browser context; it never reads saved
browser authentication. Local mock reads cover auth user, workspace membership,
preferences, missed-call count, and leads. No request reaches a provider.

Mutation requests, server functions, other navigation, unknown mock reads, and
WebSockets are blocked before navigation. Unexpected requests fail the smoke.
The smoke tests filters, selection, opening/cancelling delete confirmation,
keyboard access, scroll containment, error/retry and empty states. It never clicks
call, session, import or final delete controls. Screenshots contain synthetic data
only and remain ignored under `.playwright-cli`.

In cloud containers where browser download hosts are unavailable, the pinned CLI
supports `PLAYWRIGHT_MCP_EXECUTABLE_PATH=/usr/bin/chromium` for an already installed
system Chromium. Use `XDG_CACHE_HOME` pointing to a writable workspace cache if
needed. If the container cannot create the Chromium sandbox, its supported
`PLAYWRIGHT_MCP_SANDBOX=false` setting can be used for this isolated smoke. Retain
the committed config, headless isolated context, empty permissions, blocked service
workers, and request/WebSocket guards. These runtime choices do not authorize
attaching to a browser or accessing live services.
