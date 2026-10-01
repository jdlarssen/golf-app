import { describe, it, expect } from 'vitest';
import { formatLineup } from './formatLineup';

// #2260: the line-up a format card draws for n players — sides, teams, the
// team sizes that fit, Wolf, the Skins pot, or everyone on their own.
describe('formatLineup (#2260)', () => {
  it.each([
    ['best_ball', 2, { kind: 'teams', teams: 1, size: 2 }],
    ['best_ball', 4, { kind: 'sides', perSide: 2 }],
    ['best_ball', 6, { kind: 'teams', teams: 3, size: 2 }],
    ['patsome', 4, { kind: 'sides', perSide: 2 }],
    ['patsome', 8, { kind: 'teams', teams: 4, size: 2 }],
    ['fourball_matchplay', 4, { kind: 'sides', perSide: 2 }],
    ['gruesome_matchplay', 4, { kind: 'sides', perSide: 2 }],
    ['singles_matchplay', 2, { kind: 'sides', perSide: 1 }],
    ['texas_scramble', 4, { kind: 'sides', perSide: 2 }],
    ['texas_scramble', 6, { kind: 'teamSizes', sizes: [2, 3] }],
    ['texas_scramble', 8, { kind: 'teamSizes', sizes: [2, 4] }],
    ['texas_scramble', 12, { kind: 'teamSizes', sizes: [2, 3, 4] }],
    ['ambrose', 9, { kind: 'teams', teams: 3, size: 3 }],
    ['florida_scramble', 6, { kind: 'sides', perSide: 3 }],
    ['shamble', 8, { kind: 'sides', perSide: 4 }],
    ['stableford', 1, { kind: 'solo', players: 1 }],
    ['stableford', 4, { kind: 'solo', players: 4 }],
    ['nassau', 3, { kind: 'solo', players: 3 }],
    ['wolf', 4, { kind: 'wolf', opponents: 3 }],
    ['wolf', 5, { kind: 'wolf', opponents: 4 }],
    ['wolf', 3, { kind: 'wolf', opponents: 2 }],
    ['skins', 4, { kind: 'pot', players: 4 }],
  ] as const)('%s, n=%i → %j', (mode, n, expected) => {
    expect(formatLineup(mode, n)).toEqual(expected);
  });
});
