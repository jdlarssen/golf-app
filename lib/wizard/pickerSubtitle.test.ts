import { describe, it, expect } from 'vitest';
import { pickerSubtitle, stepFourInstruction } from './pickerSubtitle';

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
    [
      'no target, best ball says what to pick',
      { gameMode: 'best_ball', target: null, teamSize: 2 },
      { kind: 'instruction', instruction: { kind: 'bestBall' } },
    ],
    [
      'no target, florida says what to pick',
      { gameMode: 'florida_scramble', target: null, teamSize: 3 },
      { kind: 'instruction', instruction: { kind: 'teamSize', teamSize: 3 } },
    ],
    [
      'no target, par stableford says what to pick',
      { gameMode: 'stableford', target: null, teamSize: 2 },
      { kind: 'instruction', instruction: { kind: 'parStableford' } },
    ],
    ['no target, solo is only the format', { gameMode: 'solo_strokeplay', target: null, teamSize: 1 }, { kind: 'formatOnly' }],
  ])('%s', (_label, input, expected) => {
    expect(pickerSubtitle(input)).toEqual(expected);
  });
});

describe('stepFourInstruction', () => {
  it.each<[string, Parameters<typeof stepFourInstruction>[0], ReturnType<typeof stepFourInstruction>]>([
    ['best ball in pairs', { gameMode: 'best_ball', teamSize: 2 }, { kind: 'bestBall' }],
    ['singles', { gameMode: 'singles_matchplay', teamSize: 1 }, { kind: 'singles' }],
    ['fourball', { gameMode: 'fourball_matchplay', teamSize: 2 }, { kind: 'teamMatchplay' }],
    ['foursomes', { gameMode: 'foursomes_matchplay', teamSize: 2 }, { kind: 'teamMatchplay' }],
    ['greensome', { gameMode: 'greensome_matchplay', teamSize: 2 }, { kind: 'teamMatchplay' }],
    ['chapman', { gameMode: 'chapman_matchplay', teamSize: 2 }, { kind: 'teamMatchplay' }],
    ['gruesome', { gameMode: 'gruesome_matchplay', teamSize: 2 }, { kind: 'teamMatchplay' }],
    ['par stableford', { gameMode: 'stableford', teamSize: 2 }, { kind: 'parStableford' }],
    ['par modified stableford', { gameMode: 'modified_stableford', teamSize: 2 }, { kind: 'parStableford' }],
    ['texas teams of 4', { gameMode: 'texas_scramble', teamSize: 4 }, { kind: 'teamSize', teamSize: 4 }],
    ['ambrose teams of 2', { gameMode: 'ambrose', teamSize: 2 }, { kind: 'teamSize', teamSize: 2 }],
    ['florida teams of 3', { gameMode: 'florida_scramble', teamSize: 3 }, { kind: 'teamSize', teamSize: 3 }],
    ['florida teams of 4', { gameMode: 'florida_scramble', teamSize: 4 }, { kind: 'teamSize', teamSize: 4 }],
    ['shamble teams of 3', { gameMode: 'shamble', teamSize: 3 }, { kind: 'teamSize', teamSize: 3 }],
    ['patsome', { gameMode: 'patsome', teamSize: 2 }, { kind: 'patsome' }],
    ['solo stableford', { gameMode: 'stableford', teamSize: 1 }, null],
    ['solo modified stableford', { gameMode: 'modified_stableford', teamSize: 1 }, null],
    ['solo strokeplay', { gameMode: 'solo_strokeplay', teamSize: 1 }, null],
    ['wolf', { gameMode: 'wolf', teamSize: 1 }, null],
    ['nines', { gameMode: 'nines', teamSize: 1 }, null],
    ['round robin', { gameMode: 'round_robin', teamSize: 1 }, null],
    ['acey deucey', { gameMode: 'acey_deucey', teamSize: 1 }, null],
    ['nassau', { gameMode: 'nassau', teamSize: 1 }, null],
    ['skins', { gameMode: 'skins', teamSize: 1 }, null],
    ['bingo bango bongo', { gameMode: 'bingo_bango_bongo', teamSize: 1 }, null],
  ])('%s', (_label, input, expected) => {
    expect(stepFourInstruction(input)).toEqual(expected);
  });
});
