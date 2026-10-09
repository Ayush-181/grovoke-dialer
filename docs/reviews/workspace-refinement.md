# Refine workspace navigation and lead management

On narrow screens, account controls previously squeezed the navigation and lead filters lacked labels. Failed lead requests appeared as an empty list, and changing filters briefly cleared the table. This first redesign step keeps navigation reachable, groups labeled filters, and distinguishes loading, no matches, an empty workspace, and request failures with retry.

The shared shell keeps CALL BOARD, its light/blue tokens, and all seven destinations. It adds a skip link, explicit active navigation, keyboard focus, truncated workspace/account details, and a separate navigation row below desktop widths. The Leads screen keeps its dense table in a keyboard-scrollable region, uses larger mobile actions and a contextual selection toolbar, and retains results while new filters load. Selection clears when filters or pages change. Calling, booking, and database integrations are unchanged.

## Validation

- 29 existing pure/mocked unit tests pass.
- TypeScript passes and the production build passes in a source copy without dotenv files or inherited service credentials.
- Lint passes for changed UI and smoke files.
- The guarded anonymous auth smoke passes in a fresh warm session; the cold-start hydration/mode-toggle instability described by the existing workflow still occurs.
- The new guarded synthetic Leads smoke passes at 1280, 768 and 390px. It checks filters, selection, opening/cancelling confirmation, keyboard table scrolling, skip-link focus, request failure/retry, and empty states. No call/session/import/final delete control is clicked; mutations and unknown service requests fail the check.
- Synthetic screenshots remain ignored under `.playwright-cli/leads-{width}.png`.

## Existing failures

Repository-wide lint has 708 errors and 11 warnings outside the changed files, matching the untouched PR #1 workflow baseline. Unfiltered lint also stalls on the existing minified Twilio SDK; `bun run lint --ignore-pattern 'public/vendor/**' --ignore-pattern 'twilio.min.js'` reproduces the 719 remaining findings. The SDK files and existing lint issues are preserved.

The browser-download host is blocked in this cloud environment. Smoke verification uses the pinned Microsoft CLI with installed system Chromium, a writable workspace cache, and its supported sandbox runtime setting. Isolated contexts, empty permissions, blocked service workers, and pre-navigation request/WebSocket guards remain in place.

## Design review

- `src/components/AppShell.tsx`: responsive navigation, active-page semantics, skip link, focus feedback, and long-name containment reviewed.
- `src/routes/_authenticated/leads.tsx`: labels, status announcements, retry/empty states, 44px mobile actions, table containment, and confirmation cancellation reviewed.
- `scripts/smoke-leads.js`: synthetic fixture and read allowlist installed before navigation; all mutation and unknown mock requests blocked and reported.

This is a focused first step for the overall dialer redesign. The phone panel, Sessions, and Bookings are follow-up design scopes. No live provider verification, database migration, deployment, or merge is part of this change.
