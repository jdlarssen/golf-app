# Evaluation: #1702 — CHANGELOG som ukeblokker

**Contract:** `.forge/contracts/1702-changelog-ukeslipp.md` · **Branch:** `claude/forge-auto-1702-b7955a`
**Evaluated commits:** f05250ab (contract), df8ec3b9 (script+tests), 2d9e93f4 (CHANGELOG move), c0898783 (docs), 9ec9aa20 (CLAUDE.md) — plus 0ebc46f7 (README follow-up, remote only).
**Evaluator:** fresh-context skeptical review, round 1, 2026-08-17. All evidence produced in this session.

## Verdict

ACCEPT

## Success Criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Vitest/typecheck/lint green | PASS | `npx vitest run scripts/weekly-release.test.mjs` → 45/45 green. `npx tsc --noEmit` → exit 0. `npm run lint` → exit 0 (56 warnings, all pre-existing in unrelated files, e.g. `lib/wizard/fitsPlayerCount.ts`). Full `npx vitest run` → see Gates. |
| 2 | Dry-run shows one block, no prefix, rettinger drawer, clean tree | PASS | Created temp feat+fix notes; `node scripts/weekly-release.mjs --dry-run` printed `Bump: minor (1.233.0 → 1.234.0)` and exactly ONE hunk inserting `### 1.234.0 · mandag 17. august 2026` directly under `## Ukeslipp`, above the existing 1.233.0 block; feature row `<summary><strong>Evaluator-testfunksjon</strong></summary>` without version prefix; `<summary>4 rettinger</summary>` drawer (3 real pending notes + my temp fix). Temp notes deleted; `git status --short` empty. No builder leftovers in `.changes/` (only 3 legitimate pending notes + README). |
| 3 | Grep ports + nothing lost in the move | PASS | All 16 ports pass (see Gates). Deep check: alfa section byte-identical (`cmp` clean); the 4 moved feature summaries identical and in original order after prefix-strip; the 70 moved fix lines identical and in original order after badge-strip; the 225 remaining folded summaries in identical order; sorted-line diff of normalized old vs new shows ONLY the prescribed structural changes (header comment, intro, headings, fold wrapper, drawer, August 111→41, 5 blank lines). Issue links 658=658, `- `-lines 646=646, `↳`-CTA lines 67=67, `<details>`/`</details>` 279→281 both. GitHub render of the branch file confirms heading order Changelog → Ukeslipp (1.233.0, 4 rows + «70 rettinger») → Før ukeslippene (fold present); `<details>` markup follows the exact prod-proven alfa pattern (0 summaries missing their following blank line). |
| 4 | Sweep gives 0 hits outside historical docs | PASS* | `grep -rn "## Funksjoner\|## Feilrettinger\|måneds-skuff\|Funksjon-rader øverst" docs CLAUDE.md .github scripts` → 3 hits, all substring/legit: `docs/changelog-conventions.md:43` (describes the frozen fold, «Røres ikke») and `scripts/weekly-release.test.mjs:54,62` (fixture lines for the NEW `### Funksjoner`/`### Feilrettinger` demoted headings the contract itself mandates). No document describes the old two-section format as current. Wider sweep (`to-seksjons`, `én linje per utgivelse`, `Feilrettinger-linje`, `month drawer` across *.md/*.mjs/*.sh/*.ts) found nothing stale; the builder additionally caught a stale README.md line in remote commit 0ebc46f7 that my patterns missed. |
| 5 | Utroperen field-lifting works for new and old rows, drawer excluded | PASS | `docs/loops/utroperen.md:12-17`: title = `<summary>` text, with the fold-row rule «teksten etter ‘X.Y · ’-prefikset — nye rader har ikke prefiks» — covers both shapes. `:51-54`: «Rettinger-skuffen (`<summary>N rettinger</summary>`, punktliste) er ALDRI en lanserings-kandidat — det er tabell-innhold, ikke funksjoner» — explicit exclusion; the `<strong>`-vs-plain distinction is also documented in `docs/changelog-conventions.md:83`. `:66-68`: arkiv-kandidater from the fold get the same sannhetssjekk. An LLM routine following these rules cannot mistake the drawer for a feature row. |

\* Criterion 4 read literally («0 treff») fails on 3 hits, but each hit is the new format's own vocabulary or an explicitly historical description — judged as satisfying the criterion's intent. Noted as NITPICK below.

## Findings

1. **NITPICK — criterion-4 sweep has 3 formal hits.** `docs/changelog-conventions.md:43` and `scripts/weekly-release.test.mjs:54,62` match the sweep patterns via substring (`### Funksjoner` contains `## Funksjoner`; «måneds-skuffer» in a «Røres ikke» sentence). Neither file is on the contract's exemption list, but none describes the old format as current — the hits are the new design's own words. No action needed.
2. **NITPICK — local worktree one commit behind remote.** Remote branch HEAD is 0ebc46f7 (`docs(readme): describe the changelog as it is now`, README.md one-liner); the local worktree stops at 9ec9aa20. The extra commit is a legitimate in-scope docs fix with `Refs #1702`; only README.md differs, so no verification above is invalidated. The session should `git pull` before any further local work on this branch.
3. **NITPICK — contract's blank-line-before-`</details>` guideline not followed, matching precedent.** The contract's edge-case section says to keep a blank line before `</details>`, but neither the renderer nor the moved file does — identical to the pre-existing, prod-proven style (239 instances of content-then-`</details>` in the old file, 240 in the new). GitHub renders this fine (the whole old CHANGELOG proves it). The load-bearing rule — blank line after every `<summary>` — holds everywhere (0 violations).

No BLOCKER or SHOULD-FIX findings.

**Additional hunts (all clean):**
- Duplicate-version guard fires on the REAL file: `applyToChangelog(changelog, {version: '1.233.0', …})` → throws «CHANGELOG.md har allerede en blokk for 1.233.0 — skriver ingenting».
- `tests/changelogLinks.test.ts` is format-agnostic (regex `↳ (\/\S*)` over the whole file), still covers all 67 moved CTA links; 23/23 pass.
- Test migration audit (old vs `git show ec0d6104:scripts/weekly-release.test.mjs`): removed cases all tested month-drawer machinery that no longer exists (`monthLabel`, drawer counter increment, new-month drawer, per-section edits); replaced by `weekLabel`, `renderWeekBlock` (4 cases incl. singular/issue-less), and a NEW fail-closed duplicate-version case. No coverage lost without replacement.
- All six commits carry `Refs #1702`; move-commit 2d9e93f4 has the required counts in its body (646→646, 658→658, 279→281×2, 111→41).
- PR #1703 is a draft with `Closes #1702`, a Fordeler/ulemper block, and the required «Til eier» section on the Utroperen sky-prompt owner-step. `.github/**` touched → card gives button, not auto-merge, as the contract expects.

## Gates

```
$ npx vitest run scripts/weekly-release.test.mjs   (Node v22.23.0)
 Test Files  1 passed (1)
      Tests  45 passed (45)

$ npx tsc --noEmit
(exit 0, no output)

$ npm run lint
✖ 56 problems (0 errors, 56 warnings)   # all pre-existing, unrelated files
(exit 0)

$ npx vitest run tests/changelogLinks.test.ts
 Test Files  1 passed (1)
      Tests  23 passed (23)

$ npx vitest run   (full suite)
 Test Files  491 passed (491)
      Tests  6508 passed (6508)
(exit 0)

$ node scripts/weekly-release.mjs --dry-run   (with temp 9998-feat + 9999-fix notes)
Bump: minor (1.233.0 → 1.234.0)
@@ CHANGELOG.md linje 19 @@
 ## Ukeslipp
+### 1.234.0 · mandag 17. august 2026
+<details>
+<summary><strong>Evaluator-testfunksjon</strong></summary>
+[#9998](…/9998) — En midlertidig testfunksjon for evaluering.
+↳ /demo · «Prøv i demoen»
+</details>
+<details>
+<summary>4 rettinger</summary>
…
 ### 1.233.0 · mandag 17. august 2026
(--dry-run: ingenting skrevet, ingen notater slettet)   # temp notes deleted after; git status clean

Grep ports (new CHANGELOG.md — all expected values met):
^## Ukeslipp$ = 1 · ### 1.233.0 · mandag 17. august 2026 = 1 · ^## Før ukeslippene = 1 ·
^## Før 1.0 — alfa-historikk$ = 1 · ^## Funksjoner$ = 0 · ^## Feilrettinger$ = 0 ·
^### Funksjoner$ = 1 · ^### Feilrettinger$ = 1 · <summary><strong>1.233 ·  = 0 ·
`1.233.0` = 0 · <summary>70 rettinger</summary> = 1 · August 2026 · 41 rettinger = 1 ·
dash-lines 646=646 · issue-links 658=658 · CTA-lines 67=67 · <details> 279→281 · </details> 279→281

Preservation: alfa section cmp = byte-identical · 4 feat rows order-identical ·
70 fix lines order-identical · 225 folded summaries order-identical ·
sorted normalized diff = only prescribed structural lines (30 diff lines, all accounted for)

Duplicate guard on real file: GUARD FIRED: «CHANGELOG.md har allerede en blokk for 1.233.0 — skriver ingenting»
```
