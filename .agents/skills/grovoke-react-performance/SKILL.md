---
name: grovoke-react-performance
description: Review or improve Grovoke React component performance, async fetching and effect lifecycle behavior.
license: MIT
metadata:
  author: vercel
---
# React performance for Grovoke
Selected and adapted from vercel-labs/agent-skills react-best-practices at
063bee94c3f4df8453406c830b0a7df0f2860278. Read root AGENTS.md first.
Use the applicable bundled rules for independent async work, deferring awaits,
derived state, functional updates, event listeners and SSR request state:
- [async-parallel](rules/async-parallel.md)
- [async-defer-await](rules/async-defer-await.md)
- [rerender-functional-setstate](rules/rerender-functional-setstate.md)
- [rerender-derived-state-no-effect](rules/rerender-derived-state-no-effect.md)
- [client-event-listeners](rules/client-event-listeners.md)
- [server-no-shared-module-state](rules/server-no-shared-module-state.md)

Apply general React guidance to React 19 and TanStack Start/Query. Keep current
query caching and routing. Do not introduce Next.js, RSC, next/dynamic, next/image,
SWR, Vercel deployment, or cross-user caches. Preserve workspace authorization.
Measure or demonstrate the issue before optimizing; avoid speculative memoization.
Validate auth initialization, subscription cleanup, and call state transitions
with mocked providers; never connect a real Twilio device for performance tests.
