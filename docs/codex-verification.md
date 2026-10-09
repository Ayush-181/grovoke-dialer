# Verification — 8 October 2026

Base commit: c23002546fca03f682f736b11124d2aeff24586f.
Node 24.11.0, Bun 1.4.2, @playwright/cli 0.1.22, Chromium 155.

- Frozen Bun install with install scripts disabled: passed; app dependency/lockfile
  versions unchanged.
- Existing unit selection: 29 passed, 0 failed, 59 assertions across four files.
  Google Calendar requests were mocked.
- TypeScript noEmit: passed.
- Vite production build: passed in source copy excluding tracked .env.
  Existing warnings: inputValidator deprecation, tsconfig-paths plugin redundancy,
  plugin timing. No deployment was run.
- Full lint: existing application baseline has 708 errors and 11 warnings:
  700 formatting errors, 7 no-explicit-any, 1 prefer-const, and 11 React warnings.
  No broad formatting or application refactor included.
- Changed executable/config files: lint passed.
- Skill name/description and local reference existence checks: passed. The bundled
  Python quick_validate script could not run because PyYAML is missing; manifest
  and reference checks were performed independently.
- Anonymous auth browser smoke: passed at 1280, 768 and 390px. Labels, sign-in /
  signup mode switching, overflow and page-error assertions passed. Mobile
  screenshot inspected. No form submitted and no microphone permission granted.
- Cold development dependency optimization initially produced duplicate React
  hydration errors. A fresh isolated session after optimization passed. This
  dev-tool limitation is documented; errors are not suppressed. It does not
  establish correctness of authenticated or provider-backed workflows.

The smoke server excludes dotenv files and inherited service credentials.
Browser guards are installed before navigation, with external requests,
API/mutation requests, and WebSockets blocked. External fonts and HMR console
failures are expected; the test fails on page errors or missing controls.
No live calls, recordings, calendar invitations, migrations, database writes,
deployments or merges were performed.

Local setup/sign-in still needed when using your own checkout: authenticated Git,
Node/Bun, pinned local Playwright CLI and Chromium, and an active Codex session.
No provider sign-in or service secrets are required for this smoke scope.
