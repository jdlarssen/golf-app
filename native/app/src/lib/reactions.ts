// #2754: hvem som får reaksjoner på tavla i appen.
//
// Samme formater som nettet: tavla for slagspill og solo stableford, og de sju
// enkle formatene der en rad er én spiller. Lag, matchplay og Patsome står i
// #977, og de koster verken lesing eller kanal.
import type { GameBundle } from '../data/gameBundle';
import { hasSoloBoard } from './soloBoard';

const SIMPLE_FORMATS: ReadonlySet<string> = new Set([
  'wolf',
  'nassau',
  'skins',
  'bingo_bango_bongo',
  'nines',
  'round_robin',
  'acey_deucey',
]);

export function gameHasReactions(game: GameBundle['game']): boolean {
  return hasSoloBoard(game) || SIMPLE_FORMATS.has(game.gameMode);
}

/**
 * Bare en deltaker som ikke har trukket seg kan gi reaksjoner, som i RLS
 * (`can_react_in_game`). Andre ser tallene RLS gir dem, men ingen knapper.
 */
export function canReact(bundle: Pick<GameBundle, 'players'>, userId: string | null): boolean {
  return bundle.players.some((player) => player.userId === userId && player.withdrawnAt == null);
}

/** Luften mellom raden og stripa når tavla må rulle. */
const REVEAL_GAP = 12;

/**
 * Hvor tavla skal rulle for at raden skal stå over stripa, eller `null` når den
 * alt gjør det. Målene er i vinduets punkter.
 */
export function revealScrollY(input: {
  rowBottom: number;
  stripTop: number;
  scrollY: number;
}): number | null {
  const overlap = input.rowBottom + REVEAL_GAP - input.stripTop;
  return overlap > 0 ? input.scrollY + overlap : null;
}
