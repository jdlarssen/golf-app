// Per-flight liga-scoring (#452 Fase 4). Ren funksjon som tar én ferdig-spilt
// flights ingredienser + liga-formatet og produserer per-spiller-runde-verdier
// for sesong-tabellen. `getLigaSnapshot` bygger ingrediensene fra DB-rader og
// kaller hit; markør-regelen (≥2 leverte) og finished-filteret ligger i kalleren.
//
// Formatet bestemmer både scoring-motoren og verdiens betydning:
//  - slagspill → mot-par (totalStrokes − tee-par), lavest best;
//  - (modifisert) stableford → stableford-poeng, høyest best. Brutto-aksen er
//    poengene uten handicapslag: samme kort regnet en gang til med
//    courseHandicap 0 (#2638, en bruttoliga). `lib/scoring/` røres ikke.
// Bare komplette kort teller (holesPlayed === antall hull) — et pickup-hull gjør
// kortet ufullstendig, akkurat som i slagspill-stien fra før.

import { compute as computeSoloStrokeplay } from '@/lib/scoring/modes/soloStrokeplay';
import { compute as computeStableford } from '@/lib/scoring/modes/stableford';
import { compute as computeModifiedStableford } from '@/lib/scoring/modes/modifiedStableford';
import type {
  ScoringContext,
  ScoringPlayer,
  ScoringHole,
  ScoringHoleScore,
} from '@/lib/scoring/modes/types';
import { buildScorecardGrid, stablefordPointsFnFor, type ScorecardGrid } from '@/lib/scorecard/scorecardGrid';
import { leagueFlightGameConfig } from './flightFormat';
import type { LeagueFormat, LeagueRoundPlayerScore, StandingsMetric } from './types';

export type FlightScoringInput = {
  format: LeagueFormat;
  gameId: string;
  /** Tellende spillere (kaller har allerede filtrert: levert, ikke trukket). */
  players: ScoringPlayer[];
  holes: ScoringHole[];
  scores: ScoringHoleScore[];
  /** Tee-totalpar per spiller (kjønns-oppslått). Leses kun for slagspill (mot-par). */
  parByUser: Map<string, number | null>;
  deliveredOutsideWindow: boolean;
  /** Flightens `games.ended_at`; tres videre til hver spillers resultat (#2214). */
  finishedAt: string | null;
};

/** The engine's context for the flight, scored as `format`. */
function flightContext(input: FlightScoringInput, format: LeagueFormat): ScoringContext {
  const { gameMode, modeConfig } = leagueFlightGameConfig(format);
  return {
    game: { id: input.gameId, game_mode: gameMode, mode_config: modeConfig },
    players: input.players,
    holes: input.holes,
    scores: input.scores,
  };
}

export function computeFlightRoundValues(input: FlightScoringInput): LeagueRoundPlayerScore[] {
  const { format, gameId, players, parByUser, deliveredOutsideWindow, finishedAt } = input;
  const holeCount = input.holes.length;
  const ctx = flightContext(input, format);

  const out: LeagueRoundPlayerScore[] = [];

  if (format === 'stableford' || format === 'modified_stableford') {
    const score = format === 'stableford' ? computeStableford : computeModifiedStableford;
    const result = score(ctx);
    // #2638: brutto stableford = poeng uten handicapslag. Samme kort, samme
    // motor, alle spillere med courseHandicap 0.
    const grossResult = score({
      ...ctx,
      players: players.map((p) => ({ ...p, courseHandicap: 0 })),
    });
    // Liga er alltid solo (team_size 1) → solo-varianten. Defensivt mot team.
    if (result.variant !== 'solo' || grossResult.variant !== 'solo') return out;
    const grossByUser = new Map(grossResult.players.map((l) => [l.userId, l.totalPoints]));
    for (const line of result.players) {
      if (line.holesPlayed !== holeCount) continue;
      out.push({
        userId: line.userId,
        gameId,
        net: line.totalPoints,
        gross: grossByUser.get(line.userId) ?? line.totalPoints,
        deliveredOutsideWindow,
        finishedAt,
      });
    }
    return out;
  }

  // slagspill: mot-par på begge akser.
  const result = computeSoloStrokeplay(ctx);
  for (const line of result.players) {
    if (line.holesPlayed !== holeCount) continue;
    const par = parByUser.get(line.userId);
    if (par === null || par === undefined) continue;
    out.push({
      userId: line.userId,
      gameId,
      net: line.totalNetStrokes - par,
      gross: line.totalGrossStrokes - par,
      deliveredOutsideWindow,
      finishedAt,
    });
  }
  return out;
}

/** #2815: one player's card behind a cell in the season table. */
export type FlightCard = {
  /** The round's value on the axis, the number the table's cell holds. */
  value: number;
  /** The course handicap the net axis counted with; null on the gross axis. */
  playingHandicap: number | null;
  /** The classic card (UT/INN) with net or points per hole and the sums. */
  grid: ScorecardGrid;
};

/**
 * #2815: a player's card in a counted flight, on the table's axis. The value is
 * `computeFlightRoundValues`' own, so a card exists exactly when the table has
 * a number for the player (a complete card, a known tee par), and the card can
 * never say something the cell does not.
 *
 * The handicap strokes per hole are the engine's hole rows (gross − net, the
 * stroke-play engine's allocation); on the gross axis there are none. The grid
 * (`buildScorecardGrid`, the app's classic card) sums the halves and adds the
 * points per hole with the stableford engine's own points table. Pure, so the
 * server builds the card and the app only draws it.
 */
export function computeFlightCard(
  input: FlightScoringInput,
  userId: string,
  metric: StandingsMetric,
): FlightCard | null {
  const row = computeFlightRoundValues(input).find((r) => r.userId === userId);
  const player = input.players.find((p) => p.userId === userId);
  if (!row || !player) return null;

  const onAxis = metric === 'gross' ? { ...player, courseHandicap: 0 } : player;
  const holeRows = computeSoloStrokeplay(flightContext({ ...input, players: [onAxis] }, 'stroke')).holes;
  const grid = buildScorecardGrid({
    rows: holeRows.map((hole) => {
      const cell = hole.perPlayer[0]!;
      return {
        holeNumber: hole.holeNumber,
        par: cell.par,
        strokes: cell.gross,
        extra: cell.gross !== null && cell.net !== null ? cell.gross - cell.net : null,
      };
    }),
    pointsFn: stablefordPointsFnFor(leagueFlightGameConfig(input.format).gameMode),
  });
  return {
    value: metric === 'gross' ? row.gross : row.net,
    playingHandicap: metric === 'gross' ? null : player.courseHandicap,
    grid,
  };
}
