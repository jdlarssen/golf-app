// Native N3 (#1825), utvidet i N4 (#1828): hvilke spill appen faktisk kan vise.
//
// ÉN regel for både føring og leaderboard. Et format som ikke kan føres i
// appen, vises heller ikke som resultattabell — halvstater («du kan se, men
// ikke taste») er verre for spilleren enn en ærlig henvisning til nettsiden.
//
// N4 flyttet scramble-familien og alternate-shot-matchplay UT av gaten: begge
// kollapser til ett lagkort, som appen nå fører, og motoren gir dem ferdige
// lag-/side-resultater. Til gjengjeld gikk wolf og Bingo Bango Bongo INN — de
// henter halve regnestykket sitt fra egne per-hull-tabeller, og appen kunne
// hverken lese eller skrive dem.
//
// #1832 åpnet de to igjen: appen leser nå `wolf_hole_choices` og
// `bingo_bango_bongo_holes` (`data/choices.ts`), fører valgene på hull-siden
// (`components/hole/`) og mater dem inn i den delte motoren. Ett format står
// igjen i gaten:
//
//  1. **Patsome** — segment-hybrid (4BBB til hull 6, foursomes fra hull 7) med
//     egne tee-starters.
//
// Uendret fra N3:
//  - **Segment-spill** (`hole_segment !== 'full'`): front9/back9-halvdelene av
//    en delt cup-dag. Kolonnen er NOT NULL med default `'full'`, så et vanlig
//    spill står ALLTID som `'full'` — gaten må teste mot verdien, ikke mot om
//    feltet er satt. N5 eier dem.
//  - **Deriverte spill** (`source_game_id` satt): cup-avledninger som aldri
//    føres direkte. N5 eier dem.
import type { GameMode } from '../../../../lib/scoring/modes/types';

/**
 * Formatene som er stengt på grunn av SELVE spilleformen — ett per d.d.
 *
 * Skrevet ut som en liste og ikke utledet fra et delt predikat med vilje:
 * ingen av de delte predikatene beskriver «har ikke fått sin flate i appen
 * ennå», og en gate som later som den følger et delt begrep ville drevet fra
 * det ved neste endring. Lista har krympet én gang før (#1832 slapp wolf og
 * Bingo Bango Bongo ut), og det skal den kunne gjøre igjen — én rad om gangen.
 */
const GATED_MODES: readonly GameMode[] = ['patsome'];

/** Hvorfor et spill ikke vises i appen. `null` = det vises. */
export type GateReason = 'mode' | 'segment' | 'derived';

export interface GatedGame {
  gameMode: string;
  holeSegment: string;
  sourceGameId: string | null;
}

/**
 * Grunnen til at spillet er stengt i appen, eller `null` når det er åpent.
 * `isScoringSupported` er dette svaret som boolean — de to kan ikke drive fra
 * hverandre.
 */
export function gateReason(game: GatedGame): GateReason | null {
  if (GATED_MODES.includes(game.gameMode as GameMode)) return 'mode';
  if (game.holeSegment !== 'full') return 'segment';
  if (game.sourceGameId != null) return 'derived';
  return null;
}

export function isScoringSupported(game: GatedGame): boolean {
  return gateReason(game) === null;
}

/**
 * Teksten spilleren får i stedet for en føring-CTA og et leaderboard.
 * Formuleringen skiller på hva som er stengt: formatet (som gjelder alle
 * runder i det formatet) eller nettopp denne runden (cup-halvdeler og
 * avledninger, der samme format ellers går fint i appen).
 */
export function gateMessage(reason: GateReason): string {
  return reason === 'mode'
    ? 'Dette formatet føres på nettsiden ennå.'
    : 'Denne runden føres på nettsiden ennå.';
}
