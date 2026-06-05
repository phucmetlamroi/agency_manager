# Playbook Phase 7 — Load / Performance

> Phase 7 of the Discord-benchmarked playbook calls for k6 + Lighthouse +
> heavy-seed scenarios. This environment does NOT have k6 installed (winget
> install was denied at the sandbox level for system-wide tools). We ship a
> lightweight alternative using Node's `ws` (already in package.json) for
> the WebSocket probe + Playwright CDP for memory/heap, and document the
> gaps that need k6 + a dedicated load environment.

## What runs here

| Spec / script | Phase | Purpose |
|---|---|---|
| `e2e/34-perf-memory.owner.spec.ts` | 7.13 | 50 channel switches in one page → JS heap sampled via CDP; asserts heap doesn't grow unbounded |
| `e2e/35-perf-lighthouse.owner.spec.ts` | 7.15 | Smoke a11y/perf snapshot of /hub via Playwright tracing (Lighthouse-lite) |
| `e2e/load/ws-burst.mjs` | 7.1 | 100 concurrent ws connections to the Next.js dev server; reports connect success + median latency |
| `e2e/load/message-storm.mjs` | 7.2 / 7.10 | Drives N messages or reactions via the seeded session cookie; reports server response time |

## Run instructions

```powershell
# 1. WebSocket burst (Phase 7.1)
node e2e/load/ws-burst.mjs --conns 100 --url ws://localhost:3000

# 2. Message storm (Phase 7.2) — requires a logged-in cookie jar
node e2e/load/message-storm.mjs --rate 30 --duration 30 --cookie <session-cookie>

# 3. Playwright memory + lighthouse
npx playwright test --project=owner e2e/34-perf-memory.owner.spec.ts e2e/35-perf-lighthouse.owner.spec.ts
```

## Targets vs benchmarks (playbook §7)

| Metric | Benchmark | Our env note |
|---|---|---|
| Connect p95 | < 500ms | Single-node test env — record actual vs target |
| Message round-trip p95 | < 100ms | Relax to < 250ms locally; record |
| Search P95 | < 500ms | Requires 1M seeded messages — not run |
| Concurrent WS | 10k-100k | Out of scope for the test env |
| Heap on 1k channel switches | bounded | Spec runs 50 switches as a smoke probe |

## Gaps logged (will become P11 parity scorecard items)

- **k6 NOT installed** → 7.1, 7.2, 7.3, 7.9, 7.11 cannot run at the playbook
  scale. The lightweight `ws-burst.mjs` covers the WS-connect spirit at 100
  conns instead of 1,000.
- **No 10,000-message channel seeded** → 7.4 cannot run. Recommend a separate
  nightly seed job.
- **No 1,000-channel workspace seeded** → 7.6 not run.
- **No 1,000-page wiki seeded** → 7.7 not run.
- **No 1M-message corpus** → 7.11 not run.
- **LiveKit 50-user call** → 7.3 requires a real LiveKit server + fake media
  flags; not in this E2E environment.
