# Skeptical evaluation — audit batch 2 (branch `claude/audit-batch-2`)

Date: 2026-06-17
Evaluator: independent fresh-context review (read-only, no code changed)
Base: `origin/main` … HEAD (`ed876a6e`)

## Top-level verdict: **ACCEPT**

All five fixes are correct, complete, and match their contracts and the underlying
issues. Gates are green. One contract documentation inaccuracy (#661, harmless) and
one pre-existing shared-helper DST limitation (#687, not introduced here) are noted
below but neither blocks acceptance.

## Gate results (actual)

- `npx tsc --noEmit` → **exit 0, clean** (no diagnostics).
- `npx vitest run lib/league lib/i18n lib/games/parDisplay.test.ts lib/wizard
  "app/[locale]/signup/[shortId]" "app/[locale]/admin/games/[id]/signups"`
  → **21 files / 517 tests passed**.
- `npx vitest run messages/catalogParity.test.ts` → **1 file / 3 tests passed**
  (no.json ↔ en.json key parity holds after #681/#678 additions).

## Per-issue verdicts

### #687 liga round-window UTC→Oslo — **ACCEPT**

- `generateRounds` now anchors every boundary to Oslo wall-clock through
  `osloInstant()` → `parseOsloDateTimeLocal` (the same helper the admin round-edit
  paths #648 use). Verified the produced UTC instants independently in node:
  - Monthly June: opens `2026-05-31T22:00:00.000Z` (Oslo midnight CEST, +02:00),
    closes `2026-06-30T21:59:00.000Z` (Oslo 23:59). ✓
  - Monthly January: opens `2025-12-31T23:00:00.000Z` (CET +01:00),
    closes `2026-01-31T22:59:00.000Z`. ✓ (winter offset correct)
  - DST-transition months resolve correctly per day (Mar 1 → +01:00, Mar 31 → +02:00).
- weekly/biweekly re-anchor each window to Oslo midnight by stepping the calendar
  date (not adding a fixed ms step), so windows stay at 00:00 Oslo across DST.
- Display: both `fmtWindow` copies (liga/[id]/page.tsx:56,
  runde/[roundId]/spill/page.tsx:39) route timestamptz windows through the new
  Oslo-pinned `formatShortOsloDateWithYearLocale`; plain YYYY-MM-DD season dates
  still parse at midday (unchanged). CreateLigaForm:671 switched
  `getUTCMonth()` → `osloParts(...).month` (both 0-based). ✓
- Gating unchanged: `windowStatus` body untouched (only its doc-comment edited),
  no `startLeagueRoundFlight` / flightFormat / gating-action file changed. ✓
- New test asserts Oslo-anchored bounds that genuinely fail against the old UTC
  impl (old `2026-06-01T00:00:00.000Z` ≠ new `2026-05-31T22:00:00.000Z`). ✓

  Notes (non-blocking):
  - `formatShortOsloDateWithYearLocale` has **no direct unit test**. The contract's
    "Gate … incl. new formatShortOsloDateWithYearLocale" overstates coverage — the
    formatter is only exercised transitively. It mirrors the existing
    `formatShortOsloDayMonthLocale` pattern (Intl en-GB pinned to OSLO +
    NO_MONTHS_SHORT), so correctness risk is low. Worth a follow-up test, not a block.
  - On the two DST-transition days, `parseOsloDateTimeLocal`'s noon-probe makes a
    weekly/biweekly window that opens "00:00 Oslo" on the spring-forward day land
    one hour early (e.g. Mar 29 → `…T22:00Z` rendering as Mar 28 23:00 Oslo). This
    is a **pre-existing property of the shared helper** (#648), not introduced by
    this fix, affects only the weekly/biweekly path on 2 days/year by 1 hour, never
    opens a gap, and is consistent with the admin-edit paths. Acceptable.

### #681 i18n par-label dedup + locale — **ACCEPT**

- `formatOtherGendersPar` extended with optional `labels?: ParGenderLabels`;
  Norwegian fallback preserved when omitted (back-compat for direct tests). ✓
- Both buggy call-sites now pass translated labels:
  - `HoleHero.tsx:105` (uses `ts('parGenderMens', { par })` from `scorecard` ns).
  - `leaderboard/holes/page.tsx:1424,1431` (uses `t('parGenderMens', …)` from
    `leaderboard.holes` ns).
- Grep confirms **no remaining 2-arg call-site** of `formatOtherGendersPar` leaks
  hardcoded Norwegian. ✓
- New keys `parGenderMens/Ladies/Juniors` added to `leaderboard.holes` in both
  no.json and en.json (the `scorecard` ns already had them on main — that's why the
  deferred `ParAsideInline` trio in submit/approve/scorecard already worked). ✓
- catalogParity green. ✓
- Deferred `ParAsideInline` consolidation: confirmed all three copies already use
  `t('parGenderMens', …)` from the `scorecard` namespace — genuinely i18n-aware,
  not a missed leak. Correctly out of scope.

### #678 cup scheduled dead-end copy — **ACCEPT**

- `(home)/page.tsx:546` heading made conditional:
  `teeOffDate ? scorecardOpensAtTeeOff : scorecardOpensWhenOrganizerStarts`.
- Renders inside the `status === 'scheduled'` branch (line 450); `teeOffDate`
  computed at line 452 — already in scope, no new variable. ✓
- New key in `game.home` ns in both no.json + en.json; normal tee-off case
  (truthy `teeOffDate`) unchanged → no regression. ✓ Norwegian copy reads naturally.

### #661 self-signup exact-count cap — **ACCEPT**

- New `soloPlayerCap(gameMode)` export. Verified every cap against the authoritative
  `fitsPlayerCount` switch:
  - wolf → 5 (fits ≤5) ✓; nines → 3 (fits ===3) ✓; round_robin → 4 (===4) ✓;
    acey_deucey → 4 (===4) ✓; nassau/skins/bbb → 16 (≤16) ✓.
  - matchplay family (singles=2, fourball/foursomes/greensome/chapman/gruesome=4)
    → `null` (side-cap path handles them); team/scramble formats → `null`
    (team_size validation handles them). Correctly **not** mis-capped. ✓
- Cap check (actions.ts:213-225) fires **before** the INSERT (line 265). Uses
  `{ count: 'exact', head: true }` filtered on `game_id` + `withdrawn_at IS NULL`,
  mirroring the matchplay side-count. Fail-open on DB error (per contract). ✓
- `game_full` is a real, translated `ActionError` (actions.ts:61). Rendered via
  `RegistrationForm.tsx:81` → `signup.errors.game_full`, present in both locales.

  Note (non-blocking): the contract claims `signup.errors.game_full` carries `{max}`
  interpolation. **Inaccurate** — the actual `signup.errors.game_full` is
  "Spillet er fullt — alle plassene er tatt." with **no `{max}` placeholder**; the
  `{max}` variant lives at `game.players.errorMessages.game_full` (a different
  surface). Because the action returns `error: 'game_full'` with no `max` arg and
  the rendered key takes no params, there is **no missing-variable bug**. The
  contract's description is wrong but the implementation is correct.

### #662 team-approval cap align — **ACCEPT**

- Verified the claim: `approveRequest` slot loop is `for (let slot = 1; slot <= 50;
  …)` (signups/actions.ts:169) — already 50, not 4. actions.ts is **unchanged** on
  this branch (test-only PR, as claimed). ✓
- New test "#662: kaptein godkjent når slot 1–4 tatt → tildeles slot 5" asserts the
  captain gets `team_number === 5` and redirects to `?status=approved`. Against a
  `slot <= 4` impl the loop would exhaust → redirect `?error=no_team_slot`, so the
  test **would fail** against the old bug — valid regression guard. Mock helpers
  (`__fromCalls`, `lastRedirect`, `RedirectError`, captain constants) all exist;
  not a no-op.

## Scope-creep check

Clean. Every changed file maps to one of the five issues, plus expected meta files
(5 contracts, CHANGELOG, package.json/lock bump 1.133.6→1.133.9, prior eval report).
no.json/en.json each +5 lines = #678 (1 key) + #681 (3 keys) + 1 trailing-comma line.
No stray edits, no smuggled refactors.
