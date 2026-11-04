// #2754: hvem får reaksjoner, og hvor langt tavla må rulle for at raden skal stå
// over stripa. Type A: rene regler uten nett.
import type { GameMode } from '../../../../lib/scoring/modes/types';
import { canReact, gameHasReactions, revealScrollY } from './reactions';

const game = (gameMode: GameMode, modeConfig: unknown = {}) => ({ gameMode, modeConfig }) as never;

describe('gameHasReactions', () => {
  it.each([
    'solo_strokeplay',
    'wolf',
    'nassau',
    'skins',
    'bingo_bango_bongo',
    'nines',
    'round_robin',
    'acey_deucey',
  ] as const)('%s har reaksjoner', (mode) => {
    expect(gameHasReactions(game(mode))).toBe(true);
  });

  it('solo stableford har reaksjoner, lag-stableford har det ikke', () => {
    expect(gameHasReactions(game('stableford', { kind: 'stableford', team_size: 1 }))).toBe(true);
    expect(gameHasReactions(game('stableford', { kind: 'stableford', team_size: 2 }))).toBe(false);
  });

  it.each([
    'singles_matchplay',
    'fourball_matchplay',
    'foursomes_matchplay',
    'best_ball',
    'texas_scramble',
    'shamble',
    'patsome',
  ] as const)('%s har ingen reaksjoner (#977)', (mode) => {
    expect(gameHasReactions(game(mode))).toBe(false);
  });
});

describe('canReact', () => {
  const bundle = (withdrawnAt: string | null) =>
    ({ players: [{ userId: 'me', withdrawnAt }, { userId: 'mate', withdrawnAt: null }] }) as never;

  it('en deltaker kan reagere', () => {
    expect(canReact(bundle(null), 'me')).toBe(true);
  });

  it('en som har trukket seg kan ikke', () => {
    expect(canReact(bundle('2026-11-01T10:00:00Z'), 'me')).toBe(false);
  });

  it('en som ikke spiller eller ikke er logget inn kan ikke', () => {
    expect(canReact(bundle(null), 'arrangør')).toBe(false);
    expect(canReact(bundle(null), null)).toBe(false);
  });
});

describe('revealScrollY', () => {
  it('ruller ikke når raden står over stripa', () => {
    expect(revealScrollY({ rowBottom: 500, stripTop: 600, scrollY: 40 })).toBeNull();
  });

  it('ruller akkurat nok, med luft, når raden havner bak stripa', () => {
    expect(revealScrollY({ rowBottom: 650, stripTop: 600, scrollY: 40 })).toBe(40 + 50 + 12);
  });

  it('regner en rad som så vidt er dekket av lufta som dekket', () => {
    expect(revealScrollY({ rowBottom: 595, stripTop: 600, scrollY: 0 })).toBe(7);
  });
});
