# Evaluation: Sidepoeng-oppsettet låses når cupen er startet (#1455)

Evaluated commit: `ef612987` (HEAD of `claude/contract-1455-daf3e4`)
Evaluator: fresh-context skeptic, 2026-08-07. All commands run independently in this worktree.

## Success Criteria

### 1. `saveSideAwardConfig` active → `cup_started`, no delete/insert — PASS

- Gate exists at `lib/cup/sideAwardActions.ts:111`: `if (cup.status !== 'draft') return { ok: false, error: 'cup_started' };`, placed directly after the `cup_finished` check (line 106).
- New Type A test at `lib/cup/sideAwardActions.test.ts:163–184`: mocks status `'active'`, asserts `{ ok: false, error: 'cup_started' }` AND asserts `adminMock.__fromCalls` contains no `delete`/`insert` against `tournament_side_awards`. The negative assertion is meaningful — the happy-path test (line 73–85) proves the same predicate finds delete/insert calls when they occur. Same mock style as neighbours (queue-based `buildSupabaseMock`).
- The mock queue has only 2 items (gate + cup lookup), so the test also proves the existing-rows read never happens for an active cup.
- `npx vitest run lib/cup/sideAwardActions.test.ts` → part of the 18/18 green run below.

### 2. Existing `cup_finished` test still green — PASS

- Test at `lib/cup/sideAwardActions.test.ts:147–161` unchanged (status `'finished'` → `cup_finished`), passes. Code order (line 106 before 111) guarantees finished cups never see `cup_started`.

### 3. `winners_already_registered` test updated to draft + winner row — PASS

- Test at `lib/cup/sideAwardActions.test.ts:186–214` now mocks status `'draft'` with an existing row carrying `winner_user_id: 'p1'`, asserts `winners_already_registered` and no delete/insert. The defence-in-depth branch (`sideAwardActions.ts:119–120`) is still exercised — it can only be reached with status `draft` now, which is exactly what the test does.

### 4. UI: `configEditable` draft-only + errorMap + read-only branch — PASS

- `app/[locale]/admin/cup/[id]/CupManagement.tsx:289`: `configEditable={tournament.status === 'draft'}` (old `active && no-winner` clause removed, verified in diff).
- `app/[locale]/admin/cup/[id]/SideAwardsPanel.tsx:70`: `cup_started: t('errors.cupStarted')` in errorMap.
- Read-only branch exists (`SideAwardsPanel.tsx:181–196`): recap list, no add/save controls; empty case uses new `emptyLocked` key (line 184). JSDoc (lines 19–22) updated to draft-only rule with #1455 reference.
- `SideAwardsPanel.test.tsx` untouched by the commit (per `git show --stat`); its two existing render tests cover editable and read-only modes (lines 32, 54) — no new Type C tests, per contract.
- Test run: green (see Gates).

### 5. i18n keys in both locales — PASS

Verified via python json parse (not grep-trust):

- no: `cupStarted` = «Cupen er i gang — sidepoeng kan bare settes opp før start.»
- en: `cupStarted` = "The cup is under way — side awards can only be set up before the start."
- Discretionary `emptyLocked` IS used by the component (SideAwardsPanel.tsx:184) and exists in both locales: no «Ingen sidepoeng ble satt opp for denne cupen.» / en "No side awards were set up for this cup."
- Old `empty` key still consumed in the editable branch (SideAwardsPanel.tsx:112) — no orphan key.

### 6. Version bump + CHANGELOG — PASS

- `git show ef612987^:package.json` → `1.216.6`; HEAD → `1.216.7` (exactly one patch). `package-lock.json` bumped in both spots.
- `CHANGELOG.md:1386` (Feilrettinger section): `1.216.7` · [#1455] line, version matches, user-facing Norwegian phrasing.

### 7. Staging verification — DEFERRED TO PR STAGE

PR-stage step handled by the orchestrator after this evaluation (staging-verify skill: active cup shows read-only list without Legg til/Lagre; winner registration still works). Not a failure.

## Gates (run independently, Node 22)

- `npx vitest run lib/cup/sideAwardActions.test.ts "app/[locale]/admin/cup/[id]/SideAwardsPanel.test.tsx"` → `Test Files 2 passed (2) · Tests 18 passed (18)`
- `npm run build` → green (full route summary printed, no errors)
- `npm run lint` → `✖ 57 problems (0 errors, 57 warnings)`, exit 0 — all warnings pre-existing (complexity/max-depth in untouched files)

## Skeptic pass

- **Other consumers of `SaveSideAwardConfigError`:** grep shows the type is referenced only inside `lib/cup/sideAwardActions.ts`. `SideAwardsPanel`'s errorMap is `Record<string, string>` with a `?? t('errors.saveFailed')` fallback, and the new member IS mapped. No missed call-site.
- **`cup_started` name collision:** all other hits are the NotificationKind namespace (`lib/notifications/*`) — different type, untouched, exactly as the contract predicted.
- **Gate ordering:** `finished` checked at line 106 before the draft gate at 111 — finished cups keep `cup_finished`. Proven by the still-green finished test.
- **Files touched:** `git show --stat` lists 9 files, all within the contract's Files Likely Touched list. Nothing extra.
- **`registerSideAwardWinner`:** untouched by the diff (no hunks in that function; its 4 tests unchanged and green). Out of Scope respected.
- **Atomic-or-compensated pattern:** delete-then-insert + compensating rollback untouched; rollback rationale in the updated doc-comment still holds (draft gate + winners gate together guarantee deleted rows are winner-less).
- **Copy quality:** «Cupen er i gang — sidepoeng kan bare settes opp før start.» matches the sibling `cupFinished` string's tone and punctuation; `emptyLocked` reads naturally. No AI-tells. Minor nit: en "under way" (two words) is slightly formal vs "underway", but correct English — not a blocker.

## Findings

None blocking. One cosmetic nit (en "under way" vs "underway") — not worth a rework cycle.

VERDICT: ACCEPT
