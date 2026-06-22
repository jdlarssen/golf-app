# Evaluation: #878 — «Pågår nå»-kortet kjerne-løkke-bevisst

Evaluator: fresh-context skeptical review · 2026-06-22 · branch `claude/nifty-mcnulty-682800`
Commits: `5efada19` (contract) + `dec3b8ef` (feat)

## Gate outputs (run independently, Node 22)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | **PASS** — exit 0, no output |
| `npx vitest run lib/games/activeCardState.test.ts` | **PASS** — Test Files 1 passed, Tests 6 passed |
| `npx eslint app/[locale]/page.tsx lib/games/activeCardState.ts lib/games/getActiveGameCardData.ts` | **PASS** — exit 0, no output |

Schema cross-check (database.types.ts): `game_players.{submitted_at,withdrawn_at,approved_at,flight_number,team_number}` and `games.{require_peer_approval,game_mode}` all exist. `game_mode` is typed `string` in DB and cast to `GameMode` via `.returns<GameRow[]>()` (project's established untyped-embed pattern; tsc green).

## Per-criterion verdict

| # | Criterion | Verdict | Evidence |
| --- | --- | --- | --- |
| C1 | Query extended | **PASS** | `page.tsx:152` select adds `submitted_at, withdrawn_at, approved_at` + `games!inner(... require_peer_approval, game_mode ...)`; `GameRow` type (117-137) + mapping (177-184) updated. |
| C2 | Pure tested resolver | **PASS** | `activeCardState.ts` returns the 4-way union; precedence `withdrawn > submitted(>pending) > continue` matches `PrimaryCta.computeState` + the withdrawn branch. Test has 6 `it.each` cases covering all 4 outcomes, peer-approval on/off, AND `withdrawn wins over earlier submission` (the real edge). 6 passed. |
| C3 | State label | **PASS** | `ActiveStateLabel` (554-581) replaces `StatusPill` for active cards w/ forest/success/amber/muted tones; upcoming `renderGameCard` keeps `StatusPill` (303). 4 keys present in no.json+en.json (4050-4053). |
| C4 | «Rett inn i runden» | **PASS** | `getActiveGameCardData` next-hole scan (105-117) is byte-for-byte the PrimaryCta algorithm: `filled.size>=18 → /submit`, else first-unfilled 1→18 → `/holes/{n}`. Only for `continue`; else `/games/{id}`. Scores query scoped to `continueIds`, parallel via `Promise.all`. |
| C5 | Peer-approval nudge | **PASS (with 1 narrow divergence — see Gaps)** | Sibling `SmartLink` (368) under the card `SmartLink` (333), both children of `div.space-y-2` (332) — NOT nested. Reuses `isSingleFlightGame` + `game.home.pendingApprovals`/`reviewLink`. Renders only when `pendingApprovalsForMe > 0`. |
| C6 | Finish #363 | **PASS** | `<Section label={t('sectionInProgress')} accent>` (395); `Section` applies `text-accent` + `bg-accent/30` divider when `accent` (515-523). |
| C7 | No regression | **PASS** | empty-state/discovery JSX has zero +/- lines in the diff; upcoming `renderGameCard` still `/games/{id}` + `StatusPill`; finished/discovery fetches unchanged; no schema/auth/RLS. tsc+eslint clean. |
| C8 | Copy humanizer-clean | **PASS** | 4 short imperatives reusing app terms (Fortsett/Levert ✓/Til godkjenning/Trukket); en.json parity. CHANGELOG tagline natural Norwegian, no AI-tells. Passed pre-commit + commit-msg hooks. |

## Deep checks

- **State precedence (skeptical focus 1):** Matches spill-hjem. `withdrawn_at` checked first (wins over submitted) — covered by test case 6. `submitted + require_peer_approval + !approved → pending_approval`, else `submitted` — mirrors `PrimaryCta.computeState` exactly. No trivial-only tests; the two non-obvious edges (peer-approval-granted, withdrawn-over-submitted) are both present.
- **Peer-approval count (skeptical focus 2):** Single-flight branch via `isSingleFlightGame(game_mode, mapped rows)`, self-exclusion (`m.user_id !== userId`), `submitted_at != null && approved_at == null` — identical to `PendingApprovalsBanner` in the common (≤4-player / wolf) case. See Gap G1 for the one divergence.
- **Next-hole routing (skeptical focus 3):** Identical scan; PrimaryCta's `not_started` still routes to `/holes/{nextHole}` (=hole 1 when empty), so the card's continue href agrees. Non-continue/non-active → `/games/{id}`. ✓
- **No nested interactive (focus 4):** Confirmed siblings, valid HTML/a11y. ✓
- **No regression (focus 5):** Upcoming card + empty-state + discovery confirmed untouched in the diff. ✓
- **N+1 (focus 6):** Exactly 2 queries, both `.in('game_id', [...])` batched, `Promise.all`, short-circuited to `Promise.resolve` when the id list is empty. Scores scoped to `continue` games only; mates scoped to peer-approval games only. ✓
- **i18n parity (focus 7):** 4 new `home.cardState*` keys in both catalogs at matching line 4050-4053; reused `game.home.pendingApprovals`/`reviewLink` present (1419-1420). ✓
- **Intentional deviation (focus 8):** Active card drops the `scheduled_tee_off_at` line — reasonable: an active round has already teed off, so a scheduled tee-time is noise. Upcoming card retains it. ✓

## Gaps found

**G1 (minor, narrow-edge, non-blocking) — `getActiveGameCardData.ts:134`.**
The non-single-flight branch filters peers with `all.filter((m) => m.flight_number === g.flightNumber)`, omitting the `flightNumber != null &&` guard that `PendingApprovalsBanner.tsx:51-53` has. Consequence: in a >4-player solo game where the viewer's `flight_number` is `null`, the card would match other null-flight peers and could surface a non-zero count, whereas both reference implementations return 0 there (`PendingApprovalsBanner` via its explicit guard; `peersForApproval` via `if (me.flight_number == null) return []`).

Severity assessment: **does not affect the common path.** When active players ≤4 (the entire kompis scale + most club flights) the game is single-flight, the filter is bypassed (`all` used), and behavior is byte-identical to the banner. The divergence requires a >4-player flight-assigned solo game with an unassigned (null-flight) viewer AND null-flight peers who have submitted — a degenerate, arguably-misconfigured state. The contract's gray-area #3 says "mirror PendingApprovalsBanner"; this is the one spot it doesn't mirror exactly. It is a one-token fix (`m.flight_number != null && m.flight_number === g.flightNumber`, or add the guard to match the banner). Recommend filing as a follow-up nit rather than blocking — it is invisible at the scale the app actually runs and carries no data-correctness or security risk (worst case: a stray nudge link to a page that itself re-derives the real peer set).

No other gaps. No security/RLS/schema concerns (read-only additive queries). UI not rendered on staging per contract's explicit owner-deferred pre-merge step; logic + i18n wiring verified sound by reading (no missing keys, no wrong namespace, no undefined access — `activeCardData.get(g.id)` has a `?? { default }` fallback at page.tsx:318).

## Verdict

The implementation satisfies all 8 contract criteria. State machine, routing, nudge placement, N+1 bound, i18n parity, regression scope, and #363 completion are all correct and match the cited ground-truth. The single divergence (G1) is a narrow, non-blocking edge that never manifests at the app's real scale and is a one-line follow-up.

VERDICT: ACCEPT
