# Evaluation: #1170 — Onboarding starter aldri på null

**Branch:** `claude/1170-onboarding-progress` · **PR:** #1215 · **Verdict: ACCEPT**

Independently re-verified against `.forge/contracts/1170-onboarding-aldri-start-paa-null.md`.
Did not trust the checked-off contract boxes or prior claims — re-ran diffs, parsed both
message catalogs with Node, re-ran tsc/vitest, and read the staging proof comment directly.

## Success Criteria

| # | Criterion | Verdict | Evidence I personally observed |
|---|---|---|---|
| 1 | Indicator shows 3 steps, step 1 ("Konto opprettet") marked done on arrival — never at zero | PASS | `OnboardingProgress.tsx:5-9` `STEPS` array hardcodes `step1:'done'`; rendered branch at line 55 emits a checkmark `<svg>` (path `M4 10.5l4 4 8-9`) when `state === 'done'`, not the index number. `bg-accent text-primary` styling (line 16) = champagne accent per contract. |
| 2 | Step 2 active, step 3 upcoming | PASS | `STEPS` array: `step2:'active'` → `bg-primary text-white`, renders `index+1` = "2"; `step3:'upcoming'` → `border-border bg-surface text-muted`, renders "3". `data-state` attribute on each `<li>` (line 48) makes this machine-checkable, matching the staging proof's structural oracle. |
| 3 | No new Supabase queries in `page.tsx`; no migrations | PASS | `git diff origin/main...HEAD -- "app/[locale]/complete-profile/page.tsx"` = exactly 2 added lines: the `OnboardingProgress` import and its `<OnboardingProgress />` mount between header and `Card`. Nothing else in the file changed. `grep -n "\.from(" page.tsx` returns exactly one hit (line 66, pre-existing `users`/`profile_completed_at` gate query). `git diff --name-only origin/main...HEAD \| grep migrations` → empty. Full changed-file list: `.forge/contracts/...md`, `CHANGELOG.md`, `OnboardingProgress.tsx`, `page.tsx`, `messages/en.json`, `messages/no.json`, `package-lock.json`, `package.json` — no `supabase/migrations/` entries. |
| 4 | New keys in both `no.json` and `en.json`; `catalogParity.test.ts` green; `/en` shows English | PASS | Parsed both catalogs with `node -e` (not grep, per instructions): `onboarding.progress.{summary,step1,step2,step3,status.done,status.active,status.upcoming}` present in both, with correct NO ("Konto opprettet", "1 av 3 fullført", "aktivt steg", …) and EN ("Account created", "1 of 3 done", "current step", …) values. `catalogParity.test.ts` does a real recursive flatten-and-compare of leaf keys against every `messages/*.json` via `import.meta.glob` — not a superficial top-level check. Ran it live (below): passes. |
| 5 | Norwegian copy run through humanizer before commit | PASS (documentation-based) | Contract's evidence line states humanizer was run on all seven strings with no changes needed. I can't re-run the humanizer skill as part of this evaluation, but manual read of the seven strings (`Konto opprettet`, `Fullfør profilen`, `Spill din første runde`, `1 av 3 fullført`, `fullført`, `aktivt steg`, `gjenstår`) shows no AI-tell patterns (no em-dash overuse, no "it's important to note", idiomatic bokmål consistent with existing `wizard.stepCounter` terminology). Judged plausible, not independently re-executed. |
| 6 | Staging click-through: fresh user lands on `/complete-profile` and sees the indicator; screenshot on PR | PASS | Read the proof comment directly via `gh api repos/jdlarssen/golf-app/issues/1215/comments`. It documents a three-oracle verification (structure: `[data-testid=onboarding-progress]` + 3 `onboarding-step` nodes + `data-state=['done','active','upcoming']` + step-1 check svg; console: error-free; SQL/state: `profile_completed_at=null` confirmed via staging DB) for both `/no` and `/en`, with verbatim rendered strings for each locale. `gh pr view 1215 --json labels` confirms the `staging-verified` label is present. Prod-guard note confirms all calls hit staging ref `snwmueecmfqqdurxedxv`, and the test user was deleted afterward. |

## Gates (re-run myself, Node 22)

| Gate | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | PASS | Exit 0, zero output. `EXPECT: no errors` matched. |
| `npx vitest run "app/[locale]/complete-profile" messages/catalogParity.test.ts` | PASS | 2 test files, 9/9 tests passed. `EXPECT: all pass` matched. |
| `npm run lint` | SKIPPED | Per task instructions — already verified green this session; not re-run here. |
| `npm run build` | SKIPPED | Per task instructions — already verified green this session; not re-run here. |
| MINOR bump + CHANGELOG Funksjon-row | PASS | `git diff origin/main...HEAD -- package.json` (and matching `package-lock.json`) shows `1.187.0` → `1.188.0` only. `CHANGELOG.md` diff shows one new `<details>` block under `## Funksjoner`: "1.188 · Onboardingen starter aldri på null", linked to #1170, action-oriented tagline in the established voice. |

## Additional checks performed

- **Purely presentational component:** `OnboardingProgress.tsx` has no `'use client'` directive, no `useState`/`useEffect`/other hooks, no Supabase import — it's an `async function` server component using only `getTranslations` from `next-intl/server`. Confirmed by full file read.
- **Accessibility (contract edge case):** semantic `<ol>`/`<li>` structure with `aria-hidden` on the decorative glyph and an `sr-only` span carrying the status word (`(fullført)`/`(aktivt steg)`/`(gjenstår)`) in text — matches the "not color/icon only" guardrail.
- **Commit history sanity:** 4 commits on the branch (`feat` → `docs(forge)` contract checkoff → `test(auth)` adding `data-testid`/`data-state` → `docs(forge)` staging record). No stray edits outside the declared file set; `package-lock.json` diff is exactly the 2-line version bump (6 changed lines total).
- **Out-of-scope guardrails respected:** no changes to `completeProfile` action, no dynamic step-3 checking (no new `game_players` query), no `/profile` percentage chip — all consistent with the contract's "Out of Scope" section.

## Gaps

None found. All six success criteria and all five gates (two skipped per explicit task instruction, both already green this session) hold up under independent re-verification.
