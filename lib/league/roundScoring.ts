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
import { leagueFlightGameConfig } from './flightFormat';
import type { LeagueFormat, LeagueRoundPlayerScore } from './types';

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

export function computeFlightRoundValues(input: FlightScoringInput): LeagueRoundPlayerScore[] {
  const { format, gameId, players, holes, scores, parByUser, deliveredOutsideWindow, finishedAt } =
    input;
  const holeCount = holes.length;
  const { gameMode, modeConfig } = leagueFlightGameConfig(format);

  const ctx: ScoringContext = {
    game: { id: gameId, game_mode: gameMode, mode_config: modeConfig },
    players,
    holes,
    scores,
  };

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
      net: line.totalNetStrokes - par,
      gross: line.totalGrossStrokes - par,
      deliveredOutsideWindow,
      finishedAt,
    });
  }
  return out;
}
