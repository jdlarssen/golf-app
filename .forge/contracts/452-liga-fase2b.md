# Contract: #452 Liga — Fase 2b (Poeng per plassering)

## Background

Epic #452 (Liga). Fase 2a shipped netto+brutto + Beste-N (v1.91.0). The points model
was deliberately split off as the most complex (it inverts the sort and adds per-round
placement points). `standings_model CHECK` already allows `'points'` (from migration 0080),
so **no schema change is needed** — the scheme is fixed, no config column.

## Scope (owner decisions)

- **Poeng-skjema (decided in Fase 2a discussion):** per round, rank the players who played
  by the active metric (lower to-par = better), then award points **descending from the field
  size** — winner = number of players who played that round, down to 1 for last. **Ties share
  the average** of the placements they occupy (e.g. 6 players, tie for 2nd–3rd → both get
  (5+4)/2 = 4.5). Season standing = **sum of points**, highest wins.
- **Missed round (decided now):** a player who didn't play a round gets **0 points** for it
  (they're outside the field). The per-round cell shows "—". No participation floor.

## Design (technical — my call)

### No migration
`points` is already in the `standings_model` CHECK; the scheme is fixed (no per-league config).

### Types (`lib/league/types.ts`)
- Widen `LeagueStandingsConfig.standingsModel` to include `'points'`.
- Add `points: number | null` to `LeagueStandingCell` (the points earned that round; null when not played or model isn't points). `toPar` stays (used by non-points models + still populated).

### `computeLeagueStandings` — direction-aware + points branch
- `const higherIsBetter = config.standingsModel === 'points';` Parametrize the existing
  compare/countback/unranked-sort and the countback "missing" sentinel by direction
  (lower-is-better for total/average/best_n stays byte-identical; points sorts descending,
  sentinel = −∞).
- Countback value accessor becomes model-aware: points → `cell.points` (higher better),
  else `cell.toPar` (lower better).
- **Points branch:** precompute per counting round a `Map<userId, points>` by ranking that
  round's players (metric asc) and assigning `fieldSize − position`, tie-averaging equal
  scores. Each player: `value` = sum of their round points; `cell.points` set per played
  round; missed round → cell.points stays null (0 contribution). `ranked = roundsPlayed > 0`.

### `getLigaSnapshot`
- Add `'points'` to the `standings_model` → config mapping (currently total/average/best_n).
  Points works on top of the metric per round, so the existing net/gross split is unchanged.

### Views (`LeagueStandingsTable`)
- `valueHeader`: points → `'Poeng'`.
- `formatValue`: points → plain number (1 decimal only when fractional from a tie), no E/+/−.
- `RoundCell`: model-aware — points model shows `cell.points` as a plain number (or "—" when
  null); other models show `cell.toPar` as to-par (unchanged). Thread the model in.

### Wizard (`CreateLigaForm`) + `actions.ts`
- Add `'points'` to the season-model options ('Poeng per plassering' + desc). No extra config
  field (scheme is fixed); no best_n_count / penalty UI for points.
- `actions.ts`: allow `standings_model === 'points'`. (best_n_count stays null for points.)
- Widen the local `StandingsModel` type to include `'points'`.

### Admin detail (`LigaManagement`)
- `STANDINGS_LABEL` += `points: 'Poeng per plassering'`.

## Success criteria

- [ ] `computeLeagueStandings` points model: per-round placement points descending from field size, ties share the average, season = sum, sorted **highest-first**. Covered by Type-A tests.
- [ ] Missed round = 0 points (cell null/"—"), and a player with 0 played rounds is unranked. Tested.
- [ ] Points placement uses the **active metric** (net vs gross give different placements → different points). Tested.
- [ ] Direction-aware countback: a season-points tie breaks on most-recent-round points (higher better); total/average/best_n behaviour is unchanged (existing tests stay green).
- [ ] Public `/liga/[id]`: points league shows a "Poeng" column, per-round points, highest-first ordering; net/gross toggle still works for a points+both league.
- [ ] Wizard offers "Poeng per plassering"; `actions.ts` accepts it; admin detail shows the label. No dead config UI.
- [ ] Version bump MINOR + CHANGELOG; PR uses **`Part of #452`** (epic stays open; Fase 3/4 remain).

## Gates

- `npx vitest run lib/league/ components/league/` — green (incl. new points tests; existing lower-is-better tests unchanged).
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds (exhaustiveness over the widened model in views/labels).

## Non-goals

- Any points config beyond the fixed descending-from-count scheme (e.g. F1-style table, admin-entered points) — not requested.
- Klubb-tilknytning (Fase 3), non-stroke formats (Fase 4).
- Combining points with Beste-N (the "best N points rounds" variant was offered and not chosen).
