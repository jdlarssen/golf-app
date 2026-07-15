# Evaluation: #1143 — Cup admin fjern manuelle +match-lenker + slett dead updateTournament

**Branch:** claude/1143-cup-admin-fjern-match-lenker-slett-updatetournament (2 commits on main: f181f04a, af7dea7c)
**Verdict: ACCEPT**

Independent, fresh-context verification against `.forge/contracts/1143-cup-admin-fjern-match-lenker-slett-updatetournament.md`. All commands re-run in this session; no builder claims trusted without re-derivation.

## Diff scope

`git diff main...HEAD --stat` — exactly the 4 files the contract specifies:
```
app/[locale]/admin/cup/[id]/CupManagement.tsx | 35 +-----------
lib/cup/actions.ts                            | 81 +--------------------------
messages/en.json                              | 13 -----
messages/no.json                              | 13 -----
4 files changed, 5 insertions(+), 137 deletions(-)
```
No unrelated files touched. PASS.

## Success criteria — verified independently

1. **`updateTournament` fully gone, only stale references were the two sibling comments** — PASS.
   `grep -rn "updateTournament" --include="*.ts" --include="*.tsx" . | grep -v node_modules` → zero hits (function AND comments — both were rewritten to "bug-prevention #2", not just deleted-reference-free). Comment at `lib/cup/actions.ts:214` and `:302` now read `// #727: assert the ... touched a row (bug-prevention #2).` — matches AGENTS.md trap #2 ("0-row write = failure, not success"), an accurate rewording.

2. **No orphaned imports/helpers in `lib/cup/actions.ts`** — PASS (read full file, 414 lines).
   - `NAME_RE` → used line 128 (`createTournamentDraft`)
   - `TEAM_NAME_RE` → used lines 129–130
   - `parsePointsToWin` → used line 133
   - `parseAllowancePct` / `ALLOWANCE_DEFAULTS` → used lines 135–143 (5x each, all format allowances)
   - `expectAffected` → used lines 216 (`startTournament`), 304 (`finishTournament`)
   - `cupRedirectBase` → used lines 193, 284
   - `requireAdminOrClubAdminOfCup` → used lines 192, 283, 383
   All confirmed live. No dead imports left behind.

3. **CupManagement.tsx docstring rewritten, no longer frames +match links as a variant difference** — PASS.
   New text (`:43-45`): "Variant-forskjeller: shell (Admin/App), back/generer/slett-href, og at admin kan bore ned i hver match (SmartLink til /admin/games/[id]) mens club-varianten viser matchene som rene info-kort." No mention of the removed links. Accurately describes the remaining SmartLink drill-down vs. info-card difference (verified at `:289-296` — `isClub ? card : <SmartLink href=.../admin/games/${m.gameId}>{card}</SmartLink>`).

4. **`+match` grid removed, generate button + matches list intact, `Link` import still used** — PASS.
   Diff shows only the docstring comment + the entire `{!isClub && (...)}` block (old `:248-269`) removed. Generate button (now `:231-240`, gated on `tournament.status === 'draft'`, uses `<Link href={genererHref}>`) and matches list (`:241-301`) untouched in the diff. `Link` import (`:3`) still consumed at `:233`.

5. **`errorMessageMap` / `statusMessageMap` pruned to exactly the surviving producers** — PASS.
   Read current file: `errorMessageMap` (`:78-84`) = `start_failed, finish_failed, too_few_matches, wrong_status, already_finished` (5 keys, exactly the contract's list, all still produced by `startTournament`/`finishTournament`). `statusMessageMap` (`:85-90`) = `created, started, finished, matches_generated` (4 keys). Neither map contains `name/team_1/team_2/team_dup/points/update_failed/updated`.

6. **messages/no.json + messages/en.json — orphaned keys removed, no/en parity held** — PASS.
   Ran a python3 flatten-and-compare on both `cup.manage` trees:
   ```
   parity: True
   only in no: set()
   only in en: set()
   orphans present in no: []
   orphans present in en: []
   total keys no: 30 total keys en: 30
   ```
   Also: `grep -rn '"addSingles"\|"addGruesome"' messages/` → empty.

7. **No other file still references the removed i18n keys** — PASS.
   `grep -rn "manage\.errors\.name\|manage\.errors\.team_1\|manage\.errors\.team_2\|manage\.errors\.team_dup\|manage\.errors\.points\|manage\.errors\.update_failed\|manage\.statusMessages\.updated\|manage\.addSingles\|manage\.addFourball\|manage\.addFoursomes\|manage\.addGreensome\|manage\.addChapman\|manage\.addGruesome" --include="*.ts" --include="*.tsx" .` → zero hits outside the two edited files (which no longer contain them either).

   **Dynamic-lookup check** (`app/[locale]/admin/cup/page.tsx:35`, `t(\`manage.errors.${errorCode}\`)`): grepped every redirect target that reaches the bare `/admin/cup?error=` list route — all six call sites in `lib/cup/actions.ts` (`not_found` ×5, plus the `deleteTournament` failure paths which redirect to `/admin/cup/[id]/slett?error=delete_failed`, a *different* route with its own map) resolve to `error=not_found` only. `manage.errors.not_found` exists in both locales ("Cupen finnes ikke." / "Cup not found."). No orphaned code can reach this dynamic lookup. PASS.

## Gates (Node 22, `nvm use 22` confirmed → v22.23.0)

- **`npx vitest run lib/cup "app/[locale]/admin/cup"`** → `Test Files 9 passed (9)`, `Tests 110 passed (110)`. Matches contract claim exactly.
- **`npm run lint`** → `✖ 56 problems (0 errors, 56 warnings)`. All warnings are pre-existing `complexity`/`max-depth` lint rules on unrelated files (scorecardLayout, sideTournament, league/actions, etc.) plus one on `lib/cup/actions.ts:104` (`createTournamentDraft` complexity 27, pre-existing — not introduced by this diff, that function is untouched). 0 errors.
- **`npm run build`** → exit 0. No `MISSING_MESSAGE` anywhere in output. `/admin/cup`, `/admin/cup/[id]`, `/admin/cup/[id]/generer`, `/admin/cup/[id]/slett` all present and prerendered (◐ PPR) for no/en.
- Staging-render check: correctly left out of scope per the evaluation brief (builder-discretion gate, main session handles separately).

## Commit discipline

```
af7dea7c refactor(cup): remove manual +match links and orphaned cup i18n keys ... Refs #1143
f181f04a refactor(cup): delete dead updateTournament server action ... Refs #1143
```
Both `refactor(cup): ...` prefix, both have `Refs #1143` in body. Per-commit `--stat` confirms atomic split matches contract's suggestion (one for the dead action, one for UI+i18n cleanup) — each touches only the files its own message describes.

`git diff main...HEAD -- package.json CHANGELOG.md package-lock.json` → empty. No version bump, no CHANGELOG line, matching the `refactor`-label/no-bump decision in the contract.

Author identity: `jdlarssen <t7pvhqdtcf@privaterelay.appleid.com>` — correct repo identity, not overridden.

## Issues found

None. Every success criterion and every gate reproduces cleanly under independent re-verification. The diff is minimal, exactly scoped to the 4 files named in the contract, and the edge cases called out in the contract (dynamic `t()` lookup on the list page, allowance error codes left alone, no replacement UI for post-draft match-adding) all check out as designed.
