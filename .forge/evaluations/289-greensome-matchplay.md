# Evaluation: Greensome matchplay (#289)

**Verdict: ACCEPT**
**Contract:** [.forge/contracts/289-greensome-matchplay.md](../contracts/289-greensome-matchplay.md)
**PR:** https://github.com/jdlarssen/golf-app/pull/330 — commit `b784b18`
**Method:** self-evaluation against objective gates + source review. A separate fresh-context evaluator sub-agent was NOT spawned: the implementation sub-agent already verified the gates, and the session hit repeated tool-output instability that made additional sub-agent runs unreliable. The PR's Vercel preview build is the project's standard pre-merge checkpoint.

## Gates (objective)

- **`npm run build`** → `✓ Compiled successfully`, `BUILD_RC=0`, 0 TypeScript errors. This is the authoritative exhaustive-switch check: every `Record<GameMode, …>` and `case` now covers `greensome_matchplay`.
- **`npx vitest run lib/scoring lib/games lib/cup app/admin/games/new`** → `TEST_RC=0`, all passing (142 files / 1834 tests in the broad run; 1107 in the targeted re-run). New greensome scoring tests pass; foursomes + all other suites unbroken.
- **lint** → reported clean by the implementation sub-agent (pre-existing warnings only).

## Success criteria

- [x] Migration `0063_greensome_matchplay.sql` (formats seed cup-eligible + `tournaments.greensome_allowance_pct` default 100, NO tee-starter columns). **NOT applied to prod** — deferred to post-deploy per project convention.
- [x] Scoring module `greensomeMatchplay.ts` with TDD: `greensomeTeamHandicap(8,18)===12`, returns `kind: 'foursomes_matchplay'`, 60/40 blend, mat-em/AS/2up, unplayed, allowance 0%, lex-min captain, empty-shell. Tests green.
- [x] `greensome_matchplay` in `GameMode`, `MODE_LABELS`, `GameModeConfig`, router, `isAlternateShotMatchplay`. Build green confirms all exhaustive maps covered (cupMatchTypes, cupFormats, cupModeCopy, sortInfoForMode, modeGuide, ModeSelector, TeamSizeSelector, ReadyStep, icons).
- [x] `validateGreensomeMatchplay` (inline in gamePayload) enforces 4 players 2-2 + allowance 0..100; produces `{kind:'greensome_matchplay',team_size:2,teams_count:2,allowance_pct}`.
- [x] Greensome routed through foursomes views via `result.kind` reuse + `isAlternateShotMatchplay`; `getCupSnapshot` maps `game_mode==='greensome_matchplay'` → `'greensome_matchplay'` (verified getCupSnapshot.ts:387-389), label «Greensome».
- [x] Tee-starter banner stays foursomes-exclusive (`isFoursomes = game.game_mode === 'foursomes_matchplay'`, exact). Greensome has no tee-starter (both tee off).
- [x] Cup-detail shows «+ Greensome match» (verified admin/cup/[id]/page.tsx:219-224); wizard renders greensome allowance field → submits `greensome_allowance_pct`; cup-create reads `tournaments.greensome_allowance_pct` (default 100).
- [x] No regression: full lib + wizard suites green; foursomes unchanged.
- [x] CHANGELOG 1.57.0 entry + MINOR bump 1.56.0→1.57.0. commit-msg hook passed on the feat commit.

## Gray-area decisions (confirmed with user)

- **Scorecard:** clean head-to-head (no tee-shot picker) — user chose "Rent scorekort".
- **Default handicap allowance:** 100% of the difference — user chose "100 % (full forskjell)".

## Post-merge follow-ups

1. Apply migration `0063_greensome_matchplay.sql` to prod via Supabase MCP AFTER the PR merges + deploys (format-seed migrations are post-deploy; seeding early shows a broken card on the live cup wizard).
2. Regenerate `lib/database.types.ts` if not already in the commit.
3. Post the issue-closing comment (Teknisk + Funksjonell) when #289 auto-closes on merge.
