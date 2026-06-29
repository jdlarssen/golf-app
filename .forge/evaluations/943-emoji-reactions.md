# Evaluation: #943 — Emoji-reaksjoner på leaderboard-rader

**VERDICT: ACCEPT** — all six success criteria and all five gates verified independently. One non-blocking gap (an orphaned `errorFailed` i18n key / unimplemented failure-toast) noted below; it does not affect correctness.

Evaluator: skeptical fresh-context review. Gates re-run on Node 22.23.0. RLS hostile-probe re-run independently against STAGING (`snwmueecmfqqdurxedxv`); test row cleaned up; **0 prod writes**.

---

## Success Criteria

| # | Criterion | Result | Evidence I observed |
|---|-----------|--------|---------------------|
| 1 | Migration 0119: `reactions` (palette-CHECK + unique) + RLS (select=participant, insert=own+participant+valid-target, delete=own, **no update**) + `can_react_in_game` w/ `set search_path` | **PASS** | Staging catalog query: 6 cols (`id,game_id,user_id,target_user_id,emoji,created_at`); CHECK `reactions_emoji_palette` = exact `👏 🔥 😂 💪 ⛳ 🐦`; UNIQUE `(game_id,user_id,target_user_id,emoji)`; 3 FKs all `ON DELETE CASCADE`; 3 policies `insert own [INSERT] / delete own [DELETE] / select if participant [SELECT]` all `authenticated`, **no UPDATE policy**; `can_react_in_game` `secdef=true cfg=search_path=public, pg_catalog`; `rls_enabled=true`. Migration recorded as applied (`20260629055624 game_reactions`). |
| 2 | Hostile-probe (real RLS via `request.jwt.claims` + `set role authenticated`): non-participant→42501, spoofed user_id→42501, target-outside→42501, off-palette→23514, valid→success, attacker-delete→0 rows | **PASS** | I re-ran the full A–F probe myself on staging game `fab70b1a…`: **A** non-participant insert → `42501`; **B** spoofed `user_id` → `42501`; **C** target outside game → `42501`; **D** off-palette `🦄` → `23514`; **E** valid participant insert → SUCCESS (`id=4cc5f42c…`); **F** admin deletes player's reaction → `deleted_rows=0`, seed survived (`reactions_remaining=1`). Probe row deleted afterward → `remaining_for_game=0`. |
| 3 | Each individual-player row (9 formats) shows palette + per-emoji count on **both** live list AND finished podium; team/matchplay untouched; one strip per player | **PASS** | 9 views (1 connector each) + 9 podiums wired via `RowReactionsForPlayer`. Verified non-individual surfaces clean: `State4View`, `RevealBruttoView`, `TexasScrambleView`, `ShambleView`, `PatsomeView`, `MatchplayMatchView`, `FourballMatchplayView`, `FoursomesMatchplayView`, `HeadToHeadResult` — none import reactions. **Multi-render checks:** Nassau strip only on `total18` SectionBlock (`showReactions` defaults false, passed `true` once — `NassauView.tsx:170-180`, comment + flag confirmed). RoundRobin strip in `PlayerRow` standings (`RoundRobinView.tsx:256`), NOT in `SegmentCard` (3-segment summary) — one per player. Wolf strip in `result.players.map` standings (`WolfView.tsx:272`). Podiums: 3 explicit strips (first/second/third podium steps) + 1 in `rest.map()` where `rest = result.players.slice(3)` (`SoloStrokeplayPodium.tsx:111,156,173,190,241`) — exactly one per player, no double-render. |
| 4 | Toggle: add own reaction (optimistic + persisted), tap again removes; count = distinct users | **PASS** | `toggleReaction` (`actions.ts`) selects existing row → DELETE-or-INSERT, both with `.select('id')` + `expectAffected` (0-row guard). Provider applies optimistic `applyToggle` then writes, reconciles via refetch on echo/failure. Probe E proved a real insert persists; probe F's count semantics (distinct users) match `aggregateReactions`. `RowReactions.test.tsx` (4 tests) covers render/aria-pressed/onToggle/disabled. |
| 5 | Live for others: `ReactionsProvider` subscribes to `reactions` INSERT/DELETE → debounced **refetch** (client-state, not `router.refresh`); migration 0120 emits events | **PASS** | `ReactionsProvider.tsx:97-124` subscribes via `subscribeRealtimeChannel` (reuses `setAuth` quirk helper) to INSERT+DELETE filtered `game_id=eq.${gameId}`, 300ms debounce, calls `getReactionsSummary` (server refetch into `useState`). Staging: table in `supabase_realtime` publication = YES, replica identity = FULL (so DELETE carries `game_id` for the filter). Migration `20260629060434 reactions_realtime` applied. |
| 6 | Silent: no `notify()`/push/mail in reaction path | **PASS** | `grep -niE 'notify|sendMail|sendPush|resend|webpush|inviteNotification|gameFinished|scorecardSubmitted'` over `lib/games/reactions/` + `actions.ts` + provider + RowReactions* → single hit, a JSDoc comment "does NOT call revalidateTag or notify()". No actual notify/push/mail/revalidate calls. |

---

## Gates (re-run by evaluator, Node 22.23.0)

| Gate | Command | Result |
|------|---------|--------|
| tsc | `npx tsc --noEmit` | **PASS** — `TSC_EXIT=0`, no output. web-push present (no worktree gap). |
| build | `npm run build` | **PASS** — `BUILD_EXIT=0`, "✓ Compiled successfully". (Pre-existing workspace-root inference warning, unrelated.) |
| lint | `npx eslint` on 10 reaction files | **PASS** — 0 errors, 1 warning. The lone warning is `complexity 67` on `LeaderboardBody` in `page.tsx` — **pre-existing** (parent commit already had 29 mode-branches); the feature only added the `withReactions` wrapper. Not a defect. |
| vitest | `npx vitest run "app/[locale]/games/[id]/leaderboard/" lib/games/reactions/` | **PASS** — `VITEST_EXIT=0`, **39 files / 203 tests passed**. (Contract cited 38/186 pre-feature + new `aggregate.test.ts` 17 + `RowReactions.test.tsx` 4; the higher totals are consistent.) |
| staging | 0119+0120 applied + verified; RLS probe; cleanup | **PASS** — see criteria 1–2; cleanup `remaining_for_game=0`; 0 prod writes. |

---

## Bugs / gaps / contract deviations

**None blocking.** One non-blocking deviation:

1. **Orphaned `errorFailed` i18n key / unimplemented failure-toast (non-blocking).**
   The Design (contract line 127, "ved feil → reverter + diskré toast") and the Edge Cases (offline → "stille feil + toast") both call for a discreet toast on write failure. The i18n key `leaderboard.reactions.errorFailed` ("Reaksjonen ble ikke lagret" / "Reaction could not be saved") was added to both `messages/no.json` and `messages/en.json` — but it is **referenced nowhere** in the codebase (`grep -rn 'errorFailed' app/ components/ lib/` → no hits). On write failure `ReactionsProvider.toggle` only does `console.error` + `void refetch()` (`ReactionsProvider.tsx:136-140`). The **revert-to-truth** half (the correctness-relevant part) is implemented and works; only the cosmetic toast is missing, and a dead translation key was left behind. This deviation was **not** logged in the contract's "Bygge-tids-avvik" section. Low severity — does not affect data integrity or the accepted behavior; worth a tiny follow-up to either wire the toast or drop the key.

## Non-blocking observations

- **Test discipline is clean.** `aggregate.test.ts` is a proper Type A pure-logic test (assertion-rich, `it.each` parametrization, no mocks/IO). `RowReactions.test.tsx` is a single controlled-component render test (4 cases: render/aria-pressed/onToggle/disabled) — does **not** re-assert aggregation math. No duplicated mock setup, no excessive `toContain`. Matches the contract's stated discipline (max one render test per component, Type A for the aggregator).
- **`RowReactions` is genuinely controlled** — no internal `useState`, pure function of props (`counts`, `mine`, `onToggle`, `disabled`); all state owned by `ReactionsProvider`. No stale-`initialData`-remount risk, exactly as the build-time deviation describes.
- **Provider→connector→strip seam is well-designed:** `RowReactionsForPlayer` returns `null` when no provider is mounted, which is why the ~37 existing format-view unit tests stayed green and why team/matchplay views are unaffected even though the connector is a shared import.
- **`page.tsx` wiring is correct:** `withReactions` wraps exactly the 9 individual-player return branches (stableford, solo_strokeplay, wolf, nassau, skins, bingo_bango_bongo, nines, round_robin, acey_deucey) and is NOT applied to matchplay/foursomes/scramble/shamble/patsome/state4/reveal branches.
- **0120 reasoning is sound:** REPLICA IDENTITY FULL is required so DELETE events carry `game_id` for the channel filter (same rationale as scores 0006) — confirmed FULL on staging.
