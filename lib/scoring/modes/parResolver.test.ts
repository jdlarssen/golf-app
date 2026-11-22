import { describe, it, expect } from 'vitest';
import { asScoringGender, parFor } from './parResolver';
import type { ScoringHole } from './types';

// Type A: the par a player plays to, by tee (#240). `asScoringGender` reads a
// tee value from a row (`game_players.tee_gender`, the app bundle's string) so
// every call site resolves par through `parFor` (audit 2026-11-20).

const hole: ScoringHole = {
  number: 1,
  par: 4,
  strokeIndex: 1,
  parByGender: { mens: 4, ladies: 5, juniors: 3 },
};

describe('asScoringGender', () => {
  it.each([
    ['mens', 'mens'],
    ['ladies', 'ladies'],
    ['juniors', 'juniors'],
    ['unknown', undefined],
    [null, undefined],
    [undefined, undefined],
  ] as const)('%s → %s', (input, expected) => {
    expect(asScoringGender(input)).toBe(expected);
  });
});

describe('parFor', () => {
  it("returns the tee's own par, and men's par for an unknown tee", () => {
    expect(parFor(hole, asScoringGender('ladies'))).toBe(5);
    expect(parFor(hole, asScoringGender('juniors'))).toBe(3);
    expect(parFor(hole, asScoringGender(null))).toBe(4);
  });

  it('falls back to the single par without per-tee data', () => {
    expect(parFor({ number: 1, par: 4, strokeIndex: 1 }, 'ladies')).toBe(4);
  });
});
