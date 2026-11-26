import { describe, it, expect } from 'vitest';
import { cupMatchModeConfig } from './insertCupMatches';
import type { CupAllowancePcts } from './cupMatchAllowance';

const PCTS: CupAllowancePcts = {
  fourball: 90,
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

  it('a new cup four-ball match gives the share of the difference to the lowest (#2997)', () => {
    expect(cupMatchModeConfig('fourball_matchplay', PCTS)).toEqual({
      kind: 'fourball_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 90,
      match_strokes: 'difference',
    });
  });

  it('the other two-a-side cup formats are not stamped (#2997)', () => {
    expect(cupMatchModeConfig('foursomes_matchplay', PCTS)).not.toHaveProperty('match_strokes');
  });

  it('cup best ball keeps the original ranking rule (contract #2625)', () => {
    expect(cupMatchModeConfig('best_ball', PCTS)).not.toHaveProperty('ranking');
  });
});
