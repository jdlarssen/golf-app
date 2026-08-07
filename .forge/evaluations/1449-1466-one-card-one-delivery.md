# Evaluation: 1449-1466-one-card-one-delivery — Round 1

**Commits under evaluation:** `e34b84a1` (Builder A — card experience) + `b97509d0` (Builder B — delivery) + `8ce109d5` (copy polish), HEAD of `claude/1449-1466-one-card-one-delivery`
**Evaluator:** fresh-context skeptic, 2026-08-07
**Verdict: NEEDS WORK** — every listed code criterion passes and all gates are green, but the hunt pass found two concrete in-PR defects (an unreviewable binary core file; duplicate React keys in the feature's own flagship scenario) and one shared-blindness seam (sibling resolution is not day-scoped on multi-split-day cups). Staging criteria deferred to PR stage per instruction — open items, not failures.

## Gates

| Gate | Result | Evidence |
|---|---|---|
| `npx vitest run lib/games components/games components/hole "app/[locale]/games/[id]" messages` | PASS | 132 files, 1557/1557 tests green (Node 22, vitest 4.1.6). catalogParity included via `messages` — green, new keys in both locales. |
| `npm run build` | PASS | Full route table, exit 0. |
| `npm run lint` | PASS | 0 errors, 58 warnings — all pre-existing (sideTournament/fitsPlayerCount complexity etc.), none in touched files. |
| Versions/CHANGELOG | PASS | `e34b84a1` bumps to 1.219.0, `b97509d0` to 1.220.0 (minor each, matching feat); two Funksjon `<details>`-entries (1.219 + 1.220) with issue links + cta; package.json at HEAD = 1.220.0. Refs-footers on all three commits. |
| Scope | PASS | Every file in `git diff origin/main...HEAD --stat` traces to the two contracts (+ the three contract-docs commits). No drive-bys. |

## Per-criterion evidence — Builder A (card experience)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| A1 | Pairing helper pure + Type A edge coverage | PASS | `lib/games/splitDayPairing.ts` is pure/generic; `splitDayPairing.test.ts` covers empty/one/full-segment/non-cup/pair/order-independence/unpairable/cross-day/two-days-boundary/duplicate-halves/withdrawn (`pairEligible:false`)/null-anchor — the full contract table. Run green. Oslo-day bucketing via `osloParts` (no local-TZ getters), incl. a UTC-midnight-rollover test. |
| A2 | Both queries filter derived games | PASS | `activeGamesQuery` (`app/[locale]/page.tsx:184`) and `getFinishedGamesForUser` (`lib/games/getFinishedGamesForUser.ts:91`) both chain `.is('games.source_game_id', null)`. Derived singles can never render as cards on either surface. |
| A3 | Merged active card: earliest-stage state, continue-href front9→back9, deliver-state → back9 game-home | PASS | `lib/games/pairActiveCard.ts`: `mergePairState` (continue > pending_approval > submitted > withdrawn); `mergePairExtras` routes front9 `nextHole` → back9 `nextHole` → `/games/<back9>` (where PrimaryCta shows «Se over og lever» and the #1466 one-delivery lands). `pendingApprovalsForMe` summed across the pair. Unit tests cover all four routes + the sum. Wired in `page.tsx` `renderActivePairCard`/`renderUpcomingPairCard`; card data computed for BOTH halves of in-progress pairs. |
| A4 | Finished cup card: both-hosts-finished only; no day in both lists; links `/cup/[id]`; persisted badge; tied + neutral variants | PASS | `lib/games/finishedEntries.ts`: pair → one `cupDay` entry; a LONE finished split host is suppressed (day stays in the active list — guardrail honored; active query only surfaces the unfinished half, so exactly one active card). `FinishedCupDayCard` links `/cup/${tournamentId}`. `cupDayFinishedBadge` reads persisted `status`/`winner_team` + viewer `team_number` only — never recomputes; `cup.tied` on finished+null winner, `cup.finished` fires ONLY in the neutral no-team case (`teamNumber == null`), win/loss otherwise, `null` (plain arrow) while unfinished. All five branches unit-tested. |
| A5 | Regression: `hole_segment='full'` cup games + normal games unchanged | PASS | Pairing buckets only cup halves with segment front9/back9 (`splitDayPairing.ts:74-75`); everything else passes through as `single` and renders the pre-existing `renderGameCard`/`renderActiveGameCard`/`FinishedGameCard`/`GameHistoryRow` paths. `FinishedRoundsSection.toBlocks` renders a no-cup list as the byte-identical single Card. |

## Per-criterion evidence — Builder B (delivery)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| B1 | `SegmentSibling` extension + consumers | PASS | `mySubmittedAt`/`myTeamNumber` added; membership select extended with `submitted_at, team_number`; `pickSiblingCandidate` signature updated with direct unit coverage. Consumers (hole page, PrimaryCtaSection, submit action, game-home nudge gate, submit page) all compile — build green. |
| B2 | broModus replaces ALL deliver-CTAs; duplicate bridge suppressed; PrimaryCta ready_to_submit bridge; self-heal | PASS | `HoleClient.tsx` `submitOrBridgeLabel/Href` covers BOTH `roundComplete` and `isLastHole` branches; secondary link gated `segmentSibling && !broBridge` (back9's «Tilbake til hull 9» keeps rendering — broBridge null there). `PrimaryCtaSection` extends the sibling lookup to `ready_to_submit`; bridge is primary only when `sibling.mySubmittedAt == null` — sibling delivered ⇒ broModus false ⇒ deliver-CTA returns (self-heal). 3 new HoleClient tests (hole 9 no-deliver + exactly one bridge; mid-round roundComplete; self-heal) green. |
| B3 | 18-hole strip | PASS | `HoleStrip.tsx`: sorted union, own holes → own game, sibling holes → `/games/<sibling>/holes/<n>`, positional `completed` (n < currentHole) kept, `sibling` null ⇒ byte-identical segment strip. Hole page resolves the sibling for ALL segment-candidate holes; only cup segment hosts pay the 2 indexed admin queries. Exactly ONE render-test extension (union + cross-hrefs + positional states). |
| B4 | submitScorecard deliver-both | PASS | Cascade at `actions.ts:151-218`: runs AFTER `(updated?.length ?? 0) > 0` on the primary update and BEFORE all side-effects. Team-wide vs own-row branch = `(isScrambleFamily ∥ isAlternateShotMatchplay)(sibling.gameMode) && myTeamNumber != null` with the #1453-guarded form (`eq game_id/team_number`, `is withdrawn_at/submitted_at null`, `.select`). 0-row sibling update tolerated (only `siblingError` throws). Compensation reverts exactly the returned back9 `user_id`s then redirects `?error=db`; rejection_reason cosmetic loss documented. Side-effects fire once, for the back9 host. Both games revalidated (tag `'max'` + path). Direction back9→front9 only (gate: `hole_segment==='back9' && tournament_id && source_game_id==null`); manual front9 submit never cascades. No `redirect()` inside the try ⇒ NEXT_REDIRECT can never be swallowed by the catch. 4 new action tests (own-row cascade + dual revalidate; team-wide form; compensation + no side-effects; already-delivered sibling no-op) green. |
| B5 | Reminders | PASS | Auto-nudge gate at game-home call-site: sibling lookup only when `hole_segment==='front9' && tournament_id != null` — normal games (`'full'`) pay zero extra queries; broModus front9 skips `maybeSendDeliveryReminder`. Admin exclusion is batch (1 back9-hosts query + 1 undelivered-memberships query, never per-player); selection extracted to pure `selectDeliveryReminderTargets` with 3 unit tests. `classifyDeliveryStatus` byte-untouched (diff shows only the new function appended). |

## Numbered issues (most severe first)

1. **`findSegmentSibling` is not day-scoped and has no status filter — the one-delivery flow can bind to the WRONG day's host on a multi-split-day cup.** `lib/games/segmentSibling.ts:137-143` selects ALL opposite-half hosts in the tournament (no `ORDER BY`, no status/day filter) and `pickSiblingCandidate` returns the first membership match. The pairing half of this very PR explicitly supports two split days in one cup (its own test: «two split days in one cup → two pairs, one per day»), and the generator allows it. On day 2, day-1's finished+delivered hosts are still candidates: the submit cascade can resolve the day-1 front9 (`mySubmittedAt` set) and silently skip delivering day-2's front9 (feature degrades to two deliveries), broModus and the cascade can disagree (each independently picks an arbitrary row), and the 18-hole strip/bridge can link into the finished day-1 host. No blind gate (after back9 delivery both back9s are delivered ⇒ broModus false ⇒ CTA returns) and no data corruption — but the flagship «én levering» order nondeterministically fails on exactly the Ryder-weekend shape this is built for. Fix direction: scope candidates to the same Oslo day (mirror `splitDayPairing`'s rule via `scheduled_tee_off_at`) and/or filter `status` to unfinished; the admin-reminder exclusion batch (`status/actions.ts`) inherits the same cross-day blur and should be scoped in the same stroke. (Flaw is inherited from #1441 at navigation level, but this PR promoted it into delivery correctness — it must at minimum be fixed for delivery or filed as a blocking follow-up issue before merge.)
2. **`lib/games/splitDayPairing.ts` contains two literal NUL bytes (offsets 3208, 4141) — git and GitHub treat the PR's central pure-logic file as BINARY.** The bucket key is `` `${tournamentId}\x00${dayKey}` `` with a literal U+0000 in the source (also in the `indexOf` call). Diff-stat already shows `Bin 0 -> 4838 bytes`; the GitHub PR diff will show «Binary file not shown», grep-family tools skip it, and the owner-facing PR review of the core rule is impossible. Functionally correct (tests/build green), but it violates the reviewable-PR discipline. Fix: use the escape `' '` in source, or a plain separator (UUID tournament ids cannot contain whitespace, so even `' '` was already safe) — 2-minute fix, re-run the pairing tests.
3. **Duplicate React keys for multiple finished cup days of the same cup.** `components/games/FinishedRoundsSection.tsx:125` and `app/[locale]/spill-arkiv/page.tsx` key cup-day cards on `entry.tournamentId`. A weekend cup (two split days, same tournament) finished in the same month produces two `cupDay` entries with identical keys in one list — React duplicate-key error and reconciliation hazard, in the exact multi-day scenario the pairing helper supports. Fix: key on `entry.front9.id` (or `tournamentId:ended_at-day`). The active-list pair card already does this right (`${tournamentId}:${dayKey}`).

## Out-of-scope / follow-up findings (file as issues before merge per repo rule)

- **Both halves finished on different Oslo days ⇒ the day vanishes from BOTH finished surfaces permanently.** `toFinishedEntries` suppresses every lone finished split host on the assumption «lone = sibling still active», but hosts are finished individually via the avslutt action (`ended_at` = admin's click moment): a finish straddling midnight, or an admin finishing the second host the next morning, puts the halves in different `ended_at` day-buckets ⇒ no pair ⇒ both suppressed ⇒ neither Home nor /spill-arkiv ever shows the day (and if those were the player's only games, the «start here» welcome renders over real data — the #877 class). The builder followed the contract («key on same Oslo day of ended_at») — the hole is contract-level. Follow-up: anchor finished-pairing on `scheduled_tee_off_at ?? ended_at`, or suppress a lone host only when the sibling is verifiably unfinished.
- **Fail-open tournament default in `finishedEntries.ts:58`:** `status: tournament?.status ?? 'finished'` — if the tournament embed were ever null (RLS change, deleted cup), an active cup day would wear a false «Cupen endte delt»-badge. Unreachable today (tournaments are world-read by design), but a `?? 'active'` default would fail closed. Nit.
- **Merged card's approval nudge links only to the back9 host's `/approve`** even when the pending approval sits on front9 — acknowledged in-code (cup games default peer approval OFF, so the branch is effectively dead). Accepted, documented; no action.

## Deferred (PR stage, not failures)

All staging Success Criteria of both contracts (one card → hole 1; hole-9 bridge; one delivery marks both `game_players` rows; finished cup card; badge per team; regression click-round) + staging-verify skill + `staging-verified` label BEFORE merge.

---

# Round 2 — verification of fix commit `8ccb0c5`

**Evaluator:** fresh-context skeptic (round 2), 2026-08-07
**Verdict: NEEDS WORK** — all five round-1 items are genuinely fixed, all gates green (1563/1563, build, lint 0 errors, version discipline clean). But the suppression *belt* the fix added to `toFinishedEntries` is not day-scoped: on a two-day cup it un-suppresses a lone finished half of the OTHER day, putting that day in both lists — a contract-guardrail violation in the normal second-day-afternoon state, proven by a failing probe test against HEAD. One small change (belt scans unpaired singles only) closes it.

## Round-1 items — verified

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Day-scoping | **FIXED** | `findSegmentSibling` now fetches ALL segment hosts with `scheduled_tee_off_at, created_at`, resolves the source's own anchor from that set, and filters candidates through the shared `candidatesOnSameSplitDay` (`lib/games/segmentSibling.ts:165-181`). The admin reminder-exclusion batch (`admin/games/[id]/status/actions.ts:99-110`) selects the same two anchor columns and runs the SAME shared rule — one home (trap 4). 4 new day-rule tests in `segmentSibling.test.ts` (day-2 never resolves day-1; null-anchor source → nothing; created_at fallback; anchorless candidate dropped) — semantics match `pairSplitDayGames`' null-`dayAnchor`-stays-single. All 5 call-sites pass `gameId` (submit/actions.ts:159, PrimaryCta.tsx:112, submit/page.tsx:235, (home)/page.tsx:443, holes/page.tsx:172) — none missed. **No-status-filter judgment: endorsed** — day-scoping isolates the day's single opposite host; a status filter would break the self-heal (delivered-but-active sibling) and the cascade, and binding a finished same-day sibling for navigation is correct (it IS the same physical round). |
| 2 | NUL bytes | **FIXED** | `python3` NUL count = **0**; `git diff origin/main...HEAD --numstat` = `167 0` (text). Separator now `BUCKET_KEY_SEP = '::'` with a safety comment (UUID + `YYYY-MM-DD` cannot contain a colon). The fix-commit stat's `Bin 4838 -> 6937` line is just the binary *pre*-image side; against `origin/main` (new file) the diff is fully text. |
| 3 | React keys | **FIXED** | `FinishedRoundsSection.tsx:125` and `spill-arkiv/page.tsx:75` both key `FinishedCupDayCard` on `entry.front9.id` — unique per day. |
| 4 | Physical-day anchor + belt | **FIXED (but see new finding 1)** | `finishedEntries.ts` anchors on `splitDayAnchor({scheduled_tee_off_at, created_at: ended_at})` (= `scheduled_tee_off_at ?? ended_at`), `FinishedGame` + the select gained `scheduled_tee_off_at`, contract deviation recorded in the docstring. Cross-midnight test (`finishedEntries.test.ts:89`) passes; belt test (`:116` — two unbucketable finished halves render as singles, never vanish) passes; original lone-host-suppression guardrail test (`:66`) still green. |
| 5 | Fail-closed badge | **FIXED** | `status: tournament?.status ?? 'active'` (`finishedEntries.ts:95`); `cupDayFinishedBadge({status:'active'})` → `null` (neutral card) is unit-locked. A missing embed can never wear a false result badge. |

## Gates

| Gate | Result | Evidence |
|---|---|---|
| `npx vitest run lib/games components/games components/hole "app/[locale]/games/[id]" "app/[locale]/spill-arkiv" messages` | PASS | 132 files, **1563/1563** green (round-1's 1557 + exactly the 6 new fix tests). |
| `npm run build` | PASS | Full route table, exit 0. |
| `npm run lint` | PASS | 0 errors, 58 warnings — all pre-existing. |
| Version/CHANGELOG | PASS | `8ccb0c5` bumps 1.220.0 → **1.220.1** (patch, matching fix), `[no-changelog]` in body, no CHANGELOG.md line added (top entry still 1.220 feature). Refs #1449 + #1466. |
| Scope | PASS | Every hunk in `8ccb0c5` traces to a round-1 finding. No drive-bys. |

## New findings (round 2)

1. **CONFIRMED — the suppression belt is not day-scoped: a two-day cup shows a day in BOTH lists.** `finishedOppositeHostExists` (`lib/games/finishedEntries.ts:71-80`) scans the whole finished set for *any* opposite-half host in the tournament — no day comparison, and paired (consumed) games are not excluded. Scenario (the normal Ryder-weekend Sunday afternoon, `scheduled_tee_off_at` set on everything): day-1 pair fully finished; day-2 front9 finished while day-2 back9 is still active. Day-2 front9 is a lone single; the belt finds day-1's back9 (same tournament, opposite half) → returns true → the lone day-2 front9 renders as a finished single card while day-2 also renders as the merged ACTIVE card. Probe test against HEAD failed exactly so: `expected [ 'game', 'cupDay' ] to deeply equal [ 'cupDay' ]` (probe deleted after the run, not committed). This violates the contract guardrail «no day may appear in both lists» — the same cross-day-blur class as round-1 finding 1, reintroduced by the fix. **Fix direction:** run the belt only over the games that remained UNPAIRED singles after `pairSplitDayGames` (day-1's halves are consumed into the pair, so a day-2 lone host then correctly sees no unpaired opposite host → suppressed), which also keeps the belt firing in its intended cross-midnight case (both halves unpaired). Alternatively pass the pairing outcome in and exclude consumed ids. Small change + the probe scenario as a regression test. |
2. **Minor residual — same-day `created_at` fallback can leave >1 candidate, and sibling resolution guesses instead of degrading.** `resolveScheduledTeeOffAt` returns `null` when the organizer leaves the tee-off field empty (`lib/cup/splitDayLineup.ts:253`), so a cup with two split days generated in one Friday sitting, both without tee-off times, buckets ALL hosts on the created-Friday day-key: `candidatesOnSameSplitDay` returns both opposite halves and `pickSiblingCandidate` takes the first membership match (no ORDER BY → arbitrary). The card side degrades safely in this exact case (exactly-one-of-each check → singles); the sibling side should mirror that: `candidates.length > 1` → return `null` (no bridge/no cascade = the safe two-delivery behavior). Requires three coinciding conditions and worst case is degradation (delivered day-1 membership → cascade gate skips; no corruption), so: fix in the same stroke if convenient, else file as follow-up issue before merge.

## Regressions

None found beyond finding 1 (which is new behavior added by the fix, not a regression of pre-existing behavior — pre-fix code always suppressed lone hosts). All round-1 PASS criteria re-hold; `classifyDeliveryStatus`/delivery-target selection untouched; `deliveryStatus.test.ts` green.

---

# Round 3 — delta verification of fix commit `9a8db169` — FINAL

**Evaluator:** fresh-context skeptic (round 3, delta), 2026-08-07
**Verdict: ACCEPT** — both round-2 findings are correctly and minimally fixed, every hunk in `9a8db169` traces to them, all gates green (1564/1564 = round 2's 1563 + exactly the one new regression test; build exit 0; lint 0 errors), version discipline clean (1.220.2, `[no-changelog]`, no CHANGELOG line). No new findings in the seam sweep. Staging Success Criteria of both contracts remain deferred to PR stage (staging-verify + label before merge), as instructed in all three rounds.

## Round-2 items — verified

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Belt singles-scoping | **FIXED** | `toFinishedEntries` now computes `paired = pairSplitDayGames(pairable)` once, derives `singleHostIds` from the entries that remained singles, and `finishedOppositeHostExists` requires `singleHostIds.has(g.id)` (`lib/games/finishedEntries.ts:63-87`). Round-2 probe scenario is committed as a regression test (`finishedEntries.test.ts:145` — day-1 pair + day-2 lone front9 → `['cupDay']` only) and passes. All three coexist green: cross-midnight rescue (`:116`, both halves unpaired → mutual rescue, day never vanishes), original lone-host suppression (`:66`), and the new paired-host-never-rescues test. Mental re-run confirms: day-1's back9 is consumed into the pair → excluded from `singleHostIds` → day-2's lone front9 finds no unpaired witness → suppressed → no day in both lists. |
| 2 | Ambiguous-sibling guard | **FIXED** | `findSegmentSibling` returns `null` on `candidates.length > 1` (`lib/games/segmentSibling.ts:186`), placed AFTER the `candidatesOnSameSplitDay` day-scope filter and the zero-check — mirrors the card side's exactly-one semantics; worst case degrades to two deliveries, never a cascade against a guessed target. `pickSiblingCandidate`'s defensive first-match is now only reachable with exactly one candidate. **Reminder-exclusion batch legitimately still tolerates >1** (`app/[locale]/admin/games/[id]/status/actions.ts:98-124`): `back9Ids` feeds an `.in(...)` whose result only EXCLUDES front9 players from nagging («purres via back9») — union/exclusion semantics are conservative and safe where resolution must pick one; no change warranted. |

## Accepted corner (documented, endorsed)

Two DIFFERENT days each holding a lone finished host in opposite halves → both transiently rescued while their days also show active cards. Requires a crosswise asymmetric admin mid-state across two days simultaneously; self-corrects the moment either day completes (the pair consumes its ids out of `singleHostIds`, the other day's witness disappears); worst case is a cosmetic extra card with correct hrefs, no data effect. Exact day-comparison in the belt would defeat its purpose (the cross-midnight rescue case has different day-keys by construction), and an adjacency heuristic is over-engineering for a transient cosmetic state. Acceptable as documented in the code comment (`finishedEntries.ts:71-73`).

## Gates

| Gate | Result | Evidence |
|---|---|---|
| `npx vitest run lib/games components/games components/hole "app/[locale]/games/[id]" "app/[locale]/spill-arkiv" messages` | PASS | 132 files, **1564/1564** green (Node 22, vitest 4.1.6) — round 2's 1563 + exactly the 1 new belt regression test. |
| `npm run build` | PASS | Full route table, exit 0. |
| `npm run lint` | PASS | 0 errors, 58 warnings — same pre-existing set as rounds 1–2. |
| Version/CHANGELOG | PASS | `9a8db169` bumps 1.220.1 → **1.220.2** (patch, matching fix), `[no-changelog]` in body, no CHANGELOG.md hunk in the commit. Refs #1449 + #1466. |
| Scope | PASS | Commit touches exactly `finishedEntries.ts`, `finishedEntries.test.ts`, `segmentSibling.ts`, `package.json`, `package-lock.json` — every hunk traces to the two round-2 findings. No drive-bys. |

## Seam sweep (regressions)

None. Both edits are pure selection logic; no I/O shape changed: `SegmentSibling` type, the two Supabase queries, and `findSegmentSibling`'s signature are untouched, so all five call-sites (submit cascade, PrimaryCta, submit page, game-home nudge gate, hole page) see the same contract — submit-action tests untouched and green in the run. Merged-card hrefs live in `pairActiveCard.ts` (untouched); broModus/bridge behavior changes only in the triple-coincidence ambiguous case, where `null` is the intended safe degradation; pair rendering and non-cup singles bypass the belt entirely.

## FINAL

**ACCEPT.** Remaining before merge (PR stage, not evaluation failures): staging verification of both contracts' Success Criteria + `staging-verified` label, and filing the round-1 out-of-scope findings that were not fixed in-branch (none remain — rounds 1–2 items were all fixed in `8ccb0c5`/`9a8db169`; the two documented accepted corners are recorded here and in code comments, no issue required).
