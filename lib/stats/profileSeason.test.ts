import { describe, it, expect } from 'vitest';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import {
  computeProfileSeason,
  type ProfileSeasonRound,
} from './profileSeason';

const round = (
  year: number | null,
  completeBrutto: number | null,
  resultSummary: ResultSummary | null = null,
): ProfileSeasonRound => ({ year, completeBrutto, resultSummary });

const WON_PLACEMENT: ResultSummary = { kind: 'placement', rank: 1, fieldSize: 8, isTeam: false };
const LOST_PLACEMENT: ResultSummary = { kind: 'placement', rank: 3, fieldSize: 8, isTeam: false };
const WON_MATCH: ResultSummary = { kind: 'matchplay', outcome: 'win', margin: '3&2' };
const HALVED_MATCH: ResultSummary = { kind: 'matchplay', outcome: 'tie', margin: null };
const WON_SKINS: ResultSummary = { kind: 'skins', skins: 5, rank: 1, fieldSize: 4 };
const LOST_SKINS: ResultSummary = { kind: 'skins', skins: 1, rank: 3, fieldSize: 4 };

describe('computeProfileSeason', () => {
  it('gives an empty season when there are no rounds', () => {
    expect(computeProfileSeason([], 2026)).toEqual({ rounds: 0, bestRound: null, wins: 0 });
  });

  it('counts only the requested year', () => {
    const out = computeProfileSeason(
      [round(2025, 70, WON_PLACEMENT), round(2026, 88), round(2026, 84), round(2027, 72)],
      2026,
    );
    expect(out).toEqual({ rounds: 2, bestRound: 84, wins: 0 });
  });

  it('skips undated rounds', () => {
    expect(computeProfileSeason([round(null, 70, WON_PLACEMENT), round(2026, 90)], 2026)).toEqual({
      rounds: 1,
      bestRound: 90,
      wins: 0,
    });
  });

  it('counts an incomplete round as a round but never as the best round', () => {
    // A 9-hole round, a 17-stroke round and a team-ball round all arrive with
    // `completeBrutto = null` from the caller.
    expect(
      computeProfileSeason([round(2026, null), round(2026, null), round(2026, 95)], 2026),
    ).toEqual({ rounds: 3, bestRound: 95, wins: 0 });
  });

  it('has no best round when no round in the year is complete', () => {
    expect(computeProfileSeason([round(2026, null)], 2026).bestRound).toBeNull();
  });

  it('keeps a tied best round', () => {
    expect(computeProfileSeason([round(2026, 81), round(2026, 81)], 2026).bestRound).toBe(81);
  });

  it.each([
    ['placement 1', WON_PLACEMENT, 1],
    ['placement 3', LOST_PLACEMENT, 0],
    ['won matchplay', WON_MATCH, 1],
    ['halved matchplay', HALVED_MATCH, 0],
    ['most skins', WON_SKINS, 1],
    ['fewer skins', LOST_SKINS, 0],
    ['no stored result', null, 0],
  ] as const)('counts %s as %i wins', (_label, summary, wins) => {
    expect(computeProfileSeason([round(2026, null, summary)], 2026).wins).toBe(wins);
  });

  it('adds up wins across formats in the year only', () => {
    expect(
      computeProfileSeason(
        [
          round(2026, 80, WON_PLACEMENT),
          round(2026, null, WON_MATCH),
          round(2026, null, WON_SKINS),
          round(2025, 78, WON_PLACEMENT),
          round(null, null, WON_MATCH),
        ],
        2026,
      ).wins,
    ).toBe(3);
  });
});
