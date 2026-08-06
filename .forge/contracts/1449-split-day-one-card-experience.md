# Spec: Split cup day — one card, one round, one delivery (#1449 + #1466 + #1463 layer 1)

> **Supersedes** the earlier #1449 contract (`1449-split-day-home-archive-cards.md`,
> commit bea0db5b), which built display-filtering only (alternative A). The owner
> discussed the alternatives in-session 2026-08-07 and ordered the full one-card
> experience instead. All product choices below are OWNER DECISIONS from that
> discussion — the PR presents no open alternatives.

## Problem

On a split cup day (#1441) a player is in three `games` rows per physical round
(front9 greensome host, back9 best ball host, derived singles). The app shows
this plumbing to the player: **three cards** on Home and in `/spill-arkiv`
(#1449), **two scorecard deliveries** for one round plus a submit-CTA dead end at
the hole 9 boundary (#1466), and after the day there is **no durable, findable
door** back into the cup (#1463). Owner order: «ett kort som fører rett inn til
føring — de starter uansett på hull 1; ideelt ett kort for alle 18 hullene».

## Research Findings

- Supabase docs (MCP `search_docs`, 2026-08-07): dot-notation filters on an
  embedded `!inner` relation (`.is('games.source_game_id', null)`) drop parent
  rows whose embed doesn't match — same mechanism both target queries already use
  with `.eq('games.status', …)`.
- `tournaments` has `status`, `winner_team (1|2|null)`, `team_1_name`,
  `team_2_name` persisted (database.types.ts) — the finished-card badge reads
  stored truth, it never recomputes cup points.
- The 18-hole flow already exists at navigation level: `findSegmentSibling`
  (lib/games/segmentSibling.ts, #1441) bridges hole 9 ↔ 10 between the two hosts.
  This spec builds presentation + delivery on top of it; no data-model change.

## Prior Decisions

- **#1441:** the two-host + derived-singles split IS the mechanism that lets two
  formats share one physical round. Data-level merge (one 18-hole game) is
  rejected — presentation-level merge only. `segmentSibling` stays
  navigation-only: never merge score data.
- **#1453:** team-cascade delivery exists — delivering marks teammates per the
  one-scorecard-per-team rule. #1466's one-delivery builds on it.
- **#344 «one door per room»:** the cup-day card becomes the player's door to the
  cup; the cup page stays the room where the whole day lives.
- **#1406 auto-merge policy:** product choices here are already decided by the
  owner (this session) → no `## Alternativer`-section. Fast-form
  fordeler/ulemper-block still required. Staging-verify + `staging-verified`
  label BEFORE merge (user-visible flow).

## Owner Decisions (2026-08-07, in-session — binding)

1. **One card per split cup day** on Home, straight into scoring (next unscored
   hole across both halves; hole 1 at start).
2. **Hole 9:** primary action is «Videre til hull 10» — no deliver-CTA on the
   front9 host at the boundary. **One delivery at hole 18** delivers BOTH games
   (#1466, owner order from the generalprøven).
3. **After the round:** one cup-branded card per cup day in «Avsluttede spill» +
   `/spill-arkiv`, linking to the cup page (#1463 layer 1: the card is the door).
4. **Card result text:** neutral (no result) while the cup is unfinished; once
   `tournaments.status = 'finished'`: «Laget ditt vant/tapte cupen» (from
   `winner_team` + the player's cup team; `winner_team = null` + finished →
   tied-cup copy, reuse «Delt»-voice).
5. **No result-spoiling redesign of the cup page in this PR** — that is #1468
   (own issue, built right after, designed with #1459/#1456). Interim: cup page
   shows results after finish exactly as today; accepted by owner.
6. **One PR** for the whole experience.

## Design

### 1. Active Home card — one per split-day round

- `activeGamesQuery` (app/[locale]/page.tsx:163): add
  `.is('games.source_game_id', null)` (derived games never render as cards) and
  select `tournament_id` + keep `hole_segment`.
- **Pairing (pure function, Type A tests):** among the player's active games,
  pair rows sharing `tournament_id` with opposite `hole_segment` front9/back9.
  Disambiguate multiple days in one cup by same Oslo calendar day of
  `scheduled_tee_off_at` (fallback: nearest `created_at`). An unpairable half
  degrades to today's single card — never crash, never hide.
- **Merged card:** one `GameRowCard` for the pair. Title: the cup name (strip the
  per-match suffix from `${cupName} – ${label}` or read `tournaments.name`).
  Meta: course + flight, as today. State = the pair's earliest stage (either
  half has unscored holes → `continue`; both filled but undelivered → deliver
  state; delivered → submitted/pending approval per existing
  `resolveActiveCardState` semantics, merged). Href for `continue`: next
  unscored hole in front9 host, else next unscored in back9 host — extend
  `getActiveGameCardData` to resolve across the pair.

### 2. Hole-9 boundary + one delivery (#1466)

- Front9 host, all 9 holes filled, sibling exists and is undelivered: primary
  CTA is the bridge («Videre til hull 10 · Best ball»); suppress the deliver-CTA
  (PrimaryCta/`deliveryStatus` surfaces).
- Submit on the back9 host delivers BOTH hosts: the player's own rows via the
  #1453 team cascade on each, compensated batch with `expectAffected` — a
  half-delivered pair must be logged and surfaced, never silent.
- Purring/reminders: skip front9-undelivered players whose back9 sibling is
  undelivered — they are nagged via the back9 game.
- Approve-flow: peer approval (where enabled) still happens per host game;
  the merged card's `pendingApprovalsForMe` sums the pair.

### 3. Finished card — one per cup day

- `getFinishedGamesForUser` (lib/games/getFinishedGamesForUser.ts:52): add
  `.is('games.source_game_id', null)`; extend the select with `tournament_id`,
  `hole_segment`, and the tournament embed (`name`, `status`, `winner_team`,
  `team_1_name`, `team_2_name`). Pair host halves with the same pure pairing
  function (key on same Oslo day of `ended_at`).
- Merged entry renders a cup-branded variant of `FinishedGameCard`: cup name as
  title, «Cup-dag»-marking, link → `/cup/[id]` (NOT a game leaderboard).
- Badge per owner decision 4. The player's cup team comes from the tournament
  roster (same source `getCupSnapshot.roster` uses — slim query, not the full
  snapshot).
- `result_summary` persistence for derived games (`finishDerivedGames`) is KEPT
  — reversibility + future surfaces; update its docstring.
- Non-split cup games (`hole_segment='full'`) and all non-cup games: unchanged.

### 4. i18n + copy

- New keys in `no` + `en` (card marking, badge texts, bridge/deliver CTAs as
  needed). Norwegian copy through the humanizer-skill check; matchplay-family
  voice («Delt», not «Halvert» — see bc8b606f).

## Edge Cases & Guardrails

- One half finished, other active (admin finishes hosts individually): the pair
  stays ONE active-list card (state from the unfinished half); the finished card
  appears only when BOTH hosts are finished. No day may show cards in both lists.
- Reopened host (`reopenGame` fan-out): pair returns to the active list.
- Player withdrawn from one half: degrade to single-card behavior for the
  remaining half.
- Cup tied at finish (`winner_team` null + status finished): tied-cup badge, not
  a false win/loss.
- Empty state on Home: derives from the merged lists — a split-day player must
  never see the «start here» welcome.
- Must NOT touch: cup scoring/points, stats/historikk/achievements (already
  filtered on `source_game_id`), admin games list, discovery feed, cup-page
  result display (#1468's scope).

## Key Decisions

- Presentation-level merge, not data-level — #1441's split is the format engine.
- Pairing is a pure, unit-tested function shared by both lists — one home for
  the rule (AGENTS.md trap 4).
- Badge reads persisted `tournaments.winner_team` — never recomputes (T1 step 5:
  reuse over recompute, the #887 lesson).
- Deliver-both is compensated + `expectAffected` — 0-row silent success is the
  #667/#704 pattern (trap 2).

**Claude's Discretion:**
- Where the pairing helper lives (`lib/games/` vs `lib/cup/`), its exact
  signature, and the merged-card component structure (variant of `GameRowCard`
  composition vs new component reusing primitives in `components/ui/`).
- Exact copy wording (through humanizer), badge phrasing within decision 4.
- Whether `getActiveGameCardData` grows pair-awareness or a sibling helper wraps
  it — pick the smaller diff that keeps one source of truth for card state.

## Success Criteria

- [ ] Staging, split-day player, fresh day: Home shows exactly ONE card for the
      cup day; tap lands on hole 1 of the front9 host. Screenshot on PR.
- [ ] Staging, front9 filled: hole 9's primary action is the bridge to hole 10;
      no deliver-CTA on the front9 host. Screenshot on PR.
- [ ] Staging, all 18 filled: one «Lever»-flow marks BOTH hosts delivered
      (verify both `game_players` rows). Screenshot + query output on PR.
- [ ] Staging, both hosts finished: ONE cup-branded finished card on Home +
      `/spill-arkiv`, linking to `/cup/[id]`; badge neutral while the cup is
      active. Screenshot on PR.
- [ ] Staging, tournament finished with a winner: badge reads «Laget ditt
      vant/tapte cupen» correctly for a player on each team.
- [ ] Staging regression: a normal (non-cup) game renders unchanged in both
      lists; a non-split cup match renders unchanged.
- [ ] Pairing + merged-state logic has Type A unit tests (empty/one/many/
      boundary/duplicate-day/unpairable cases).

## Gates

- [ ] `npm run build` passes (full build — never pre-filter tsc output).
- [ ] `npx vitest run` green for new tests + co-located tests of every changed
      file.
- [ ] Commit discipline: `feat(cup)`-prefix on the user-visible commit, MINOR
      bump (`npm version minor --no-git-tag-version`), one Funksjon-line in
      CHANGELOG.md per `docs/changelog-conventions.md`, `Refs`-footer per commit.
- [ ] PR body: `Closes #1449`, `Closes #1466`, `Part of #1463` (layer 2 — the
      historikk «Cuper»-section — stays open), fordeler/ulemper-block, note that
      product choices were owner-decided in-session 2026-08-07.
- [ ] Staging-verify skill + `staging-verified` label BEFORE merge. Seeding a
      split-day fixture via service-role SQL on staging is sanctioned, or drive
      the generator UI.

## Files Likely Touched

- `app/[locale]/page.tsx` — filter + pair + merged active card
- `lib/games/getActiveGameCardData.ts` — pair-aware state/href
- `lib/games/getFinishedGamesForUser.ts` — filter + tournament embed + pairing
- `lib/games/` (new) — pure pairing helper + tests
- `components/games/FinishedGameCard.tsx` (or sibling variant) — cup-day card
- PrimaryCta/`deliveryStatus` surfaces + submit action — #1466 bridge + deliver-both
- purring/reminder logic — skip bridged front9 halves
- `messages/no.json` + `messages/en.json` — new keys
- `lib/games/syncDerivedGamesStatus.ts` — docstring only
- `package.json` / `package-lock.json` / `CHANGELOG.md` — minor bump + line

## Out of Scope

- #1468 — cup page without results + dedicated resultatside (built right after,
  designed with #1459/#1456). Interim spoiler behavior accepted by owner.
- #1463 layer 2 — «Cuper»-section in /profile/historikk.
- #1456 — cup-page match-card links to kamp-scorekort.
- #1459 — arrangør reveal order during ctp/ld registration.
- Data-level merge of the two hosts / single 18-hole scorecard UI.
- Cup-branding of non-split cup match cards.
- Removing derived-game `result_summary` persistence.
