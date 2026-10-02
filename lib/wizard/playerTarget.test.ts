import { describe, it, expect } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import {
  exactPlayerCount,
  inviteEmailRoom,
  pickerCap,
  playerTarget,
  trayCount,
} from './playerTarget';

describe('exactPlayerCount', () => {
  it.each<[GameMode, number | null]>([
    ['singles_matchplay', 2],
    ['nines', 3],
    ['round_robin', 4],
    ['acey_deucey', 4],
    ['fourball_matchplay', 4],
    ['foursomes_matchplay', 4],
    ['greensome_matchplay', 4],
    ['chapman_matchplay', 4],
    ['gruesome_matchplay', 4],
    ['best_ball', null],
    ['stableford', null],
    ['solo_strokeplay', null],
    ['texas_scramble', null],
    ['wolf', null],
    ['nassau', null],
    ['skins', null],
    ['bingo_bango_bongo', null],
  ])('%s → %s', (mode, expected) => {
    expect(exactPlayerCount(mode)).toBe(expected);
  });
});

describe('pickerCap', () => {
  it.each<[string, Parameters<typeof pickerCap>[0], number | null]>([
    // Today's caps, unchanged.
    ['best ball', { gameMode: 'best_ball', requiresTeams: true, isSolo: false, teamSize: 2 }, 40],
    ['texas à 3', { gameMode: 'texas_scramble', requiresTeams: true, isSolo: false, teamSize: 3 }, 39],
    ['par-stableford', { gameMode: 'stableford', requiresTeams: true, isSolo: false, teamSize: 2 }, 40],
    ['solo stableford', { gameMode: 'stableford', requiresTeams: false, isSolo: true, teamSize: 1 }, 40],
    ['singles', { gameMode: 'singles_matchplay', requiresTeams: false, isSolo: false, teamSize: 1 }, 2],
    // New caps.
    ['fourball', { gameMode: 'fourball_matchplay', requiresTeams: true, isSolo: false, teamSize: 2 }, 4],
    ['wolf', { gameMode: 'wolf', requiresTeams: false, isSolo: false, teamSize: 1 }, 5],
    ['nassau', { gameMode: 'nassau', requiresTeams: false, isSolo: false, teamSize: 1 }, 16],
    ['skins', { gameMode: 'skins', requiresTeams: false, isSolo: false, teamSize: 1 }, 16],
    ['bbb', { gameMode: 'bingo_bango_bongo', requiresTeams: false, isSolo: false, teamSize: 1 }, 16],
    ['nines', { gameMode: 'nines', requiresTeams: false, isSolo: false, teamSize: 1 }, 3],
  ])('%s → %s', (_label, input, expected) => {
    expect(pickerCap(input)).toBe(expected);
  });
});

describe('playerTarget', () => {
  it.each<[string, Parameters<typeof playerTarget>[0], number | null]>([
    ['kompis best ball follows the count', { gameMode: 'best_ball', intent: 'kompis', expectedPlayerCount: 4 }, 4],
    ['kompis without a count has no target', { gameMode: 'best_ball', intent: 'kompis', expectedPlayerCount: undefined }, null],
    ['klubb has no soft target', { gameMode: 'best_ball', intent: 'klubb', expectedPlayerCount: 8 }, null],
    ['solo has no soft target', { gameMode: 'stableford', intent: 'solo', expectedPlayerCount: 4 }, null],
    ['a fixed count wins in klubb', { gameMode: 'nines', intent: 'klubb', expectedPlayerCount: undefined }, 3],
    ['a fixed count wins over the kompis count', { gameMode: 'singles_matchplay', intent: 'kompis', expectedPlayerCount: 4 }, 2],
    ['fourball is four', { gameMode: 'fourball_matchplay', intent: undefined, expectedPlayerCount: undefined }, 4],
  ])('%s', (_label, input, expected) => {
    expect(playerTarget(input)).toBe(expected);
  });
});

describe('trayCount', () => {
  it.each<[string, Parameters<typeof trayCount>[0], ReturnType<typeof trayCount>]>([
    ['missing one', { selected: 3, target: 4 }, { kind: 'missing', selected: 3, target: 4, missing: 1 }],
    ['missing several', { selected: 1, target: 4 }, { kind: 'missing', selected: 1, target: 4, missing: 3 }],
    ['reached', { selected: 4, target: 4 }, { kind: 'reached', selected: 4, target: 4 }],
    ['over', { selected: 6, target: 4 }, { kind: 'over', selected: 6, target: 4, over: 2 }],
    ['no target', { selected: 5, target: null }, { kind: 'noTarget', selected: 5 }],
    ['nobody selected yet', { selected: 0, target: 2 }, { kind: 'missing', selected: 0, target: 2, missing: 2 }],
  ])('%s', (_label, input, expected) => {
    expect(trayCount(input)).toEqual(expected);
  });
});

describe('inviteEmailRoom', () => {
  it.each<[string, Parameters<typeof inviteEmailRoom>[0], number]>([
    ['no cap gives ten', { cap: null, selected: 3 }, 10],
    ['singles with one selected', { cap: 2, selected: 1 }, 1],
    ['singles with two selected', { cap: 2, selected: 2 }, 0],
    ['never below zero', { cap: 2, selected: 3 }, 0],
    ['at most ten when the cap is far away', { cap: 40, selected: 1 }, 10],
  ])('%s', (_label, input, expected) => {
    expect(inviteEmailRoom(input)).toBe(expected);
  });
});
