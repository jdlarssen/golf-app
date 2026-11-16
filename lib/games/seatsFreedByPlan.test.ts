import { describe, expect, it } from 'vitest';
import { seatsFreedByPlan } from './rosterEdit';

// Type A (#2482, U12 F5): a save that removes players and lowers the cap in
// one go is checked against the seats left after the removals.

const row = (user_id: string, team_number: number | null = null, withdrawn_at: string | null = null) => ({
  user_id,
  team_number,
  withdrawn_at,
});

describe('seatsFreedByPlan', () => {
  it('no deletes → 0', () => {
    expect(seatsFreedByPlan([row('a'), row('b')], [])).toBe(0);
  });

  it('each active player outside a team gives back one seat', () => {
    expect(seatsFreedByPlan([row('a'), row('b'), row('c')], ['a', 'c'])).toBe(2);
  });

  it('a withdrawn row holds no seat, so it gives none back', () => {
    expect(seatsFreedByPlan([row('a', null, '2026-10-01T10:00:00Z')], ['a'])).toBe(0);
  });

  it('a removed teammate frees nothing: the team keeps its size', () => {
    expect(seatsFreedByPlan([row('a', 1), row('b', 1)], ['a'])).toBe(0);
  });

  it('a delete that is not on the prior roster counts nothing', () => {
    expect(seatsFreedByPlan([row('a')], ['x'])).toBe(0);
  });
});
