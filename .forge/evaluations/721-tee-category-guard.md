# Evaluation: #721 — tee-category guard

## Verdict: ACCEPT

The fix makes player categories (M/D/J) the selected tee can't rate unselectable in the create-game wizard, via three reinforcing layers (derived availability → disabled toggle → clamp on tee change → defensive publish backstop). All acceptance criteria hold under independent re-derivation, all four gates are green, and the skeptical probes surfaced no real failure path. Commit hygiene (PATCH bump + CHANGELOG + `fix(...)` + `Refs #721`, all in the same commit) is correct.

## Gate results (real output)

```
$ npx vitest run useGameFormState.test
 Test Files  1 passed (1)
      Tests  51 passed (51)
   Duration  761ms

$ npx vitest run messages/catalogParity.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)

$ npx eslint "app/[locale]/admin/games/new/useGameFormState.ts" "app/[locale]/admin/games/new/sections/TeamsAssignmentSection.tsx"
EXIT: 0   (no output)

$ npm run typecheck   (tsc --noEmit, whole project)
EXIT: 0   (no output — clean; no .next stale-cache errors seen)
```

## Criteria (AC1–AC7)

- **AC1 — Tilgjengelighet derivert. PASS.** `teeGenderAvailability` (useGameFormState.ts:770) maps `selectedTeeBox?.has_mens/has_ladies/has_juniors ?? true`; default all-true with no tee. Contract spec'd `availableTees.find`; impl deliberately uses `selectedCourse?.tee_boxes.find` (useGameFormState.ts:765) to avoid re-running the memo on the fresh-array identity of `availableTees` — a sound improvement, behaviorally equivalent. Tests: 4 cases (no-tee all-true, men-only, M+D-no-J, reset-on-course-change) all pass.

- **AC2 — Klem ved tee-bytte. PASS.** `setTeeBoxId` (useGameFormState.ts:565) sets raw then clamps every player's gender via `clampGenderToTee`. Tests prove junior→M and dame→M on men-only-tee, junior→M on M+D-tee (J unavailable), and dame keeps D / man keeps M when valid. The clamp looks the tee up via `courses.flatMap(...)` (NOT `availableTees`/`selectedTeeBox`), so it is correct even when `setCourseId`+`setTeeBoxId` run in the same `act()` batch — verified the tests do exactly that and pass.

- **AC3 — `clampGenderToTee` ren + korrekt. PASS.** Pure exported fn (useGameFormState.ts:154): returns `g` if available, else first of `['M','D','J']` available, else `g` (never empty). `it.each` has 6 meaningful cases, including the contract's required J-on-{M}→M, D-on-{M,J}→M, M-on-{M,D,J}→M, J-on-{M,D,J}→J, plus D-on-{F,T,T}→D and J-on-{F,T,F}→D. No trivial passes. Trace of `['D',{M:true,D:false,J:true},'M']`: D unavailable → fallback finds M first → M. Correct.

- **AC4 — Toggle disabler utilgjengelig kategori. PASS.** Both toggle sites (best-ball flight grid ~line 382 and tee-per-player ~line 448) were replaced with the extracted `PlayerGenderToggle` (TeamsAssignmentSection.tsx:40). It renders `disabled={unavailable}` where `unavailable = !teeGenderAvailability[g]`, with muted styling + explanatory `title`. Verified by code reading; the underlying `teeGenderAvailability` is unit-tested at the hook level (AC1). One Type-C render test is unnecessary (see probe 8).

- **AC5 — Defensiv publish-guard. PASS.** `playersWithUnratedCategory = selectedPlayerIds.filter((pid) => !teeGenderAvailability[playerGenders[pid] ?? 'M'])` (useGameFormState.ts:1379) is added to `canPublish` (`...length === 0`) and pushes `categoryMissingRating` into `missingForPublish`. Test sets up a genuinely-publishable solo-stableford on a men-only tee (canPublish true, captures baseline missing-count), forces `p-mann` to `J`, asserts canPublish→false and missing-count → baseline+1. Real, non-trivial assertion.

- **AC6 — i18n komplett + bilingual. PASS.** Both keys present with matching paths in both catalogs: `...teams.categoryNotRated` (no: «Tee-en mangler rating for denne kategorien»; en: "This tee does not have a rating for this category") and `...missing.categoryMissingRating` (no: «en eller flere spillere har en kategori tee-en ikke støtter»; en: "one or more players have a category the tee does not rate"). `catalogParity` test green (3/3). Norwegian uses «mangler rating» / «støtter» — no «rater»-anglicism. Clean.

- **AC7 — Gates grønne + bump/CHANGELOG i samme commit. PASS.** All four gates green (above). `git show 510b4132` includes package.json 1.133.16→1.133.17, CHANGELOG.md entry, and the code — one atomic `fix(wizard): ...` commit with `Refs #721`. CHANGELOG tagline matches the contract's intent (humanized, action-oriented Norwegian).

## Skeptical probes

1. **clampGenderToTee fallback order.** Correct. It returns `g` only when `avail[g]`; otherwise the first available of `['M','D','J']`; final `?? g` is unreachable in practice (a tee always rates ≥1 category) and never returns an *invalid* category when one IS available. The `it.each` cases are meaningful (no trivial-pass duplicates of the input). No way to return an unavailable category while a valid one exists.

2. **Clamp robust to render timing + BasicsSection wiring.** Confirmed. The clamp in `setTeeBoxId` uses `courses.flatMap((c) => c.tee_boxes).find(...)` — independent of the `selectedCourse`/`availableTees` memos that need `courseId` already committed. Tee ids are globally unique, so the same-batch `setCourseId`+`setTeeBoxId` path (the reason 3 tests originally failed) now clamps correctly; the AC2 tests exercise exactly that and pass. BasicsSection.tsx:135 calls the exported wrapper `setTeeBoxId` (destructured :60), NOT a raw setter; `setTeeBoxIdRaw` is internal-only (never in the return object at :1593). No real-wizard path leaves a player on an invalid category after a tee change — the clamp is authoritative.

3. **Toggle disabling + hidden input serialization.** Both toggle locations use `PlayerGenderToggle` with `disabled={!teeGenderAvailability[g]}` wired. The hidden `player_${pid}_gender` input binds `value={playerGenders[pid] ?? 'M'}` — i.e. to React state, not to which button is enabled. A disabled button can't be clicked (can't set an invalid value), and the clamp already rewrote any stale invalid state to a valid category before this renders. So a clamped player serializes the RIGHT (clamped) value. No "disabled-but-selected category gets serialized" leak.

4. **Defensive guard ignores unselected players.** Confirmed. `playersWithUnratedCategory` filters `selectedPlayerIds` only, so an unselected player carrying a stale gender in the `playerGenders` record is not iterated and cannot block publish. `canPublish` and `missingForPublish` both read the same derived `playersWithUnratedCategory` — they agree by construction.

5. **Server-side untouched.** Confirmed — `git show --stat` shows no gamePayload.ts / actions / route / .sql changes. Acceptable and matches the contract's explicit scope-out: this is preventive UX, and `getRatingForGender` already null-guards (auto-start degrades gracefully rather than 500s). Minor residual I'd note, not block on: a hostile direct PATCH or pre-existing edit-data could still persist an invalid gender server-side; the client guard doesn't close that, but it was never in scope and the failure mode is graceful, not a crash.

6. **i18n.** Both keys in both catalogs, matching paths, parity test green. Norwegian copy avoids the «rater» anglicism (uses «mangler rating»/«ikke støtter»). Correct.

7. **Version/CHANGELOG.** package.json bumped 1.133.16→1.133.17, CHANGELOG entry added, both in the SAME commit as the fix, prefix `fix(wizard)`. Correct per version-bump discipline.

8. **Playwright necessity.** NOT necessary. The disabled-button is a pure function of `teeGenderAvailability` (unit-tested at the hook level, AC1) mapped to a DOM `disabled` attribute by a one-line presentational component. The men-only-tee scenario needs specific seed data that exists in the test fixture but not reliably in staging/prod. Hook-level unit coverage + code reading is the right level; Playwright would add cost for negligible confidence gain.

## Findings

- **None blocking.**
- **(Informational, not actionable for this PR)** Server-side gender validation is deliberately absent (contract scope-out); a direct PostgREST PATCH or pre-existing edit-data could persist an invalid category, but auto-start handles missing rating gracefully (no crash) so this is acceptable as documented. No new issue warranted unless owner later wants defense-in-depth.
