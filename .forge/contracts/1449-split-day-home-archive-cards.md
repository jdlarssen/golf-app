# Spec: Split cup day — one round, not three cards, on Home and in the archive (#1449)

## Problem

On a split cup day (#1441) every player is in three `games` rows per physical round:
a greensome host (front9), a best ball host (back9), and a derived singles match
(`source_game_id` → back9 host). Neither Home's game lists nor `/spill-arkiv`
filters `source_game_id`, so the player sees **three cards per physical round**:

- **Active list** ([page.tsx:163](app/[locale]/page.tsx)): `activeGamesQuery` has no
  `source_game_id` filter → the derived singles gets its own card. The card is
  navigable (derived-guard redirects to the read-only game-home) but is a dead end —
  no score entry exists on a derived game.
- **Finished lists** ([getFinishedGamesForUser.ts:52](lib/games/getFinishedGamesForUser.ts)):
  missing the `source_game_id IS NULL` filter that design doc F4
  (`docs/plans/2026-08-06-splittet-cup-dag-design.md:201–203`) explicitly lists for
  this helper and the Home cards → three finished cards per player per cup day, on
  both Home («Avsluttede spill») and `/spill-arkiv`.

Stats/historikk/achievements ARE correctly filtered (verified in the #1449 audit) —
this is display noise, not double counting.

## Research Findings

- Supabase docs («Querying Joins and Nested tables» + «Using Filters», fetched
  2026-08-07): dot-notation filters on an embedded relation (`games.column`)
  combined with `!inner` remove parent rows whose embed doesn't match. `.is()` is
  the null-operator variant of the same mechanism. Both target queries already use
  this exact pattern (`.eq('games.status', 'finished')` /
  `.in('games.status', [...])`), so the fix is one added filter per query — no
  query restructuring. (Context7 was unavailable this session — invalid API key —
  so verification ran via Supabase MCP `search_docs` + in-repo precedent.)

## Prior Decisions

- **#1413 (owner order, 2026-07-30):** product choices are decided in the PR, not
  before the build — build the recommendation (A), present B/C in the PR's
  `## Alternativer (produktvalg)` section, owner can answer «alternativ B» to have
  it rebuilt on the same branch. This supersedes the issue's «eier bør avgjøre
  først»-phrasing; the PR is where the owner decides.
- **#1406 auto-merge policy:** a PR with a `## Alternativer`/`## Produktvalg`
  heading is the machine marker that BLOCKS auto-merge. This PR MUST carry it.
- **Design doc #1441 F4:** `source_game_id IS NULL` filter listed for
  `getFinishedGamesForUser` + the Home cards — alternative A is the design's letter.
- **«One door per room» (#344):** the cup page is the room for cup-day results — it
  already renders every match (hosts + derived singles) with labels, players,
  result text and points ([cup/[id]/page.tsx:189](app/[locale]/cup/[id]/page.tsx)).
  The grouped per-round view alternative B would build already exists there.
- **#1441 segmentSibling scope note:** single-scorecard deluxe UI is explicitly out
  of scope; navigation-level bridges only. Nothing here may merge the two host cards.

## Design

**Build alternative A: filter derived games out of both list surfaces.**

1. `activeGamesQuery` ([page.tsx:167–173](app/[locale]/page.tsx)): add
   `.is('games.source_game_id', null)`. Player sees two actionable cards during a
   split day (front9 host + back9 host) — the dead-end derived card disappears.
2. `getFinishedGamesForUser` ([getFinishedGamesForUser.ts:52–59](lib/games/getFinishedGamesForUser.ts)):
   add `.is('games.source_game_id', null)`. Covers Home's «Avsluttede spill» AND
   `/spill-arkiv` in one choke point (shared helper, #571).
3. **Keep** `persistResultSummaries` for derived games in `finishDerivedGames`
   ([syncDerivedGamesStatus.ts:120](lib/games/syncDerivedGamesStatus.ts)) — it is
   what makes alternative B rebuildable without data loss (reversibility), and
   removing persistence is riskier than leaving an unread column. Update its
   docstring: the finished lists now filter derived games; the persisted summary
   remains for reversibility/future surfaces.
4. Filter at the query level, not render level — matches the existing
   `.eq('games.status', …)` pattern and keeps each list's single source of truth.

The singles result stays fully visible on `/cup/[id]` (match card with result text
and points). Host-game names are distinguishable per match
(`${cupName} – ${match.label}`, [generer/actions.ts:384](app/[locale]/admin/cup/[id]/generer/actions.ts)),
so no extra labeling is needed for A.

**PR presentation (mandatory, Norwegian, owner product-language):**
`## Alternativer (produktvalg)` section per CLAUDE.md's fast form —
recommendation first (A: designdokets bokstav, minst støy, cup-siden viser
singles-resultatet), then per alternative 2–3 fordeler/ulemper:
A) filter (built), B) behold kortene men merk + gruppér per runde,
C) behold som i dag. Ombyggingskostnad: B middels (samme data, ny visning),
C liten (revert). Reversibilitet: A er trivielt reversibel — result_summary
persisteres fortsatt. Close with the standard reply instruction + «ingen hast».

## Edge Cases & Guardrails

- Non-cup games: `source_game_id` is NULL → unaffected in both lists.
- Host games on a split day: still shown (two cards per physical round — merging
  them is NOT in scope, see segmentSibling scope note).
- Reopened host (`reopenGame` fans out active status to derived): derived stays
  hidden on Home — correct, its entry surface is the host.
- Player only in derived games (no host membership): would hit Home's empty state.
  Cannot occur via the generator (split-day lineup always places players on hosts);
  accepted as theoretical.
- `isEmptyState` on Home derives from the filtered lists — a pure-cup-day player
  with only derived games finished would see fewer cards, never a false welcome
  screen (hosts always accompany derived rows).
- Must NOT touch: cup snapshot/points, stats/historikk/achievements (already
  filtered), admin games list, notifications, discovery feed.

## Key Decisions

- Build A, decide in PR — per #1413; the issue itself frames this as a product
  choice, so the produktvalg heading is non-negotiable.
- Keep derived `result_summary` persistence — reversibility to B without data loss.
- Query-level filter in the two existing choke points — no new helper, no shared
  constant (two call sites with different query shapes; inline is simplest).

**Claude's Discretion:**
- Unit test only if it asserts observable behavior without re-implementing
  PostgREST embed semantics (e.g. none may be honest — the existing helpers have
  no co-located tests for query-shape). If skipped, staging verification below is
  the evidence; note it in the PR.
- Exact docstring wording (English, matches surrounding comment density).

## Success Criteria

- [ ] `activeGamesQuery` contains `.is('games.source_game_id', null)` — verify by
      reading `app/[locale]/page.tsx`.
- [ ] `getFinishedGamesForUser` contains `.is('games.source_game_id', null)` —
      verify by reading `lib/games/getFinishedGamesForUser.ts`.
- [ ] Staging: a split-day player's Home shows exactly TWO active cards for the cup
      day (front9 + back9 host), zero derived — screenshot posted on the PR.
- [ ] Staging: after host finish, Home «Avsluttede spill» + `/spill-arkiv` show two
      finished cards per cup day, and `/cup/[id]` still shows the singles result —
      screenshot posted on the PR.
- [ ] Staging regression: a normal (non-cup) game still appears in both lists.
- [ ] PR body has `## Alternativer (produktvalg)` with A/B/C per the fast form —
      PR waits for the owner; NO auto-merge.

## Gates

- [ ] `npm run build` passes (full build — do not pre-filter tsc output).
- [ ] `npx vitest run` for co-located tests of every changed file passes
      (e.g. `lib/games/syncDerivedGamesStatus.test.ts` if its file is touched).
- [ ] Commit discipline: `fix(home)`-prefix, patch bump
      (`npm version patch --no-git-tag-version`), one Feilrettinger line in
      CHANGELOG.md per `docs/changelog-conventions.md`, `Refs #1449` in body.
- [ ] Staging verification per `staging-verify` skill + `staging-verified` label
      BEFORE the PR is handed to the owner. Seeding a split-day fixture via
      service-role SQL on staging is sanctioned (2 hosts + 1 derived + memberships
      for `E2E_PLAYER_EMAIL`), or drive the real generator UI.

## Files Likely Touched

- `app/[locale]/page.tsx` — add embed filter to `activeGamesQuery`
- `lib/games/getFinishedGamesForUser.ts` — add embed filter + docstring line
- `lib/games/syncDerivedGamesStatus.ts` — docstring update only (optional)
- `package.json` / `package-lock.json` / `CHANGELOG.md` — patch bump + line

## Out of Scope

- Alternative B (label + group per round) — described in the PR, built only if the
  owner picks it (same branch).
- Merging the two host cards into «one card per physical round» (deluxe
  single-scorecard territory, rejected in #1441).
- Removing `result_summary` persistence for derived games.
- Admin games list (admin sees every game incl. derived — management view; F4
  mentions it, but the #1449 audit did not flag it and admin visibility is
  defensible; surface in PR notes, don't change).
- Discovery feed (participants are excluded via `excludedIds`; non-participant
  club-member visibility of cup games predates this issue).
- Notifications/purring for derived games.
