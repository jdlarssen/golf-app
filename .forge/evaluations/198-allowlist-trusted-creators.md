# Evaluation: #198 — Allowlist-MVP

**Contract:** `.forge/contracts/198-allowlist-trusted-creators.md`
**Branch:** `claude/wonderful-goldwasser-b38897`
**PR:** [#204](https://github.com/jdlarssen/golf-app/pull/204)
**Verdict:** **ACCEPT** ✓

## Per-criterion

| # | Criterion | Status | Evidence |
|---|---|---|---|
| K1 | `trustedCreators.ts` + helper + tests | ✅ | `lib/admin/trustedCreators.ts:8-19`; 10/10 tests pass |
| K2 | `auth.ts` helper used by actions + new route | ✅ | `lib/admin/auth.ts:38-44`; used in `actions.ts:79` + `opprett-spill/page.tsx:56`. In-spec deviation: `requireAdmin` dropped as dead code. |
| K3 | Admin page unchanged for admin users | ✅ | Admin happy-path test passes; same `GameForm` import |
| K4 | `/opprett-spill` exists with `AppShell` | ✅ | `app/opprett-spill/page.tsx:56,63`; build lists route |
| K5 | Home CTA gated correctly | ✅ | `app/page.tsx:162-163,186,343`; admin → `/admin/games/new`, trusted → `/opprett-spill` |
| K6 | Action allows trusted, `created_by` correct | ✅ | `actions.ts:76-79,122`; test asserts `created_by === 'trusted-1'` |
| K7 | Admin layout still admin-only | ✅ | `app/admin/layout.tsx:17-28` unchanged |
| K8 | Tests green | ✅ | 924/924 |
| K9 | Lint clean | ✅ | 0 errors on changed files |
| K10 | Build/typecheck green | ✅ | `tsc --noEmit` clean, `npm run build` shows `/opprett-spill` |
| K11 | 1.16.4 → 1.17.0 + CHANGELOG | ✅ | New series open at top, 1.16.y collapsed, stakeholder tagline present |

## In-spec deviations

- **K2 relaxed:** dropped `requireAdmin()` export — no caller (`admin/layout.tsx` keeps its perf-tuned inline check via `getProxyVerifiedUserId`). Per "no abstractions beyond what's needed".
- **K11 base:** main moved from 1.15.4 to 1.16.4 during this work. Final bump is to 1.17.0 (still a minor — new user-visible series).
- **§4 audit-log:** dropped. Observation SQL queries `games.created_by` directly.

## Non-blocking observations

- Pre-existing lint failures in `e2e/sync/offline-sync.spec.ts` (5 `no-explicit-any` errors, last touched 2026-05-19) — unrelated to this PR.
- Trusted-creator success-redirect still bounces through `/admin/games/[id]` → `/` (admin layout intercepts). Documented as accepted rough edge.

## Recommendation

Ship the PR. Toggle `fornes.even@yahoo.no` is live via the seeded array.
