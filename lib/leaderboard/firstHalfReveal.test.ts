import { describe, expect, it } from 'vitest';
import type { GameStatus } from '@/lib/games/status';
import type { ScoreVisibility } from '@/lib/games/visibility';
import type { GameMode } from '@/lib/scoring/modes/types';
import {
  firstHalfTableView,
  tableClipsToFirstHalf,
  type FirstHalfTableView,
} from './firstHalfReveal';

// #1978. Fram til nå sto formatlista bare som POSISJON i en if-kjede i
// leaderboardContent.tsx — best ball er det eneste formatet som når
// state3/state3.5-grenen, fordi de 21 andre returnerer tidligere. Appen leste
// ikke den regelen og viste hele 18-hulls-tavla live.
//
// Radene for de ANDRE formatene er derfor det viktigste her: de gjør domenet
// til en kjørt regel i stedet for en kommentar. Flytter noen et format ut av
// en tidlig retur på webben uten å røre denne fila, blir dette rødt.

describe('tableClipsToFirstHalf', () => {
  it('klipper best ball', () => {
    expect(tableClipsToFirstHalf('best_ball')).toBe(true);
  });

  it.each<GameMode>([
    'stableford',
    'modified_stableford',
    'singles_matchplay',
    'greensome_matchplay',
    'foursomes_matchplay',
    'fourball_matchplay',
    'solo_strokeplay',
    'texas_scramble',
    'florida_scramble',
    'ambrose',
    'shamble',
    'patsome',
    'wolf',
    'skins',
    'nassau',
    'nines',
    'bingo_bango_bongo',
    'acey_deucey',
    'round_robin',
    'chapman_matchplay',
    'gruesome_matchplay',
  ])('klipper ikke %s', (mode) => {
    expect(tableClipsToFirstHalf(mode)).toBe(false);
  });
});

describe('firstHalfTableView', () => {
  const base = {
    gameMode: 'best_ball' as GameMode,
    status: 'active' as GameStatus,
    scoreVisibility: 'live' as ScoreVisibility,
    gateOpen: false,
  };

  it.each<[string, Partial<typeof base>, FirstHalfTableView]>([
    // Best ball, live, pågår — selve saken i #1978.
    ['porten er lukket: ingen lag er gjennom hull 9', { gateOpen: false }, 'waiting'],
    ['porten er åpen: første halvdel vises', { gateOpen: true }, 'first-half'],
    // Avsluttet runde er hele fasiten, som før.
    ['runden er avsluttet', { status: 'finished', gateOpen: true }, 'full'],
    ['avsluttet med lukket port', { status: 'finished', gateOpen: false }, 'full'],
    // Reveal eier sin egen skjuling på begge flater; to lag med hver sin
    // regel over samme tabell er nettopp hvordan de kom i utakt.
    ['reveal mens runden går', { scoreVisibility: 'reveal', gateOpen: true }, 'full'],
    ['reveal etter avslutning', { scoreVisibility: 'reveal', status: 'finished' }, 'full'],
    // Før første slag er runden fortsatt planlagt.
    ['runden er planlagt', { status: 'scheduled' }, 'waiting'],
  ])('best ball, %s → %s', (_label, overrides, expected) => {
    expect(firstHalfTableView({ ...base, ...overrides })).toBe(expected);
  });

  it.each<GameMode>(['stableford', 'greensome_matchplay', 'skins', 'wolf', 'texas_scramble'])(
    '%s viser hele runden live, uansett port',
    (gameMode) => {
      expect(firstHalfTableView({ ...base, gameMode, gateOpen: false })).toBe('full');
      expect(firstHalfTableView({ ...base, gameMode, gateOpen: true })).toBe('full');
    },
  );
});
