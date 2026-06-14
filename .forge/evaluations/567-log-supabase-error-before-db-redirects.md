# Evaluation: Logg Supabase-feilen før `?error=db_*`-redirects (#567)

**Branch:** `claude/jolly-wilson-ff56c0` vs `origin/main`
**Evaluator:** fresh-context skeptical pass
**Date:** 2026-06-14

## Method

- Read contract `.forge/contracts/567-log-supabase-error-before-db-redirects.md` fully.
- Enumerated every `?error=db_*` redirect site independently:
  `grep -rn "error=db_" app --include="*.ts" | grep -v ".test.ts"` → **51 sites across 11 files** (matches contract).
- Reviewed full branch diff (`git diff origin/main...HEAD`).
- Ran an automated coverage scan: for each of the 51 sites, checked for a `console.error` within the preceding 8 lines.
- Ran K5 (tsc), K6 (vitest), K7 (version/CHANGELOG/commit-prefix) gates.

## Per-criterion verdict

| Crit | Verdict | Evidence |
|---|---|---|
| **K1 — Full dekning** | **PASS** | Automated scan of all 51 sites flagged exactly ONE site without a nearby `console.error`: `flightActions.ts:89` (`if (!players) redirect(... db_roster)`). That is the documented exception — `players` comes from `fetchFlightPlayers`, which now logs `[fetchFlightPlayers] game_players read failed` at source (line 55), with an explanatory comment at the call site (lines 86-87). All other 50 inline sites have a logging `console.error` immediately above the redirect. The 4 files not in the diff (`signups/actions.ts`, `formats/actions.ts`, `inviteToGameActions.ts`, `spillere/actions.ts`) and the `db_winners` site in `avslutt/actions.ts:172` already had correct prefixed logging on `origin/main` (incl. the multi-line `console.error` at avslutt lines 168-171) — verified, not missed. |
| **K2 — Riktig feilobjekt** | **PASS** | Every added `console.error` passes the actual Supabase error variable that gates the redirect, not a bare string. Spot-checked the duplicated `if (error)` sites in `admin/games/[id]/actions.ts`: `reopenScorecard` → `[reopenScorecard] reopen update failed`, `error`; `adminWithdrawPlayer` → `[adminWithdrawPlayer] withdraw update failed`, `error`; `adminUndoWithdraw` → `[adminUndoWithdraw] undo-withdraw update failed`, `error` — each uses the correct function prefix. Also verified `gpError`, `teeError`, `rosterUsersError`, `updateError`, `statusError` (startGame); `existingTeesError`/`gameRefsError`/`courseUpdateError`/`deleteHolesError`/`insertHolesError`/shadowed loop `error`/`restoreError` (courses edit); `countError`/`error`/`statusErr`/`gpError`/`rosterErr`/`gameError`/`deleteError`/`insertError` across the rest. |
| **K3 — Disambiguerte db_roster** | **PASS** | The two `db_roster` sites in `admin/games/[id]/actions.ts` have distinct messages: line 180 → `[startGame] game_players read failed`; line 207 → `[startGame] roster users read failed`. |
| **K4 — Ingen oppførselsendring** | **PASS** | Removed lines are exclusively old single-line `redirect(...)` / `return null` being re-wrapped into block form; added non-comment/non-brace lines are `console.error`, the re-opened `if (cond) {` guards (conditions byte-identical to originals — verified `if (gpError || !gamePlayers)` matches exactly), and the moved redirect/return. `db_*` redirect count across the 7 changed source files is identical 36→36; no codes/targets added, removed, or altered. No logic edits. |
| **K5 — Typecheck grønt** | **PASS** | `npx tsc --noEmit` → exit 0, no output. |
| **K6 — Eksisterende tester grønt** | **PASS** | `npx vitest run app/[locale]/admin/games/[id]/actions.test.ts app/[locale]/admin/courses/[id]/edit/actions.test.ts` → 2 files passed, 35 tests passed. |
| **K7 — Ingen versjonsbump** | **PASS** | `package.json` version `1.126.1` on both `origin/main` and HEAD. `CHANGELOG.md` untouched vs `origin/main`. Commits are `chore(observability)` ×2 + `docs(forge)` ×2 — no feat/fix/perf, so the commit-msg hook correctly does not require a bump. |

## Scope notes

- Changed files: 7 source files (all within the contract's 11-file scope) + the contract doc. No out-of-scope or out-of-worktree files touched. Working tree clean.
- The contract was refined in a later commit (7227f035) to record the site count, the block-wrap decision, and the source-log exception — the refinement matches the implementation, not the reverse-justification of a gap.
- No gold-plating: the deliberately-excluded `not_found`/`not_active`/auth `?error=` redirects were left untouched.

## Gaps found

None.

VERDICT: ACCEPT
