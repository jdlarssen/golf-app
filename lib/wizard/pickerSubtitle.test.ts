import { describe, it, expect } from 'vitest';
import { pickerSubtitle } from './pickerSubtitle';

describe('pickerSubtitle', () => {
  it.each<[string, Parameters<typeof pickerSubtitle>[0], ReturnType<typeof pickerSubtitle>]>([
    [
      'best ball 4 is two teams of 2',
      { gameMode: 'best_ball', target: 4, teamSize: 2 },
      { kind: 'lineup', players: 4, lineup: { kind: 'teams', teams: 2, size: 2 } },
    ],
    [
      'best ball 8 is four teams of 2',
      { gameMode: 'best_ball', target: 8, teamSize: 2 },
      { kind: 'lineup', players: 8, lineup: { kind: 'teams', teams: 4, size: 2 } },
    ],
    [
      'singles is 1 against 1',
      { gameMode: 'singles_matchplay', target: 2, teamSize: 1 },
      { kind: 'lineup', players: 2, lineup: { kind: 'versus', perSide: 1 } },
    ],
    [
      'fourball is 2 against 2',
      { gameMode: 'fourball_matchplay', target: 4, teamSize: 2 },
      { kind: 'lineup', players: 4, lineup: { kind: 'versus', perSide: 2 } },
    ],
    [
      'texas 8 with teams of 4 is two teams of 4',
      { gameMode: 'texas_scramble', target: 8, teamSize: 4 },
      { kind: 'lineup', players: 8, lineup: { kind: 'teams', teams: 2, size: 4 } },
    ],
    [
      'texas 8 with teams of 2 is four teams of 2',
      { gameMode: 'texas_scramble', target: 8, teamSize: 2 },
      { kind: 'lineup', players: 8, lineup: { kind: 'teams', teams: 4, size: 2 } },
    ],
    [
      'texas 8 with a team size that does not divide is only the count',
      { gameMode: 'texas_scramble', target: 8, teamSize: 3 },
      { kind: 'players', players: 8 },
    ],
    [
      'wolf 4 is 1 against 3',
      { gameMode: 'wolf', target: 4, teamSize: 1 },
      { kind: 'lineup', players: 4, lineup: { kind: 'wolf', opponents: 3 } },
    ],
    ['stableford is only the count', { gameMode: 'stableford', target: 4, teamSize: 1 }, { kind: 'players', players: 4 }],
    ['skins is only the count', { gameMode: 'skins', target: 5, teamSize: 1 }, { kind: 'players', players: 5 }],
    ['a target the format does not fit is only the count', { gameMode: 'best_ball', target: 5, teamSize: 2 }, { kind: 'players', players: 5 }],
    ['no target is only the format', { gameMode: 'best_ball', target: null, teamSize: 2 }, { kind: 'formatOnly' }],
  ])('%s', (_label, input, expected) => {
    expect(pickerSubtitle(input)).toEqual(expected);
  });
});
