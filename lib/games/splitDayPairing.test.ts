import { describe, it, expect } from 'vitest';
import {
  pairSplitDayGames,
  osloDayKey,
  type PairableGame,
} from './splitDayPairing';

/**
 * Type A unit coverage for the split-day pairing rule (#1449). Pure: pairs a
 * player's HOST games sharing a tournament + opposite front9/back9 halves on
 * the same Oslo calendar day. One home for the rule (AGENTS.md trap 4) — both
 * the active Home card and the finished cup-day card build on this.
 */

// Two Oslo-adjacent instants on the same wall-clock day (10:00 and 14:30 CEST
// on 2026-06-12 → 08:00Z and 12:30Z), plus a next-day instant.
const DAY1_MORNING = new Date('2026-06-12T08:00:00Z');
const DAY1_AFTERNOON = new Date('2026-06-12T12:30:00Z');
const DAY2 = new Date('2026-06-13T09:00:00Z');

function g(
  overrides: Partial<PairableGame<string>> & { gameId: string },
): PairableGame<string> {
  return {
    tournamentId: 't1',
    holeSegment: 'front9',
    dayAnchor: DAY1_MORNING,
    data: overrides.gameId,
    ...overrides,
  };
}

describe('osloDayKey', () => {
  it('buckets Oslo-adjacent instants of one wall-clock day under one key', () => {
    expect(osloDayKey(DAY1_MORNING)).toBe(osloDayKey(DAY1_AFTERNOON));
  });

  it('separates different Oslo calendar days', () => {
    expect(osloDayKey(DAY1_MORNING)).not.toBe(osloDayKey(DAY2));
  });

  it('uses the Oslo wall-clock date, not UTC (late-evening UTC rolls into next Oslo day)', () => {
    // 2026-06-12T23:30Z is 2026-06-13 01:30 in Oslo (CEST, +02:00).
    expect(osloDayKey(new Date('2026-06-12T23:30:00Z'))).toBe(osloDayKey(DAY2));
  });
});

describe('pairSplitDayGames', () => {
  it('empty input → empty output', () => {
    expect(pairSplitDayGames([])).toEqual([]);
  });

  it('a single full-segment game → one single entry (unchanged, never paired)', () => {
    const entries = pairSplitDayGames([
      g({ gameId: 'a', holeSegment: 'full' }),
    ]);
    expect(entries).toEqual([{ kind: 'single', game: expect.objectContaining({ gameId: 'a' }) }]);
  });

  it('a non-cup half (tournamentId null) → single (only cup halves pair)', () => {
    const entries = pairSplitDayGames([
      g({ gameId: 'a', holeSegment: 'front9', tournamentId: null }),
    ]);
    expect(entries.map((e) => e.kind)).toEqual(['single']);
  });

  it('front9 + back9, same tournament + same Oslo day → one pair', () => {
    const entries = pairSplitDayGames([
      g({ gameId: 'f', holeSegment: 'front9', dayAnchor: DAY1_MORNING }),
      g({ gameId: 'b', holeSegment: 'back9', dayAnchor: DAY1_AFTERNOON }),
    ]);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.kind).toBe('pair');
    if (entry.kind === 'pair') {
      expect(entry.tournamentId).toBe('t1');
      expect(entry.front9.gameId).toBe('f');
      expect(entry.back9.gameId).toBe('b');
    }
  });

  it('roles are resolved by segment, not input order (back9 listed first)', () => {
    const entries = pairSplitDayGames([
      g({ gameId: 'b', holeSegment: 'back9' }),
      g({ gameId: 'f', holeSegment: 'front9' }),
    ]);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.kind).toBe('pair');
    if (entry.kind === 'pair') {
      expect(entry.front9.gameId).toBe('f');
      expect(entry.back9.gameId).toBe('b');
    }
  });

  it('an unpairable half (no opposite sibling) → degrades to a single, never hidden', () => {
    const entries = pairSplitDayGames([
      g({ gameId: 'f', holeSegment: 'front9' }),
    ]);
    expect(entries).toEqual([
      { kind: 'single', game: expect.objectContaining({ gameId: 'f' }) },
    ]);
  });

  it('two halves in the SAME cup on DIFFERENT days → two singles, not a cross-day pair', () => {
    const entries = pairSplitDayGames([
      g({ gameId: 'f', holeSegment: 'front9', dayAnchor: DAY1_MORNING }),
      g({ gameId: 'b', holeSegment: 'back9', dayAnchor: DAY2 }),
    ]);
    expect(entries.map((e) => e.kind)).toEqual(['single', 'single']);
  });

  it('boundary: two split days in one cup → two pairs, one per day', () => {
    const entries = pairSplitDayGames([
      g({ gameId: 'f1', holeSegment: 'front9', dayAnchor: DAY1_MORNING }),
      g({ gameId: 'b1', holeSegment: 'back9', dayAnchor: DAY1_AFTERNOON }),
      g({ gameId: 'f2', holeSegment: 'front9', dayAnchor: DAY2 }),
      g({ gameId: 'b2', holeSegment: 'back9', dayAnchor: DAY2 }),
    ]);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.kind === 'pair')).toBe(true);
    const ids = entries.flatMap((e) =>
      e.kind === 'pair' ? [e.front9.gameId, e.back9.gameId] : [],
    );
    expect(ids).toEqual(['f1', 'b1', 'f2', 'b2']);
  });

  it('duplicate halves in one bucket (two front9) → no ambiguous pair, all singles', () => {
    const entries = pairSplitDayGames([
      g({ gameId: 'f1', holeSegment: 'front9' }),
      g({ gameId: 'f2', holeSegment: 'front9' }),
      g({ gameId: 'b', holeSegment: 'back9' }),
    ]);
    expect(entries.map((e) => e.kind)).toEqual(['single', 'single', 'single']);
  });

  it('withdrawn from one half (pairEligible: false) → the halves do not merge; both are singles', () => {
    const entries = pairSplitDayGames([
      g({ gameId: 'f', holeSegment: 'front9' }),
      g({ gameId: 'b', holeSegment: 'back9', pairEligible: false }),
    ]);
    expect(entries.map((e) => e.kind)).toEqual(['single', 'single']);
  });

  it('preserves input order, anchoring the pair at its first-seen half', () => {
    const entries = pairSplitDayGames([
      g({ gameId: 'full', holeSegment: 'full' }),
      g({ gameId: 'f', holeSegment: 'front9' }),
      g({ gameId: 'b', holeSegment: 'back9' }),
      g({ gameId: 'normal', holeSegment: 'full', tournamentId: null }),
    ]);
    expect(entries.map((e) => (e.kind === 'pair' ? 'pair' : e.game.gameId))).toEqual([
      'full',
      'pair',
      'normal',
    ]);
  });

  it('a null dayAnchor half cannot bucket → single (defensive)', () => {
    const entries = pairSplitDayGames([
      g({ gameId: 'f', holeSegment: 'front9', dayAnchor: null }),
      g({ gameId: 'b', holeSegment: 'back9' }),
    ]);
    expect(entries.map((e) => e.kind)).toEqual(['single', 'single']);
  });
});
