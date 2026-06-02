# Evaluation: #357 — «Finn turneringer» vedvarende inngang + manual_approval discovery

**Commit:** `f9aa2e3`
**Contract:** `.forge/contracts/357-finn-turneringer-vedvarende.md`
**Evaluator:** fresh-context skeptic
**Date:** 2026-06-02

## Overall verdict: ACCEPT

All seven success criteria pass, all six gates pass. The implementation matches the contract design faithfully, reuses the established `getDiscoverableGames` + `HomeDiscoverySection` foundation as specified, and the skeptic-targeted checks (invite_only exclusion, CTA-per-mode, `!canCreateGame` gating, empty-state, no-regression) all hold up under code reading. No issues found.

## Gate results

| Gate | Result | Evidence |
|------|--------|----------|
| `npx tsc --noEmit` | PASS | exit 0, no output |
| `npx vitest run getDiscoverableGames.test.ts + HomeDiscoverySection.test.tsx` | PASS | 2 files, 9 tests passed |
| `npx eslint` (6 changed files) | PASS | exit 0, no output |
| `npm run build` | PASS | exit 0; `/finn-turneringer` listed as `ƒ` (dynamic) route, no build error, 0 error/fail matches in log |
| version bump + CHANGELOG | PASS | `package.json` 1.66.x → `1.67.0` (MINOR — correct for new user-visible feature); CHANGELOG.md has 1.67.y «Finn turneringer» section with three-layer structure |
| Playwright criteria 2/3/5 | N/A (waived per task) | Feature is auth-gated + needs seeded open/manual_approval games unreachable in local preview; verified via JSX + render test instead, per evaluator constraint |

## Per-criterion verification

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | `getDiscoverableGames` returns both `open` and `manual_approval` (never `invite_only`), each with its `registration_mode`, verified in test | **PASS** | `getDiscoverableGames.ts:69` `.in('registration_mode', ['open', 'manual_approval'])`; `:66` SELECT now includes `registration_mode`; `:95` maps it into `DiscoverableOpenGame`. Test `:113` asserts `inArg` called with `['open','manual_approval']`; test `:128` asserts both modes preserved per game. |
| 2 | Non-admin with ≥1 game sees a persistent «Finn turneringer» entry on Home linking to `/finn-turneringer` (≤1 tap) | **PASS** | `app/page.tsx:367-380` — in the has-games branch's `<nav>`, gated `!canCreateGame`, renders a `Section`+`Card` wrapped in `<SmartLink href="/finn-turneringer">`. One tap. Build confirms route exists. |
| 3 | `/finn-turneringer` lists discoverable games with correct CTA per mode and excludes already-joined / already-requested games | **PASS** | `finn-turneringer/page.tsx:30` fetches `getDiscoverableGames(userId)`, renders `HomeDiscoverySection`. CTA logic in `HomeDiscoverySection.tsx:65-68` (`manual_approval`→«Be om å bli med», else «Meld meg på»), both link `/signup/${short_id}` (`:91`). Exclusion via existing `excludedIds` set (`getDiscoverableGames.ts:62,74-76`), unchanged; tests `:161,:173` cover joined + pending/approved exclusion. Render test `HomeDiscoverySection.test.tsx:27-49` asserts both CTAs + correct hrefs. |
| 4 | `invite_only` games never appear in discovery — unit test asserts exclusion | **PASS** | Only `open`+`manual_approval` pass the `.in()` filter; no other code path inserts into `openGames` (single map over `openGamesRes.data`). Type `DiscoverableOpenGame.registration_mode` is `'open' \| 'manual_approval'` only. Test `:113` asserts the filter argument directly (not vacuously — see note below). |
| 5 | `/finn-turneringer` has friendly empty-state when nothing discoverable | **PASS** | `finn-turneringer/page.tsx:31-32` computes `isEmpty` (both lists empty); `:44-49` renders a friendly Norwegian `<p>` («Ingen åpne turneringer akkurat nå. Be en arrangør om en invitasjon, eller stikk innom igjen senere.») instead of the section. Not a blank/broken page — full AppShell + header + PageHeader still render. |
| 6 | Admin / trusted creators do NOT see the Home card (parity with `!canCreateGame`) | **PASS** | `app/page.tsx:179-180` `canCreateGame = is_admin === true \|\| isTrustedCreator(email)`; card at `:367` gated `{!canCreateGame && (...)}`. Admins/trusted creators fall outside. |
| 7 | Existing Home empty-state discovery still works (same data source, no regression) | **PASS** | Empty-state branch (`app/page.tsx:199-205,246-248`) is byte-for-byte unchanged in this commit (diff touches only the has-games `<nav>` and the imports already present). It reuses the same `getDiscoverableGames` + `HomeDiscoverySection`. The shared `OpenGameCard` now also surfaces `manual_approval` with the correct «Be om å bli med» CTA — a deliberate, consistent improvement, not a regression. |

## Skeptic checks (explicit)

- **invite_only leak?** No. Single source of truth is the `.in(['open','manual_approval'])` filter (`getDiscoverableGames.ts:69`). No fallback path, no second query, no client-side re-inclusion. Type union forbids `invite_only` at compile time.
- **CTA mapping + both link to `/signup/{short_id}`?** Confirmed. `HomeDiscoverySection.tsx:65-68` + `:91`. The `/signup/[shortId]` route handles all three modes (`page.tsx:242` — anything not `open` is treated as `manual_approval`; `invite_only` gated separately at `:186`), so routing-on-mode is delegated correctly.
- **Home card gated to non-creators?** Confirmed — `!canCreateGame` (`app/page.tsx:367`).
- **Empty-state branch friendly?** Confirmed — `finn-turneringer/page.tsx:44-49`, not blank.
- **Home empty-state regression?** None — empty-state code untouched; shared card's added `manual_approval` CTA is correct there too.
- **`as`-casts hiding bugs?** The casts (`row.registration_mode as 'open' \| 'manual_approval'`, course/games array-normalization) follow the pre-existing pattern in the same file and are bounded by the DB-side `.in()` filter — a row reaching the map is guaranteed to be one of the two modes. Acceptable, consistent with #257 conventions.
- **Is the filter test vacuous?** No. The mock's `games`-branch captures `.in()` arguments via `inArg(...)` (`getDiscoverableGames.test.ts:33`) and the test asserts `inArg` was called with exactly `['open','manual_approval']` (`:122`). It tests the production query argument, not mock-fabricated data. (Caveat: the mock also captures the `status` `.in()` call into the same `inArg` spy, but `toHaveBeenCalledWith` checks across all calls, so the assertion remains valid.)

## Notes / minor observations (non-blocking)

- **Component-prop verification:** `BackLink`, `Kicker`, `PageHeader`, `AppShell`, `getProxyVerifiedUserId` all exist and the props used in `finn-turneringer/page.tsx` match their signatures (verified by reading each). `tsc` clean corroborates.
- **Side-chrome deviation from contract suggestion:** contract suggested «TopBar with back-arrow» mirroring `/spillformer`. Implementation uses `BackLink` + `Kicker` + `PageHeader` instead. This is within Claude's discretion («verifiser mønster i build») and is a valid app-wide pattern; not a defect.
- **`limit` bumped 10→50** as specified; empty-state usage unaffected (no separate `limit` param added — the simplest option, as the contract preferred).
- The render test lives on `HomeDiscoverySection` (one test covering the CTA-per-mode switch), satisfying the «one render test per component» discipline and the contract's discretion clause.
