# Contract: #452 Liga — Fase 2a (netto + brutto parallelt + Beste-N)

## Background

Epic #452 (Liga). Fase 1 shipped a standalone net-only stroke-play league with `total` + `average`
season models. The data model already prepared the headroom: `leagues.scoring CHECK in
('net','gross','both')` and `leagues.standings_model CHECK in ('total','average','best_n','points')`
exist, but Fase 1 hardcoded `scoring='net'` and validated only `total`/`average`.

`computeSoloStrokeplay()` already returns `totalGrossStrokes` per player; `getLigaSnapshot`
currently extracts only net-to-par.

## Scope (owner decisions, 2026-06-07)

- **Split:** Fase 2a = netto+brutto + **Beste-N**. **Poeng-per-plassering deferred to Fase 2b**
  (separate run). Do NOT build `points` model here.
- **Both-display:** when `scoring='both'`, ONE table with a **segmented Netto/Brutto toggle**
  (reuse the `SegmentedField` visual language), default Netto. `net`-only / `gross`-only → single
  table, no toggle.
- **Beste-N when player has < N played rounds:** **penalty-fill up to N** — reuse the existing
  penalty machinery (`penalty_kind` worst_plus_one / fixed). No `must_play_all` combo for best_n.

(Recorded for Fase 2b, not built now: points scheme = descending-from-count, winner = #ranked
players that round down to 1, ties share the average of the tied placements' points.)

## Design (technical — my call per project conventions)

### Schema — migration `0085_league_best_n.sql` (apply to prod via Supabase MCP; additive + unreferenced until deploy, safe)
- `alter table public.leagues add column best_n_count int;`
- `check (best_n_count is null or best_n_count >= 1)`
- `check (standings_model <> 'best_n' or best_n_count is not null)` (best_n requires a count).

### Types (`lib/league/types.ts`)
- `LeagueRoundPlayerScore`: add `grossToPar: number` alongside `netToPar`.
- `LeagueStandingsConfig.standingsModel`: widen to `Extract<StandingsModel,'total'|'average'|'best_n'>`; add `bestNCount: number | null`.
- New: `export type LeagueStandingsByScoring = { net: LeagueStandings | null; gross: LeagueStandings | null }`.

### `computeLeagueStandings(config, rounds, playerIds, metric: 'net' | 'gross')`
- New `metric` param selects `netToPar` vs `grossToPar` per score; total/average logic unchanged otherwise.
- **best_n model:** universe = rounds-with-results (same filter as total). Per player, candidate set =
  played metric-scores ∪ penalty-score for each missed round-with-results (penalty via existing
  `penaltyFor`). `value` = sum of the **lowest N** candidates, N capped at `min(bestNCount, roundsWithResults)`.
  Played ≥ N → penalties never selected (and worst played rounds beyond N dropped). Played < N →
  lowest penalties fill the gap. `roundsPlayed` = real played count; `perRound` cells unchanged
  (penalised flag on filled rounds shown like total).

### `getLigaSnapshot`
- Extract `grossToPar = totalGrossStrokes − teePar[gender]` next to net.
- Read `league.scoring` + `league.best_n_count`.
- Compute net standings when scoring ∈ {net,both}, gross when ∈ {gross,both}; return `standings: LeagueStandingsByScoring`.

### Views
- New `'use client'` `components/league/LeagueStandingsPanel.tsx`: owns Netto/Brutto toggle when both
  present, renders the presentational `LeagueStandingsTable` with the selected rows + scoring-aware
  empty/label handling. Single table when only one scoring present.
- `LeagueStandingsTable` value-header: `total→'Totalt'`, `average→'Snitt'`, `best_n→'Beste N'`.
- `app/liga/[id]/page.tsx`: render the panel from the new `{net,gross}` shape.
- `app/admin/liga/[id]/LigaManagement.tsx`: `STANDINGS_LABEL` += `best_n: 'Beste N runder'`; info card shows scoring (Netto / Brutto / Begge).

### Wizard (`app/admin/liga/new/CreateLigaForm.tsx` + `lib/league/actions.ts`)
- Expose `scoring` as a radio (Netto / Brutto / Begge) — replaces the hidden `'net'`.
- `standings_model` options += `best_n` ('Beste N runder'). NOT `points`.
- When `best_n` selected: show `best_n_count` number input (≥1) + penalty-kind config (penalty-fill); `missed_round_policy` forced to penalty for best_n.
- Widen the local `StandingsModel` type to include `'best_n'`.
- `actions.ts` `createLeagueDraft`: validate `scoring ∈ {net,gross,both}`, `standings_model ∈ {total,average,best_n}`, `best_n_count ≥ 1` required iff best_n; write `best_n_count`.

## Success criteria

- [ ] Migration `0085_league_best_n.sql` adds `leagues.best_n_count` with both CHECKs; applied to prod (verify column + constraints exist).
- [ ] `computeLeagueStandings` computes gross standings when `metric='gross'` (distinct from net) and the **best_n** model (lowest-N with penalty-fill for <N played), capped at rounds-with-results. Covered by new Type-A tests.
- [ ] `getLigaSnapshot` returns `standings.net` and/or `standings.gross` per the league's `scoring`, with gross-to-par correctly derived from `totalGrossStrokes`.
- [ ] Public `/liga/[id]`: `scoring='both'` shows a working Netto/Brutto segmented toggle (default Netto); `net`/`gross`-only shows a single correct table; best_n header reads "Beste N".
- [ ] Wizard creates a league with any `scoring` (net/gross/both) and `standings_model` (total/average/best_n); best_n requires a count; invalid combos rejected by `actions.ts`. Admin detail shows scoring + best_n label.
- [ ] `points` model is NOT selectable in the wizard and remains unimplemented (deferred to Fase 2b) — no dead UI.
- [ ] Version bumped MINOR (→ v1.91.0) + CHANGELOG entry; PR uses **`Part of #452`** (epic stays open).

## Gates

- `npx vitest run lib/league/` — green (incl. new best_n + gross tests).
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds (exhaustiveness over the widened standings model in views).

## Non-goals

- Poeng-per-plassering / `points` model (Fase 2b).
- Klubb-tilknytning beyond what Fase 1/0083 already did (Fase 3).
- Non-stroke formats (Fase 4).
- Editing scoring/standings_model after league creation (set-at-create only, as Fase 1).
