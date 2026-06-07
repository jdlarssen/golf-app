// Per-flight liga-scoring (#452 Fase 4). Ren funksjon som tar én ferdig-spilt
// flights ingredienser + liga-formatet og produserer per-spiller-runde-verdier
// for sesong-tabellen. `getLigaSnapshot` bygger ingrediensene fra DB-rader og
// kaller hit; markør-regelen (≥2 leverte) og finished-filteret ligger i kalleren.
//
// Formatet bestemmer både scoring-motoren og verdiens betydning:
//  - slagspill → mot-par (totalStrokes − tee-par), lavest best;
//  - (modifisert) stableford → stableford-poeng, høyest best (kun netto, så
//    brutto-aksen speiler netto).
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
};

export function computeFlightRoundValues(input: FlightScoringInput): LeagueRoundPlayerScore[] {
  const { format, gameId, players, holes, scores, parByUser, deliveredOutsideWindow } = input;
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
    const result =
      format === 'stableford' ? computeStableford(ctx) : computeModifiedStableford(ctx);
    // Liga er alltid solo (team_size 1) → solo-varianten. Defensivt mot team.
    if (result.variant !== 'solo') return out;
    for (const line of result.players) {
      if (line.holesPlayed !== holeCount) continue;
      // Stableford er netto-only; brutto-aksen speiler netto så `metric='gross'`
      // aldri kollapser til 0 (den rangeres uansett ikke for poeng-ligaer).
      out.push({
        userId: line.userId,
        net: line.totalPoints,
        gross: line.totalPoints,
        deliveredOutsideWindow,
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
    });
  }
  return out;
}
