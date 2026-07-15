# Evaluation: Betaling-admin — fjern redundant summary-kort + gate kompakt-linje på withdrawn_at

**Verdict:** ACCEPT

Issue #1145 · PR #1254 · Branch `claude/issue-1145-payment-summary-40f7f1`
Evaluated at commit `052d5357`, against `origin/main`. All evidence below was gathered independently by the evaluator; the implementer's self-reported checkmarks in the contract were not taken on trust.

## Criteria

| # | Criterion | Verdict | Evidence (gathered by evaluator) |
|---|---|---|---|
| 1 | `/betaling` no longer shows the «Startkontingent {beløp}» / «X av Y betalt» card — only heading, game name, roster | ✅ | `betaling/page.tsx:89-118` read live: `<div data-testid="betaling-content">` contains exactly `header` → then the `entry_fee_kr <= 0` ternary → `MiniRibbon` + `BetalingClient`. No `bg-surface-2` card, no summary JSX anywhere in the file. Card JSX deleted in `a0dcdd74`. |
| 2 | `formatKr` import and `active`/`paidCount`/`totalCount`/`missingCount` gone, no remaining references | ✅ | `grep -nE 'formatKr\|paidCount\|totalCount\|missingCount\|\bactive\b'` on the live file → **single hit at line 17**, which is the `status: 'draft' \| 'scheduled' \| 'active' \| 'finished'` type union, not the deleted variable. Zero references to the removed symbols. `npm run build` exit 0 independently confirms no orphan use. |
| 3 | `summaryLabel`/`summaryCount`/`summaryMissing` removed under `admin.game.betaling` in BOTH catalogs; other `summaryLabel` keys untouched | ✅ | **JSON-path check (not raw grep)** via `node` walk of both catalogs. `admin.game.betaling` now holds 17 keys — `sectionLabel, feeLabel, paidLabel, viewAll, kicker, heading, rosterLabel, noFee, emptyRoster, unknownPlayer, paid, unpaid, withdrawn, markPaidAria, toggleError, remindButton, remindDone` — with **zero** `summary*` members, identical in `no.json` and `en.json`. The three surviving `summaryLabel` keys sit at unrelated paths and are byte-identical to main: `admin.courses.archivedTees.summaryLabel`, `admin.formats.auditLog.summaryLabel`, `liga.addRound.summaryLabel`. Diff confirms only 3 deleted lines per catalog. |
| 4 | Withdrawn, unpaid player does NOT see the compact payment line during an active round | ✅ | `(home)/page.tsx:954` live: `{me.paid_at == null && me.withdrawn_at == null && (`. Confirmed it is inside the **ACTIVE branch** (`{isActive ? (` opens at line 913) and is a sibling *below* the `me.withdrawn_at ? (undo banner) : (PrimaryCtaSection)` ternary at line 918. Withdrawn ⇒ second conjunct false ⇒ line not rendered, undo banner still shown. Staging A/B on PR corroborates: `payment-compact` → 0, undo banner → 1. |
| 5 | Non-withdrawn, unpaid player still sees the line (no #1068 regression) | ✅ | `me.withdrawn_at == null` is **loose** equality, so it matches both `null` and `undefined`. Non-withdrawn ⇒ both conjuncts true ⇒ line renders. Same truthiness contract as the pre-existing line 918 (`me.withdrawn_at ?`), so semantics are consistent within the file. Staging A/B differs *only* on `withdrawn_at` and flips the oracle both ways (1 hit / 0 hits) — the oracle is provably capable of both outcomes, not vacuously passing. |
| 6 | `package.json` patch-bumped and CHANGELOG has Feilrettinger line(s) | ✅ | `1.205.1 → 1.205.3` (two patch bumps, one per `fix` commit) in `package.json` **and** `package-lock.json` (both `name.version` and `packages."".version`). Two `#1145` lines added under the «Juli 2026» drawer. **Count verified, not trusted:** `awk` over the drawer counts **25** entries; header reads «Juli 2026 · 25 rettinger». Matches. |

## Gates

| Gate | Command | Actual output |
|---|---|---|
| Build | `npm run build` | **exit 0.** `✓ Compiled successfully in 11.6s`; 304 static pages generated. `grep -ciE "error\|failed\|MISSING_MESSAGE"` over full log → **0**. (First run's exit code was swallowed by a pipe; re-run cleanly to capture it.) |
| Lint | `npm run lint` | **exit 0** — `✖ 56 problems (0 errors, 56 warnings)`. Zero errors. Warnings pre-existing — see Issue 2 for a correction to the implementer's characterization. |
| Catalog parity | `npx vitest run messages/catalogParity.test.ts` | Green (bundled with next row: 2 files, 5 tests passed). |
| PaymentInfo regression | `npx vitest run components/PaymentInfo.test.tsx` | Green. Combined run: **Test Files 2 passed (2), Tests 5 passed (5)**, 1.05s. The added `data-testid` broke nothing. |
| Staging-verify | (implementer-run, evidence audited) | PR #1254 carries the `staging-verified` label and a `jdlarssen` evidence comment with a 3-row acceptance table against `torny-staging` (ref `snwmueecmfqqdurxedxv`): (a) `betaling-content.childElementCount = 3`, 0 `bg-surface-2` cards, `entry_fee_kr = 200` (fee branch genuinely rendered, not the `noFee` short-circuit); (b) withdrawn+unpaid → `payment-compact` 0 / banner 1; (c) not-withdrawn+unpaid → `payment-compact` 1 / banner 0. Console errors empty, 0 prod-ref calls, test data cleaned up. Evidence is structural (testid/SQL), not copy-based, and the A/B isolates `withdrawn_at`. Audited as sound. |

## Adversarial questions

1. **Could the summary card still render in any code path?** No. The card's JSX existed only in `betaling/page.tsx`; it is deleted. Its three i18n keys have **zero** call sites repo-wide (`grep -rn` across `*.tsx`/`*.ts`/`*.json`). No other file renders an equivalent card — `BetalingOverviewSection.tsx` is the *intended* surviving counter (explicitly out of scope) and is untouched.
2. **Does the withdrawn gate hide the line from non-withdrawn players?** No. `== null` (loose) matches `null`/`undefined` only; any real timestamp is truthy and non-null. Non-withdrawn players satisfy the conjunct. Proven both directions by the staging A/B.
3. **Did removing the i18n keys break another call site?** No. Repo-wide grep resolves every surviving `summaryLabel` reference to an intact key: `LigaAddRound.tsx:39` → `liga.addRound.summaryLabel`; `AuditLogList.tsx:74` → `admin.formats.auditLog.summaryLabel`; `ArchivedTeesSection`/`courses/[id]/edit/page.tsx:159` → `admin.courses.archivedTees.summaryLabel`. `drilldown.tsx` uses `summaryLabel` as a **React prop name**, not an i18n key (its keys are `summaryUt`/`summaryInn`) — a raw grep-count check would have flagged this as a false positive; the JSON-path check does not.
4. **MISSING_MESSAGE risk from a leftover `t()` call?** No. `betaling/page.tsx` calls exactly six keys — `emptyRoster`, `heading`, `kicker`, `noFee`, `rosterLabel`, `unknownPlayer` — all present in both catalogs. No dynamic/computed key construction in the file, so static analysis is sufficient. Build rendering 304 pages with zero `MISSING_MESSAGE` corroborates.
5. **Do the two `data-testid`s affect production behavior or styling?** No. `data-*` attributes are inert; neither touches `className`, props, or control flow. `payment-compact` sits **inside** `PaymentInfo`'s `if (compact)` branch, so it renders only at the single compact call site — the two full-variant calls (`:569` venterom, `:849` draft/finished) are unaffected. It is an established repo convention (32 files under `components/` already use `data-testid`) and `next.config` does no testid stripping.

## Issues found

Two minor, **non-blocking** observations. Neither affects correctness or any contract criterion.

1. **`components/PaymentInfo.tsx` is outside the contract's «Files Likely Touched».** The one-line `data-testid="payment-compact"` addition (`components/PaymentInfo.tsx:91`, commit `052d5357`) is not in the contract's file list. Judged **defensible, not scope creep**: the contract *mandates* a staging-verify gate asserting the line's presence/absence, test discipline forbids asserting on Norwegian copy, and no stable hook existed. Committed correctly as `test(...)` with `[no-changelog]` and `Refs #1145` — no version bump owed. Recording it as a deviation for the closing comment's «Teknisk» section, per repo convention.

2. **PR body + contract mis-describe the lint warnings** — factual inaccuracy in the *reporting*, not the code. Both claim «56 pre-eksisterende warnings i `lib/scoring`/`lib/wizard`, **urørte filer**». In reality the 56 warnings span ~50 files, and one of them — `app/[locale]/games/[id]/(home)/page.tsx:166` — **is touched by this PR**. I probed it rather than assume: linting `origin/main`'s version of that file shows `GameHomePage has a complexity of 123`; the branch shows **124**. The added `&&` raises cyclomatic complexity by exactly 1. Already ~5× over the limit of 25 on main, still a warning, lint still exits 0 → **not a blocker**, and not a new violation. But the claim "untouched files" is wrong and should be corrected if reused in the closing comment.

**Observation (out of contract scope, no action taken):** the two full-variant `PaymentInfo` calls are *not* gated on `withdrawn_at` — `:569` (venterom/scheduled) and `:849` (`!isActive` → draft + finished). A withdrawn player in a scheduled/draft/finished game would still see the full entry-fee box. The contract and issue #1145 explicitly scope the fix to the **active-round compact line** only, so this is correctly excluded here and is **not** a defect against this contract. Flagging it purely as a possible follow-up for the parent to weigh (whether withdrawal is even reachable in those states was not investigated); per I4 it must not be fixed in this PR.

## Scope check

`git diff origin/main...HEAD` → **8 files, +17/−38** (net subtraction, as a subtraction contract should be). Every changed line traces to #1145:

| File | Traces to |
|---|---|
| `app/[locale]/admin/games/[id]/betaling/page.tsx` | Design §1 — card + orphan computation + `formatKr` import removed; comment updated |
| `app/[locale]/games/[id]/(home)/page.tsx` | Design §3 — the one-line guard + explanatory comment |
| `messages/no.json`, `messages/en.json` | Design §2 — 3 keys each, exact path |
| `components/PaymentInfo.tsx` | Staging-verify gate hook (Issue 1 — deviation recorded) |
| `CHANGELOG.md`, `package.json`, `package-lock.json` | Design §4 — delivery |

**No unrelated changes, no drive-by edits, no stray files.** Out-of-scope boundaries all respected: `BetalingOverviewSection.tsx`, `BetalingClient.tsx`, `betaling/actions.ts`, and all server/RLS/schema surfaces are untouched. No new tests added, per the contract's «Ingen nye tester» decision (the added testids are hooks, not tests). All three commits carry `Refs #1145`; the two `fix` commits each carry a patch bump, and both bump types are correct (`fix` → patch).

Only uncommitted path is `.forge/contracts/1145-…md` (the implementer's own checkmark/evidence edits). Evaluator committed, fixed, and merged nothing.
