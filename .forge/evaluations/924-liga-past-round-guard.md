# Evaluation: #924 — Past-window guard on liga round creation

**VERDICT: ACCEPT**

Commit `c57ab5c` ("fix(league): block creating liga rounds with an already-closed window"). All
three gates pass; every success criterion verified against the code, not the claims. Cup
dropped-scope claim confirmed true by reading both cup paths.

## Gate output (Node v22.23.0)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | **0 errors** (exit 0) |
| `npx eslint lib/league/actions.ts LigaAddRound.tsx CreateLigaForm.tsx` | **0 errors**, 2 complexity WARNINGS only (`createLeagueDraft` 62, `CreateLigaForm` 37 — both pre-existing, contract permits) |
| `npx vitest run actions.test.ts generateRounds.test.ts gamePayload.test.ts catalogParity.test.ts` | **287 passed (4 files)** |

## Per-criterion table

| # | Criterion | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | `addLeagueRound` blocks past `closes_at` (`round_in_past`), no insert; future proceeds | PASS | `actions.ts:309` guard `if (isTeeOffInPast(closesAt)) return { error: 'round_in_past' }`, placed AFTER `requireAdminOrClubAdminOfLeague` (`:301`) and the `window`-order check (`:305`), BEFORE the insert (`:330`). Test `actions.test.ts:267-294` asserts past→`round_in_past` + no `league_rounds` insert in `__fromCalls`; future (2099)→`{error:''}` + insert present. |
| 2 | `createLeagueDraft` blocks fully-past season (`season_over`), no `leagues` insert; mid-season still creates; `generateRounds` moved before insert; checks LAST window | PASS | `actions.ts:151-154`: `const windows = generateRounds(...)` hoisted above the `leagues.insert` (`:156`); check is `isTeeOffInPast(windows[windows.length-1].closes_at)` — the LAST window, not `season_start`. Old `generateRounds` call removed from below insert (diff shows it deleted at old L166). Round-insert block (`:180-201`) reuses the hoisted `windows`. Test `actions.test.ts:313-331` asserts 2020 season→`season_over` + no `leagues` insert. Mid-season legality follows from last-window logic + #675/#737 tests reaching the insert. |
| 3 | `updateLeagueRound` + `overrideRoundWindow` unchanged; `overrideRoundWindow` documents exemption | PASS | `updateLeagueRound` (`:244-282`) untouched by diff. `overrideRoundWindow` only gained a comment (`:364-365`): "intentionally NOT guarded against a past window — this path exists to reopen/extend...". No behavioral change. |
| 4 | Cup: no code; no tee-off field; manual path #902-guarded | PASS (claim TRUE) | Grep of `lib/cup/actions.ts` + `app/[locale]/admin/cup/[id]/generer/actions.ts` for `tee_off\|scheduled\|date\|tee_time`: zero datetime fields. Cup `games` insert (`generer/actions.ts:212-225`) sets `status:'scheduled'`, no `scheduled_tee_off_at`. Diff touches no cup file. |
| 5 | Reuses `isTeeOffInPast` + `TEE_OFF_PAST_GRACE_MS`; no new constant, no rename | PASS | `actions.ts:14` `import { isTeeOffInPast, parseOsloDateTimeLocal }`. `gamePayload.ts:41,53` helper + 5-min constant unchanged. No new grace constant anywhere in diff. |
| 6 | Unit tests exercise the guard; past-rejected tests assert NO insert | PASS (not vacuous) | `buildSupabaseMock` records every `insert` into `__fromCalls` (`tests/serverActionMocks.ts:130-131` → `rec('insert',...)` → `:81 push`). Both reject tests `.find(insert).toBeUndefined()` — meaningful because insert IS recorded when reached. Far-past 2020 / far-future 2099 fixtures are drift-proof. |
| 7 | Both i18n keys in no+en; both components recognize codes (no fallback leak) | PASS | `no.json:3529/3699` + `en.json:3529/3699` carry `season_over` + `round_in_past`. `LigaAddRound.tsx` added `'round_in_past'` to the `.includes` tuple AND the cast union (→ `t('errors.round_in_past')`, not `errors.fallback`). `CreateLigaForm.tsx` added `season_over:1` to recognized-codes object AND cast union (→ not `errors.unexpected`). catalogParity test green confirms no/en structural match. |
| 8 | Same 5-min grace; now/future accepted | PASS | Identical `TEE_OFF_PAST_GRACE_MS = 5*60*1000` via shared helper. Future 2099 test accepted. |
| 9 | Patch bump 1.141.2 + CHANGELOG `· #924` under open 1.141.y theme | PASS | `package.json:version 1.141.1→1.141.2`. CHANGELOG `[1.141.2] - 2026-06-24 · #924` sits under the open "Spillerens klubbhus" series, above 1.141.1. |

## Active problem hunt

- **Same-day-start league ending today:** A season ending today closes at Oslo 23:59 (`generateRounds.ts:60` `endOfSeasonMs = osloInstant(...,'23:59')`); the last window's `closes_at` is tonight, well in the future relative to a morning/afternoon `now` minus 5-min grace → NOT blocked. Correct. (Only blocked if run after ~23:54 today, which is the intended "already over" boundary.)
- **`custom` frequency → empty windows:** `generateRounds.ts:52` returns `[]` for `custom`; guard is `windows.length > 0 && ...` → check skipped → league creates with no rounds, exactly as before. Also `:56`/`:61` return `[]` for NaN/inverted dates → same safe skip.
- **AGENTS.md traps:** This is validation-only (returns before any write), so no 0-row-write or RLS concern introduced. The existing `expectAffected` 0-row guards on the insert paths are untouched. No migration/RLS/scoring touched per file boundaries.

## Minor notes (non-blocking, no rework required)

1. **Norwegian copy deviates from contract literal.** Contract spec'd "Velg en frist fram i tid" / "Velg datoer som strekker seg fram i tid"; shipped "Velg en som ligger fram i tid" / "Velg datoer fram i tid". This is the contract-sanctioned `humanizer` pass (implementation note line 88), not an unauthorized change.
2. **`createLeagueDraft` accepted-path test relies on 2026-season fixtures (#675/#737).** Those use `season_end: 2026-12-31` (future as of 2026-06-24), so they pass the new guard until 2027-01-01, after which they'd hit `season_over` and fail. Not a defect today; the new `addLeagueRound` accepted test uses drift-proof 2099. Worth a one-line awareness note for the maintainer but does not block #924.
