# Evaluation: #1299 — `/api/health` identity check of the dev server (level 2 from #1259)

**Builder:** Nattkjøreren (#1079), Opus build subagent (orchestrated by Fable)
**Contract:** issue comment on #1299 (kontrakt-smeden 2026-08-27)
**Branch:** `claude/natt-1299-health-identity` from `origin/main@e454de2`

## Runde 1 — implement → gates → fresh-context evaluate → ACCEPT

One round. Built to contract; fresh-context Opus evaluator found no substantive defect.
Independent Sonnet cross-model gate (Steg 4.5): CONFIRM.

### Changes

| File | Change |
|------|--------|
| `lib/serverIdentity/assess.ts` | NEW — pure `assessServerIdentity(server, local)` decision table: cwd → bootedAt-vs-checkout → sha, with degradation legs (null sha / null headMtime skip that leg only). |
| `lib/serverIdentity/assess.test.ts` | NEW — 14 Type A tests: match, cwd mismatch, bootedAt-older (incl. strict-`<` boundary), sha mismatch, precedence ordering, all degradation legs. |
| `lib/serverIdentity/capture.ts` | NEW — payload capture: cwd, inlined version, git SHA via `execFileSync` in try/catch stashed in `globalThis` (commented — new pattern in repo), `bootedAt` from `process.uptime()`. |
| `app/api/health/route.ts` | NEW — `VERCEL` gate as first statement (404 in prod), `cache-control: no-store`, no `force-dynamic`. |
| `e2e/global-setup.ts` | NEW — probes `/api/health` (3s abort); nothing listening → silent skip; listening-but-unusable → fail loud; 200 → assess; mismatch → throw with copy-paste cleanup. |
| `playwright.config.ts` | globalSetup wiring. |
| `docs/test-discipline.md` | Level-3 guard note: level 2 now exists. |

### Success criteria — verified

| # | Criterion | Evidence | Result |
|---|-----------|----------|--------|
| 1 | Type A tests green | `npx vitest run lib/serverIdentity` → 14/14 | PASS |
| 2 | #1758 repro stops the run on the bootedAt leg | Live repro: dev server booted, branch switched (HEAD mtime moved), `npm run e2e:gate` → exit 1 before any spec, message names both identities + cleanup; the bootedAt/checkout leg fired | PASS |
| 3 | Fresh server: e2e behaves as before | Fresh server → globalSetup silent, `e2e/landing.spec.ts` 1 passed; dead port → classified nothing-listening (SKIP) | PASS |
| 4 | tsc / lint / full vitest green | tsc exit 0 · lint 0 errors · vitest 504 files / 6715 tests | PASS |
| 5 | CI untouched, no force-dynamic, build green | no ci.yml/package.json in diff; `npm run build -- --webpack` green with `ƒ /api/health` (Turbopack native bindings missing in the VM — pre-existing env limitation, webpack is Next's documented fallback) | PASS |
| + | Never leaks to prod | Booted with `VERCEL=1` → `/api/health` 404 | PASS |

### Gates

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors (57 pre-existing warnings) |
| Unit | `npx vitest run` | 504 files / 6715 tests green |
| e2e | `npm run e2e:gate` (reused same-tree webpack dev server) | 25/31 green; 6 red reproduced on unchanged `origin/main` in the same environment (see PR comment) |

**Green-main gate (Steg 2.2, once at start of night):** `npm ci` + typecheck + `npm test` (6701/6701) + lint (0 errors) + `guard.test.sh` (39/0) — all green on `origin/main@e454de2`.

### Fresh-context evaluator findings (non-blocking, filed as follow-up issue)

1. Cold-Turbopack first-compile can exceed the 3s probe timeout right after Playwright's TCP-only readiness check → plausible local false-red (CI safe: prod server, precompiled).
2. The sha leg false-reds after a plain `git commit` (HEAD mtime untouched, sha changed) — conflates "different code checked out" with "made a commit". Contract-mandated behavior, flagged for robustness follow-up.

### Cross-model gate (Steg 4.5)

Sonnet, fresh context, adversarial: re-ran tests/tsc/eslint, read all changed files, live-probed the running server (payload sha == HEAD), independently read Playwright 1.60.0 runner source to confirm webServer-before-globalSetup ordering, empirically verified TimeoutError-vs-TypeError fetch classification, checked vitest excludes don't skip the new tests. **CONFIRM.**
