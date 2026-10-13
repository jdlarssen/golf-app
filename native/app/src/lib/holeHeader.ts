// #2228: toppen på hullsiden, spillnavnet i gull og «format · bane» under. Ett
// hjem for de to linjene: hullsiden setter dem selv når bundelen er lest, og
// den som åpner siden sender dem med som parametre, så de står også når
// skjermens feilgrense har avmontert siden.
import { MODE_LABELS, type GameMode } from '../../../../lib/scoring/modes/types';

/** «Stableford · Byneset North». Mangler formatet eller banen, står den andre alene. */
export function holeTopLine(gameMode: string, courseName: string | null): string {
  return [MODE_LABELS[gameMode as GameMode] ?? null, courseName]
    .filter((part): part is string => !!part)
    .join(' · ');
}

/** Parametrene til `Hole` for toppen, fra et spill kalleren alt har. */
export function holeHeaderParams(
  game: { name: string; gameMode: string },
  courseName: string | null,
): { gameName: string; topLine: string } {
  return { gameName: game.name, topLine: holeTopLine(game.gameMode, courseName) };
}
