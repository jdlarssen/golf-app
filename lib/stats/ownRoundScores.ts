/**
 * «Lagets ball er ingen sin egen runde» — regelens hjem for historikken (#2265).
 *
 * Når laget deler én ball (scramble-familien, foursomes-familien og patsome),
 * står slagene på kapteinen, men de er lagets. Runden teller da som runde, men
 * gir ingen egne slag: ingen brutto, bragder, putter eller bane-snitt. Eieren
 * satte regelen for Kavalkaden 20.09, og webbens `/profile/historikk` og
 * appens Rundedagboka kaller begge hit, så nett og app viser samme tall.
 *
 * Hull 18 avgjør, som i `computeDifferentials` (#2273): patsome deler ballen
 * fra hull 7, så en hel patsome-runde er lagets.
 *
 * Ren og I/O-fri (Type A). Ingen server-import, så appen kan bruke den.
 */
import { modeCollapsesToTeamCard, type GameMode } from '@/lib/scoring/modes/types';

/** Hullet som avgjør om runden er lagets ball. */
const DECIDING_HOLE = 18;

/** Delte laget én ball hele runden? Da står raden som «Lagrunde». */
export function isTeamBallRound(gameMode: GameMode): boolean {
  return modeCollapsesToTeamCard(gameMode, DECIDING_HOLE);
}

/**
 * Spillerens egne slag i runden: `[]` når laget delte én ball, ellers radene
 * uendret.
 */
export function ownRoundScores<T>(gameMode: GameMode, rows: readonly T[]): readonly T[] {
  return isTeamBallRound(gameMode) ? [] : rows;
}
