import { describe, expect, it } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import {
  readySettingsRows,
  showsHandicapSetting,
  type ReadySettingsInput,
} from './readySettingsRules';

// Type A (docs/test-discipline.md): the INNSTILLINGER rows on step 5 (#2457).
// The rules pin which rows show for which format and which value each carries;
// the wording lives in the component.

const BASE: ReadySettingsInput = {
  gameMode: 'stableford',
  teamSize: 1,
  hcpAllowance: 100,
  fourballAllowancePct: 85,
  foursomesAllowancePct: 50,
  greensomeAllowancePct: 100,
  chapmanAllowancePct: 100,
  gruesomeAllowancePct: 50,
  roundRobinAllowancePct: 85,
  texasHandicapPct: 25,
  ambroseHandicapPct: 25,
  floridaHandicapPct: 25,
  entryFeeKr: '',
  scoreVisibility: 'live',
  requirePeerApproval: false,
  sideEnabled: false,
  prizeCount: 0,
};

function row(input: Partial<ReadySettingsInput>, key: string) {
  const found = readySettingsRows({ ...BASE, ...input }).find((r) => r.key === key);
  if (!found) throw new Error(`no row ${key}`);
  return found;
}

const ALL_MODES: Record<GameMode, boolean> = {
  best_ball: true,
  stableford: true,
  modified_stableford: true,
  singles_matchplay: true,
  solo_strokeplay: true,
  texas_scramble: true,
  ambrose: true,
  florida_scramble: true,
  fourball_matchplay: true,
  foursomes_matchplay: true,
  greensome_matchplay: true,
  chapman_matchplay: true,
  gruesome_matchplay: true,
  round_robin: true,
  // The formats without a handicap field on step 5.
  wolf: false,
  nassau: false,
  skins: false,
  bingo_bango_bongo: false,
  nines: false,
  acey_deucey: false,
  patsome: false,
  shamble: false,
};

describe('readySettingsRows — order and visibility', () => {
  it('gives the four rows in fixed order', () => {
    expect(readySettingsRows(BASE).map((r) => r.key)).toEqual([
      'handicap',
      'fee',
      'duringRound',
      'sideAndPrizes',
    ]);
  });

  it.each(Object.entries(ALL_MODES) as [GameMode, boolean][])(
    '%s: handicap row visible = %s',
    (gameMode, visible) => {
      expect(showsHandicapSetting(gameMode)).toBe(visible);
      expect(row({ gameMode }, 'handicap').visible).toBe(visible);
    },
  );

  it('keeps the other three rows visible for every format', () => {
    for (const gameMode of Object.keys(ALL_MODES) as GameMode[]) {
      const rows = readySettingsRows({ ...BASE, gameMode });
      expect(rows.filter((r) => r.key !== 'handicap').every((r) => r.visible)).toBe(true);
    }
  });
});

describe('readySettingsRows — handicap value', () => {
  it('names the general percentage as net', () => {
    expect(row({ hcpAllowance: 85 }, 'handicap').value).toEqual({ kind: 'net', pct: 85 });
  });

  it('names 0 as gross', () => {
    expect(row({ hcpAllowance: 0 }, 'handicap').value).toEqual({ kind: 'gross' });
  });

  it.each<[GameMode, Partial<ReadySettingsInput>, number]>([
    ['fourball_matchplay', { fourballAllowancePct: 90 }, 90],
    ['foursomes_matchplay', { foursomesAllowancePct: 40 }, 40],
    ['greensome_matchplay', { greensomeAllowancePct: 70 }, 70],
    ['chapman_matchplay', { chapmanAllowancePct: 60 }, 60],
    ['gruesome_matchplay', { gruesomeAllowancePct: 30 }, 30],
    ['round_robin', { roundRobinAllowancePct: 80 }, 80],
  ])('%s reads its own percentage, not the general one', (gameMode, own, pct) => {
    expect(row({ gameMode, hcpAllowance: 100, ...own }, 'handicap').value).toEqual({
      kind: 'net',
      pct,
    });
  });

  it('names a matchplay variant at 0 as gross', () => {
    expect(
      row({ gameMode: 'fourball_matchplay', fourballAllowancePct: 0 }, 'handicap').value,
    ).toEqual({ kind: 'gross' });
  });

  it.each<[GameMode, Partial<ReadySettingsInput>]>([
    ['texas_scramble', { texasHandicapPct: 25 }],
    ['ambrose', { ambroseHandicapPct: 25 }],
    ['florida_scramble', { floridaHandicapPct: 25 }],
  ])('%s turns the stored sum percentage into percent of the team average', (gameMode, own) => {
    // 25 % of the sum for four players = 100 % of the average.
    expect(row({ gameMode, teamSize: 4, ...own }, 'handicap').value).toEqual({
      kind: 'teamAverage',
      pct: 100,
    });
  });

  it('follows the team size for the scramble percentage', () => {
    expect(
      row({ gameMode: 'texas_scramble', teamSize: 2, texasHandicapPct: 20 }, 'handicap').value,
    ).toEqual({ kind: 'teamAverage', pct: 40 });
  });

  it('names a scramble at 0 as gross', () => {
    expect(
      row({ gameMode: 'texas_scramble', teamSize: 4, texasHandicapPct: 0 }, 'handicap').value,
    ).toEqual({ kind: 'gross' });
  });
});

describe('readySettingsRows — fee', () => {
  it.each(['', '0', '   ', 'abc', '-5'])('«%s» is no fee', (entryFeeKr) => {
    expect(row({ entryFeeKr }, 'fee').value).toEqual({ kind: 'none' });
  });

  it('names the amount', () => {
    expect(row({ entryFeeKr: '200' }, 'fee').value).toEqual({ kind: 'amount', kr: 200 });
  });
});

describe('readySettingsRows — during the round', () => {
  it.each<['live' | 'reveal', boolean]>([
    ['live', false],
    ['live', true],
    ['reveal', false],
    ['reveal', true],
  ])('visibility %s × peer approval %s', (scoreVisibility, requirePeerApproval) => {
    expect(row({ scoreVisibility, requirePeerApproval }, 'duringRound').value).toEqual({
      visibility: scoreVisibility,
      peerApproval: requirePeerApproval,
    });
  });
});

describe('readySettingsRows — side tournament and prizes', () => {
  it.each([
    [false, 0],
    [true, 0],
    [true, 2],
    [false, 1],
  ])('side %s × %s prizes', (sideEnabled, prizeCount) => {
    expect(row({ sideEnabled, prizeCount }, 'sideAndPrizes').value).toEqual({
      sideEnabled,
      prizeCount,
    });
  });
});
