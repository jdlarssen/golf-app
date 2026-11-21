import { describe, it, expect } from 'vitest';
import { cupMatchModeConfig } from './insertCupMatches';
import type { CupAllowancePcts } from './cupMatchAllowance';

const PCTS: CupAllowancePcts = {
  fourball: 85,
  foursomes: 50,
  greensome: 100,
  chapman: 100,
  gruesome: 50,
  bestBall: 85,
};

describe('cupMatchModeConfig — singles (audit 2026-11-20)', () => {
  it('a new cup singles match gives the higher handicap the difference', () => {
    expect(cupMatchModeConfig('singles_matchplay', PCTS)).toEqual({
      kind: 'singles_matchplay',
      team_size: 1,
      match_strokes: 'difference',
    });
  });

  it('cup best ball keeps the original ranking rule (contract #2625)', () => {
    expect(cupMatchModeConfig('best_ball', PCTS)).not.toHaveProperty('ranking');
  });
});
