import { describe, it, expect } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import {
  MIN_TEE_SHOTS_OPTIONS,
  asMinTeeShots,
  clampMinTeeShots,
  defaultMinTeeShots,
  formatTracksTeeShots,
  freeHolesAtMinimum,
  infeasibleMinTeeShots,
  highestFeasibleMinTeeShots,
  isTeeShotChangeAllowed,
  minTeeShotsFeasible,
  readMinTeeShots,
  selectableOnHole,
  teamTeeShotDelivery,
  teeShotDeliveryAdvice,
  teeShotHoleLine,
  teeShotStatus,
  type TeeShotPick,
  type TeeShotStatusInput,
} from './teeShots';

// Type A (#2580): the one TypeScript home of the tee-shot rule. The four-player
// team in the artboards (row 71 on the design canvas) is Marte, Jonas, Sigrid
// and Per, in that team order.
const M = 'marte';
const J = 'jonas';
const S = 'sigrid';
const P = 'per';
const TEAM = [M, J, S, P];

function picks(owners: readonly (string | null)[], firstHole = 1): TeeShotPick[] {
  return owners.map((teeShotBy, i) => ({ holeNumber: firstHole + i, teeShotBy }));
}

function input(minimum: number, owners: readonly (string | null)[], memberIds = TEAM): TeeShotStatusInput {
  return { minimum, memberIds, picks: picks(owners) };
}

function countsOf(i: TeeShotStatusInput): Record<string, number> {
  return Object.fromEntries(teeShotStatus(i).players.map((p) => [p.userId, p.count]));
}

// Utslag 3 (`Utslag-forslag-levering`), the scorecard's tee-shot row hole by
// hole: Marte 7, Jonas 5, Sigrid 4, Per 2.
const LEVERING = [S, M, M, J, S, M, M, J, P, S, M, J, P, J, M, S, J, M];
// Utslag 2 (`Utslag-forslag-hull`): hole 7 after the pick (Marte).
const HULL_7 = LEVERING.slice(0, 7);
// Utslag 2b (`Utslag-forslag-hull-laast`): hole 16 before the pick.
const HULL_16 = LEVERING.slice(0, 15);
// Utslag 5 (`Utslag-forslag-shamble-hull`): hole 7 after the pick (Marte).
const SHAMBLE_7 = [M, J, S, P, J, S, M];

describe('formatTracksTeeShots', () => {
  it.each([
    ['texas_scramble', true],
    ['ambrose', true],
    ['florida_scramble', true],
    ['shamble', true],
    ['patsome', false],
    ['best_ball', false],
    ['stableford', false],
    ['greensome_matchplay', false],
  ] as [GameMode, boolean][])('%s → %s', (mode, expected) => {
    expect(formatTracksTeeShots(mode)).toBe(expected);
  });
});

// The same table stands in supabase/tests/team_tee_shots_test.sql against the
// CHECK `games_min_tee_shots_valid` (trap 4: one rule, every layer agrees).
describe('minTeeShotsFeasible', () => {
  it.each([
    [2, 3, true],
    [2, 4, true],
    [2, 5, true],
    [2, 6, true],
    [3, 3, true],
    [3, 4, true],
    [3, 5, true],
    [3, 6, true],
    [4, 3, true],
    [4, 4, true],
    [4, 5, false],
    [4, 6, false],
  ])('team of %i, minimum %i → %s', (teamSize, min, expected) => {
    expect(minTeeShotsFeasible(min, teamSize)).toBe(expected);
  });

  it.each([2, 7, 3.5, 0, -4, Number.NaN])('rejects %s, which is not an option', (min) => {
    expect(minTeeShotsFeasible(min, 2)).toBe(false);
  });

  it('options are 3–6', () => {
    expect([...MIN_TEE_SHOTS_OPTIONS]).toEqual([3, 4, 5, 6]);
  });
});

describe('highestFeasibleMinTeeShots', () => {
  it.each([
    [2, 6],
    [3, 6],
    [4, 4],
  ])('team of %i → %i', (teamSize, expected) => {
    expect(highestFeasibleMinTeeShots(teamSize)).toBe(expected);
  });

  it('gives null when not even 3 fits', () => {
    expect(highestFeasibleMinTeeShots(4, 9)).toBeNull();
  });
});

describe('the wizard helpers', () => {
  it.each([
    [2, 4],
    [3, 4],
    [4, 4],
  ])('team of %i starts on %i when the setting is turned on', (teamSize, expected) => {
    expect(defaultMinTeeShots(teamSize)).toBe(expected);
  });

  it.each([
    [6, 4, 4],
    [5, 4, 4],
    [4, 4, 4],
    [6, 2, 6],
    [null, 4, null],
  ] as const)('clamp %s for a team of %i → %s', (min, teamSize, expected) => {
    expect(clampMinTeeShots(min, teamSize)).toBe(expected);
  });

  it.each([
    [2, []],
    [3, []],
    [4, [5, 6]],
  ] as const)('team of %i: «går ikke» on %j', (teamSize, expected) => {
    expect(infeasibleMinTeeShots(teamSize)).toEqual(expected);
  });

  it.each([
    [4, 4, 2],
    [3, 4, 6],
    [6, 2, 6],
    [6, 3, 0],
  ])('minimum %i, team of %i → %i holes to choose freely', (min, teamSize, expected) => {
    expect(freeHolesAtMinimum(min, teamSize)).toBe(expected);
  });

  it.each([
    [4, 4],
    [6, 6],
    ['4', null],
    [3.5, null],
    [7, null],
    [null, null],
    [undefined, null],
  ])('asMinTeeShots(%j) → %s', (value, expected) => {
    expect(asMinTeeShots(value)).toBe(expected);
  });
});

describe('readMinTeeShots', () => {
  it.each([
    ['missing', 'texas_scramble', { kind: 'texas_scramble', team_size: 4 }, null],
    ['null config', 'texas_scramble', null, null],
    ['string', 'texas_scramble', { team_size: 4, min_tee_shots: '4' }, null],
    ['fraction', 'texas_scramble', { team_size: 4, min_tee_shots: 3.5 }, null],
    ['out of range', 'texas_scramble', { team_size: 2, min_tee_shots: 7 }, null],
    ['not feasible for the team', 'shamble', { team_size: 4, min_tee_shots: 5 }, null],
    ['wrong format', 'best_ball', { team_size: 2, min_tee_shots: 4 }, null],
    ['valid texas', 'texas_scramble', { team_size: 4, min_tee_shots: 4 }, 4],
    ['valid ambrose', 'ambrose', { team_size: 2, min_tee_shots: 6 }, 6],
    ['valid florida', 'florida_scramble', { team_size: 3, min_tee_shots: 5 }, 5],
    ['valid shamble', 'shamble', { team_size: 4, min_tee_shots: 3 }, 3],
  ] as [string, GameMode, unknown, number | null][])('%s', (_label, mode, config, expected) => {
    expect(readMinTeeShots(mode, config)).toBe(expected);
  });
});

describe('teeShotStatus', () => {
  it('Utslag 2: hole 7 after the pick', () => {
    const status = teeShotStatus(input(4, HULL_7));
    expect(countsOf(input(4, HULL_7))).toEqual({ [M]: 4, [J]: 1, [S]: 2, [P]: 0 });
    expect(status.openHoles).toHaveLength(11);
    expect(status.totalShort).toBe(9);
    expect(status.excess).toBe(-2);
    expect(status.canDeliver).toBe(false);
  });

  it('Utslag 2b: hole 16 before the pick', () => {
    const status = teeShotStatus(input(4, HULL_16));
    expect(countsOf(input(4, HULL_16))).toEqual({ [M]: 6, [J]: 4, [S]: 3, [P]: 2 });
    expect(status.openHoles).toEqual([16, 17, 18]);
    expect(status.totalShort).toBe(3);
    expect(status.short.map((p) => [p.userId, p.missing])).toEqual([
      [P, 2],
      [S, 1],
    ]);
    expect(status.excess).toBe(0);
  });

  it('Utslag 3: all 18 holes, Per short by 2', () => {
    const status = teeShotStatus(input(4, LEVERING));
    expect(countsOf(input(4, LEVERING))).toEqual({ [M]: 7, [J]: 5, [S]: 4, [P]: 2 });
    expect(status.totalShort).toBe(2);
    expect(status.openHoles).toEqual([]);
    expect(status.excess).toBe(2);
    expect(status.canDeliver).toBe(false);
    expect(status.surplusPlayers).toEqual([M, J]);
  });

  it('Utslag 5 (shamble), minimum 4', () => {
    const status = teeShotStatus(input(4, SHAMBLE_7));
    expect(countsOf(input(4, SHAMBLE_7))).toEqual({ [M]: 2, [J]: 2, [S]: 2, [P]: 1 });
    expect(status.openHoles).toHaveLength(11);
    expect(status.totalShort).toBe(9);
    expect(status.short.map((p) => [p.userId, p.missing])).toEqual([
      [P, 3],
      [M, 2],
      [J, 2],
      [S, 2],
    ]);
    expect(status.excess).toBe(-2);
  });

  it('Utslag 5 picks with minimum 3 give shortfall 5 and excess -6 (not the artboard)', () => {
    const status = teeShotStatus(input(3, SHAMBLE_7));
    expect(status.totalShort).toBe(5);
    expect(status.excess).toBe(-6);
  });

  it('a hole without a pick mid-round counts as open', () => {
    const status = teeShotStatus(input(4, [M, null, J, S]));
    expect(status.openHoles.slice(0, 2)).toEqual([2, 5]);
    expect(status.openHoles).toHaveLength(15);
  });

  it('a hole that was skipped (no row) counts as open', () => {
    const status = teeShotStatus({
      minimum: 4,
      memberIds: TEAM,
      picks: [
        { holeNumber: 1, teeShotBy: M },
        { holeNumber: 3, teeShotBy: J },
      ],
    });
    expect(status.openHoles[0]).toBe(2);
    expect(status.openHoles).toHaveLength(16);
  });

  it('a pick on someone no longer on the team fills the hole without credit', () => {
    const status = teeShotStatus(input(4, ['gone', M], [M, J]));
    expect(status.players.map((p) => [p.userId, p.count])).toEqual([
      [M, 1],
      [J, 0],
    ]);
    expect(status.openHoles).toHaveLength(16);
    expect(status.totalShort).toBe(7);
  });

  it('a team that has all it needs can deliver', () => {
    const owners = [M, M, M, M, J, J, J, J, S, S, S, S, P, P, P, P, M, J];
    const status = teeShotStatus(input(4, owners));
    expect(status.totalShort).toBe(0);
    expect(status.canDeliver).toBe(true);
    expect(status.short).toEqual([]);
  });

  it('ties in shortfall keep the team order', () => {
    const status = teeShotStatus(input(4, [M, M, P, P]));
    expect(status.short.map((p) => p.userId)).toEqual([J, S, M, P]);
  });
});

describe('isTeeShotChangeAllowed / selectableOnHole', () => {
  it('Utslag 2: with holes to spare, any pick goes', () => {
    const i = input(4, HULL_7);
    expect(selectableOnHole(teeShotStatus(i), i, 8, 'none')).toEqual(TEAM);
    // Swapping Marte for Jonas on hole 7 still leaves two free holes.
    expect(isTeeShotChangeAllowed(teeShotStatus(i), i, 7, J, 'none')).toBe(true);
  });

  it('Utslag 2b: only Sigrid and Per can take hole 16', () => {
    const i = input(4, HULL_16);
    const status = teeShotStatus(i);
    expect(selectableOnHole(status, i, 16, 'none')).toEqual([S, P]);
    expect(isTeeShotChangeAllowed(status, i, 16, M, 'none')).toBe(false);
    expect(isTeeShotChangeAllowed(status, i, 16, J, 'none')).toBe(false);
  });

  describe('Utslag 3: all 18 holes chosen, Per short by 2', () => {
    const i = input(4, LEVERING);
    const status = teeShotStatus(i);

    it('Marte → Per is allowed', () => {
      expect(isTeeShotChangeAllowed(status, i, 2, P, 'none')).toBe(true);
    });

    it('Jonas → Per is allowed (shortfall 2 → 1)', () => {
      expect(isTeeShotChangeAllowed(status, i, 4, P, 'none')).toBe(true);
    });

    it('Sigrid → Per is refused (Sigrid falls to 3, shortfall stays 2)', () => {
      expect(isTeeShotChangeAllowed(status, i, 1, P, 'none')).toBe(false);
    });

    it('Marte → Jonas is refused', () => {
      expect(isTeeShotChangeAllowed(status, i, 2, J, 'none')).toBe(false);
    });

    it('clearing a Marte hole, then picking Per there, are both allowed', () => {
      expect(isTeeShotChangeAllowed(status, i, 2, null, 'none')).toBe(true);
      const cleared = { ...i, picks: i.picks.map((p) => (p.holeNumber === 2 ? { ...p, teeShotBy: null } : p)) };
      expect(isTeeShotChangeAllowed(teeShotStatus(cleared), cleared, 2, P, 'none')).toBe(true);
    });
  });

  it('a team already short: one open hole, Per short by 2, only Per can be picked', () => {
    // Marte 6, Jonas 5, Sigrid 4, Per 2 on holes 1–17.
    const owners = [M, M, M, M, M, M, J, J, J, J, J, S, S, S, S, P, P];
    const i = input(4, owners);
    const status = teeShotStatus(i);
    expect(status.openHoles).toEqual([18]);
    expect(status.excess).toBe(1);
    expect(selectableOnHole(status, i, 18, 'none')).toEqual([P]);
    // On a chosen hole only a swap from someone above the minimum to Per goes.
    expect(selectableOnHole(status, i, 1, 'none')).toEqual([M, P]);
    expect(selectableOnHole(status, i, 12, 'none')).toEqual([S]);
  });

  // Shamble after the first delivery. The same case stands in
  // supabase/tests/team_tee_shots_test.sql for set_team_tee_shot_if_newer
  // (trap 4): minimum 3, one of four cards delivered after hole 16, all on 3 or
  // more. Marte 5, Jonas 4, Sigrid 4, Per 3; hole 3 is Per's.
  describe('shamble after the first delivery', () => {
    const owners = [M, J, P, S, M, J, P, S, M, J, P, S, M, J, S, M];
    const i = input(3, owners);
    const status = teeShotStatus(i);

    it('starts with nobody short', () => {
      expect(status.totalShort).toBe(0);
    });

    it("'partial' accepts a pick on hole 17 that keeps the count", () => {
      expect(isTeeShotChangeAllowed(status, i, 17, M, 'partial')).toBe(true);
    });

    it("'partial' refuses a swap on hole 3 that puts Per on 2", () => {
      expect(isTeeShotChangeAllowed(status, i, 3, J, 'partial')).toBe(false);
    });

    it("'partial' refuses clearing a hole that puts Per under 3", () => {
      expect(isTeeShotChangeAllowed(status, i, 3, null, 'partial')).toBe(false);
    });

    it("'none' accepts the same swap on hole 3 (the difference is the delivery)", () => {
      expect(isTeeShotChangeAllowed(status, i, 3, J, 'none')).toBe(true);
    });

    it("'all' refuses everything, clearing too", () => {
      expect(isTeeShotChangeAllowed(status, i, 17, M, 'all')).toBe(false);
      expect(isTeeShotChangeAllowed(status, i, 1, null, 'all')).toBe(false);
      expect(selectableOnHole(status, i, 17, 'all')).toEqual([]);
    });

    it("'partial' lets only picks that keep everyone on 3 or more be chosen", () => {
      expect(selectableOnHole(status, i, 17, 'partial')).toEqual(TEAM);
      // Hole 3 is Per's third: neither clearing it nor a swap keeps him on 3.
      expect(selectableOnHole(status, i, 3, 'partial')).toEqual([]);
    });
  });

  it('a swap to someone who is short is allowed after a team change', () => {
    // Hole 1 was Kari's, who has left the team; Per is short.
    const i = input(4, ['kari', M, M, M, M, J, J, J, J, S, S, S, S, P, P, P, M, J]);
    const status = teeShotStatus(i);
    expect(status.totalShort).toBe(1);
    expect(isTeeShotChangeAllowed(status, i, 1, P, 'none')).toBe(true);
  });
});

describe('teamTeeShotDelivery', () => {
  const at = '2026-10-14T12:00:00Z';
  const member = (userId: string, submittedAt: string | null, withdrawnAt: string | null = null) => ({
    userId,
    submittedAt,
    withdrawnAt,
  });

  it('scramble: one delivered member means the team card is in', () => {
    expect(teamTeeShotDelivery('texas_scramble', [member(M, at), member(J, null)])).toBe('all');
    expect(teamTeeShotDelivery('ambrose', [member(M, null), member(J, null)])).toBe('none');
  });

  it.each([
    [0, 'none'],
    [1, 'partial'],
    [4, 'all'],
  ] as const)('shamble with %i of 4 delivered → %s', (delivered, expected) => {
    const members = TEAM.map((id, idx) => member(id, idx < delivered ? at : null));
    expect(teamTeeShotDelivery('shamble', members)).toBe(expected);
  });

  it('a withdrawn member does not count', () => {
    const members = [member(M, at), member(J, at), member(S, at), member(P, null, at)];
    expect(teamTeeShotDelivery('shamble', members)).toBe('all');
    expect(teamTeeShotDelivery('texas_scramble', [member(M, null), member(J, at, at)])).toBe('none');
  });
});

describe('teeShotHoleLine', () => {
  it('Utslag 2: the free-choice line, biggest shortfall first', () => {
    const line = teeShotHoleLine(teeShotStatus(input(4, HULL_7)), 'none');
    expect(line).toEqual({
      kind: 'free',
      short: [
        { userId: P, count: 0, missing: 4 },
        { userId: J, count: 1, missing: 3 },
        { userId: S, count: 2, missing: 2 },
      ],
      othersEach: null,
      freeHoles: 2,
    });
  });

  it('Utslag 2b: the lock line names the short in team order', () => {
    expect(teeShotHoleLine(teeShotStatus(input(4, HULL_16)), 'none')).toEqual({
      kind: 'locked',
      names: [S, P],
      holesLeft: 3,
    });
  });

  it('Utslag 5: the short form «Per mangler 3, de andre 2 hver»', () => {
    const line = teeShotHoleLine(teeShotStatus(input(4, SHAMBLE_7)), 'none');
    expect(line).toMatchObject({ kind: 'free', othersEach: 2, freeHoles: 2 });
    expect(line.kind === 'free' && line.short[0].userId).toBe(P);
  });

  it('two short (one other) does not take the short form', () => {
    // Marte and Sigrid done; Per short by 3, Jonas by 2.
    const owners = [M, M, M, M, S, S, S, S, J, J, P];
    const line = teeShotHoleLine(teeShotStatus(input(4, owners)), 'none');
    expect(line).toMatchObject({ kind: 'free', othersEach: null });
  });

  it('three others where one is short by 1 and two by 2 list everyone', () => {
    // Marte 3, Jonas 2, Sigrid 2, Per 1.
    const owners = [M, M, M, J, J, S, S, P];
    const line = teeShotHoleLine(teeShotStatus(input(4, owners)), 'none');
    expect(line).toMatchObject({ kind: 'free', othersEach: null });
    expect(line.kind === 'free' && line.short.map((p) => p.userId)).toEqual([P, J, S, M]);
  });

  it('a team already short gets the swap line with the surplus players', () => {
    const owners = [M, M, M, M, M, M, J, J, J, J, J, S, S, S, S, P, P];
    expect(teeShotHoleLine(teeShotStatus(input(4, owners)), 'none')).toEqual({
      kind: 'teamShort',
      short: [{ userId: P, count: 2, missing: 2 }],
      holesLeft: 1,
      surplus: [M, J],
    });
  });

  it('a team short where only players no longer on it hold the extra holes gets its own line', () => {
    // X has withdrawn (or moved) and is not in memberIds; their picks fill holes
    // but give no credit. Marte, Jonas and Sigrid on 4, Per 2, X 3, one open:
    // nobody active has a hole to give, so «der {surplus} står» would be empty.
    const X = 'withdrawn';
    const owners = [M, M, M, M, J, J, J, J, S, S, S, S, P, P, X, X, X];
    expect(teeShotHoleLine(teeShotStatus(input(4, owners)), 'none')).toEqual({
      kind: 'teamShortGone',
      short: [{ userId: P, count: 2, missing: 2 }],
      holesLeft: 1,
    });
  });

  it("'partial' has its own line, 'all' none", () => {
    const status = teeShotStatus(input(3, HULL_7));
    expect(teeShotHoleLine(status, 'partial')).toEqual({ kind: 'partial' });
    expect(teeShotHoleLine(status, 'all')).toEqual({ kind: 'none' });
  });

  it('nobody short: no line', () => {
    const owners = [M, M, M, M, J, J, J, J, S, S, S, S, P, P, P, P];
    expect(teeShotHoleLine(teeShotStatus(input(4, owners)), 'none')).toEqual({ kind: 'none' });
  });
});

describe('teeShotDeliveryAdvice', () => {
  it('Utslag 3: swap to Per on two holes where Marte or Jonas stand', () => {
    expect(teeShotDeliveryAdvice(teeShotStatus(input(4, LEVERING)))).toEqual({
      kind: 'swap',
      short: [{ userId: P, count: 2, missing: 2 }],
      shortNames: [P],
      holes: 2,
      surplus: [M, J],
    });
  });

  it('every hole chosen and only a player no longer on the team holds extra holes: swapGone', () => {
    const X = 'withdrawn';
    const owners = [M, M, M, M, J, J, J, J, S, S, S, S, P, P, X, X, X, X];
    expect(teeShotDeliveryAdvice(teeShotStatus(input(4, owners)))).toEqual({
      kind: 'swapGone',
      short: [{ userId: P, count: 2, missing: 2 }],
      shortNames: [P],
      holes: 2,
      surplus: [],
    });
  });

  it('open holes left but too few for the shortfall: swap on the holes beyond them, not pickOpen', () => {
    // Marte 7, Jonas 4, Sigrid 4, Per 1, two open: Per short 3, excess 1.
    const owners = [M, M, M, M, M, M, M, J, J, J, J, S, S, S, S, P, null, null];
    expect(teeShotDeliveryAdvice(teeShotStatus(input(4, owners)))).toEqual({
      kind: 'swap',
      short: [{ userId: P, count: 1, missing: 3 }],
      shortNames: [P],
      holes: 1,
      surplus: [M],
    });
  });

  it('open holes left: pick the short there', () => {
    const advice = teeShotDeliveryAdvice(teeShotStatus(input(4, HULL_16)));
    expect(advice).toMatchObject({ kind: 'pickOpen', shortNames: [S, P], holes: 3 });
  });

  it('nobody short: null', () => {
    const owners = [M, M, M, M, J, J, J, J, S, S, S, S, P, P, P, P, M, J];
    expect(teeShotDeliveryAdvice(teeShotStatus(input(4, owners)))).toBeNull();
  });
});
