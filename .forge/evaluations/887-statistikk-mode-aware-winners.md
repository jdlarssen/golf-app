# Evaluation: #887 — Statistikk-siden, riktig vinner per modus

## Verdict: **ACCEPT**

The fix is logically correct, exhaustively covers all 22 modes via the three `ResultSummary`
kinds, introduces no new RLS surface, and is proven against **real prod data** across four
non-netto modes (stableford, singles_matchplay, skins, bingo_bango_bongo) plus a real
withdrawn-player row. Gates pass independently. The only remaining open item is the staging
UI render spot-check, which is correctly left as an owner/manual last-mile step — the logic is
otherwise fully proven.

Commit under review: `138910f` (single commit at HEAD on `claude/objective-zhukovsky-c91d8d`).

---

## Gate results (run independently, Node v22.23.0)

| Gate | Command | Outcome |
| --- | --- | --- |
| Type check | `npx tsc --noEmit` | **PASS** — exit 0, no output |
| Unit tests | `npx vitest run lib/stats/clubStats.test.ts` | **PASS** — 14/14 (1 file) |
| Lint | `npx eslint "app/[locale]/profile/statistikk/page.tsx" lib/stats/clubStats.ts lib/stats/clubStats.test.ts` | **PASS** — exit 0, clean |
| Adjacent (source-of-truth) | `npx vitest run lib/scoring/resultSummary.test.ts` | **PASS** — 10/10 |
| Version bump | `package.json` 1.133.82 → **1.133.83** (PATCH) | **PASS** |
| CHANGELOG | Entry `[1.133.83]` nested under open `## 1.133.y` series, 3-layer format | **PASS** |

---

## Per-criterion

### SC1 — stableford/matchplay/skins credit the stored per-mode winner, not netto-best-ball — **PASS**
`isWinningSummary` maps `placement → rank===1`, `matchplay → outcome==='win'`, `skins → rank===1`.
Verified exhaustively: every member of the `ModeResult` union (`lib/scoring/modes/types.ts:2132`,
16 result kinds) is handled in `computeResultSummaries` and emits exactly one of those three
`ResultSummary` kinds — scramble family (ambrose/florida/shamble/patsome) → `placement`;
greensome/chapman/gruesome → `foursomes_matchplay` → `matchplay`; wolf/nassau/nines/round_robin/
acey_deucey/bbb/solo_strokeplay → `placement`; skins → `skins`. No mode escapes the three rules.
Note the scoring-layer `result.kind` differs from the DB `game_mode` (e.g. ambrose stores
`game_mode='ambrose'` but computes a `texas_scramble`-shaped result); the helper operates on the
`ResultSummary` produced by the engine, so this aliasing is handled correctly.

**Real-prod proof (read-only, prod ref `glofubopddkjhymcbaph`):**
- singles_matchplay `7f6233ad`: stored winner **Karl** (`outcome:'win'`, 2up); Jørgen loss. The old
  code ran `computeLeaderboard({mode:'netto'})` — matchplay has no netto total, so the old winner was
  semantically meaningless. New logic reads the genuine match outcome.
- skins `5dc40e5e`: stored winner **Karl** (`rank:1, skins:9`); Jørgen `rank:2, skins:8`. Old logic
  credited lowest-net, unrelated to skins count.
- stableford `6d10495d`: winner **Jørgen** (`rank:1`); the third player (Kristian) is withdrawn and
  has `result_summary:null` → excluded.
- stableford `d6258d40`: winner **Even Fornes** (`rank:1`, gross 81) — NOT Jørgen (rank 3) and not
  necessarily the lowest-gross Karl (75).
- bingo_bango_bongo `13ac6c14`: winner **Jørgen** (`rank:1`); old code computed netto best-ball for a
  BBB game (wrong).

  (Caveat noted honestly: for the two 2-player prod games checked, the net-proxy ordering happened to
  also pick the stored winner, because with extreme handicap spreads net and the mode winner coincide.
  This is luck of the data, not a refutation — matchplay/skins are not decided by net total at all, and
  the unit tests cover the divergent case directly. The fix is structurally correct.)

### SC2 — withdrawn players excluded from both tallies — **PASS**
`aggregateFinishedGame` filters `withdrawnAt == null` for participants; winners derive only from
`active`. Test "excludes withdrawn players…" asserts a winning summary on a withdrawn row is still
excluded. Confirmed by real data: Kristian (`withdrawn_at` set, `result_summary:null`) in game
`6d10495d` is correctly dropped from participation and winners. This is an intentional behavior change
from the old page (which counted all players for participation) — aligns with #844 / scoring surfaces.

### SC3 — all-null-summary games set needsFallback and use buildModeResultForGame winners — **PASS**
`needsFallback = active.length > 0 && players.every(p.resultSummary == null)`. Page `page.tsx:113-140`
collects fallback game ids, uses the **admin client** (`getAdminClient`, RLS-bypass — matches
`persistResultSummaries`), runs `buildModeResultForGame` → `computeResultSummaries` →
`isWinningSummary`, and `result === null` short-circuits to no winners. `tallyClubStats` only consults
the fallback map when `needsFallback` (test "uses fallback winners… ignores fallback otherwise"
asserts a stored-summary game ignores its fallback entry). Participation always comes from
`game_players` (active), never from the engine — confirmed. No double-counting: each game contributes
participation once and winners either from stored summaries OR fallback, never both.

### SC4 — computeLeaderboard loop + holes/scores happy-path fetch removed — **PASS**
New `page.tsx` does not import `computeLeaderboard`, `COURSE_HOLES_SELECT`, or `SCORES_SELECT`.
Happy path fetches only `games` (finished) + `game_players`. `course_holes`/`scores` are read only
inside `buildModeResultForGame` for the rare fallback games. Confirmed against `git show HEAD~1` of the
page (old: 4 round-trips incl. holes+scores; new: 2).

### SC5 — subtitles third-person + format-agnostic, no «best-ball-netto»/«laget ditt», humanizer-clean — **PASS**
`no.json`: winnersSubtitle = «Antall ferdigspilte spill spilleren har vunnet.», mostActiveSubtitle =
«Antall ferdigspilte spill spilleren har deltatt i.» `en.json`: "Number of completed games this player
has won." / "…has taken part in." No «laget ditt» / «best-ball-netto» / "your team" / "best-ball net".
Natural Norwegian/English, third-person. Clean.

### SC6 — renders without error on staging with correct tally — **PENDING (owner/manual last-mile)**
Acceptable to leave PENDING per the brief. The data-layer is proven: schema columns confirmed present
in prod (`game_players.result_summary` jsonb + `withdrawn_at` timestamptz; `games.game_mode/mode_config/
course_id/status`), the happy-path RLS surface is a strict subset of the old (already-shipped) page, and
tsc/lint/unit gates are green. A staging boot + `/profile/statistikk` render against a known finished
non-netto round is the remaining manual confirmation.

---

## RLS / regression check — **CLEAN**
Old page read `games`(finished) + `game_players` + `course_holes` + `scores` via the cookie
(RLS-respecting) client. New happy path reads `games`(finished) + `game_players` only — a **subset** —
so no new RLS surface is introduced. The fallback engine uses the admin client (RLS-bypass), matching
`persistResultSummaries`, which is the same pattern already in production; it runs only for the rare
all-null games. Schema ground-truth columns verified live in prod.

---

## Bugs / edge cases / risks
**None blocking found.** Minor observations (not defects):
- `tallyClubStats` recomputes `aggregateFinishedGame` per game once, and the page calls
  `aggregateFinishedGame` a second time just to collect `needsFallback` ids (`page.tsx:113`). Harmless
  micro-redundancy on a pure function; readability-positive. Not worth a change.
- Performance (unbounded club-scale fetch) is explicitly out of scope → #869, which the contract
  correctly sequences to land *after* this. No objection.
- The participation semantics change (withdrawn now excluded) is intentional and contract-specified;
  worth a one-line note in the closing comment so the owner knows the "most active" numbers may shift
  slightly downward for any historical game that had a withdrawal.

## Bottom line
ACCEPT. Logic is exhaustive and correct, gates are green, and the fix is demonstrated on real prod data
across four non-netto modes plus a real withdrawn player. Only the staging UI render remains as a
manual owner spot-check.
