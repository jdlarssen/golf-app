import { describe, it, expect } from 'vitest';
import type { SyncQueueItem } from './db';
import { summarizeQuarantine, formatHoleList } from './quarantineSummary';

function qItem(
  overrides: Partial<SyncQueueItem> & { scoreId: string },
): SyncQueueItem {
  return {
    id: overrides.scoreId,
    attemptCount: 6,
    lastError: null,
    createdAt: '2026-08-13T10:00:00.000Z',
    abandonedAt: '2026-08-13T10:05:00.000Z',
    ...overrides,
  };
}

describe('summarizeQuarantine', () => {
  it('empty queue → empty summary', () => {
    const s = summarizeQuarantine([], 'g1');
    expect(s.currentGame).toBeNull();
    expect(s.otherGames).toEqual([]);
    expect(s.unparsedCount).toBe(0);
    expect(s.totalCount).toBe(0);
    expect(s.errors).toEqual([]);
  });

  it('active items (abandonedAt null/undefined) are excluded', () => {
    const s = summarizeQuarantine(
      [
        qItem({ scoreId: 'g1:u1:3', abandonedAt: null }),
        qItem({ scoreId: 'g1:u1:4', abandonedAt: undefined }),
        qItem({ scoreId: 'g1:u1:7' }),
      ],
      'g1',
    );
    expect(s.totalCount).toBe(1);
    expect(s.currentGame).toEqual({ gameId: 'g1', holes: [7], count: 1 });
  });

  it('single quarantined item in the current game', () => {
    const s = summarizeQuarantine(
      [qItem({ scoreId: 'g1:u1:7', lastError: 'RLS: permission denied' })],
      'g1',
    );
    expect(s.currentGame).toEqual({ gameId: 'g1', holes: [7], count: 1 });
    expect(s.otherGames).toEqual([]);
    expect(s.errors).toEqual(['RLS: permission denied']);
  });

  it('splits current game from other games; others sorted by gameId', () => {
    const s = summarizeQuarantine(
      [
        qItem({ scoreId: 'gB:u1:2' }),
        qItem({ scoreId: 'g1:u1:12' }),
        qItem({ scoreId: 'gA:u1:5' }),
        qItem({ scoreId: 'g1:u1:7' }),
        qItem({ scoreId: 'gA:u1:9' }),
      ],
      'g1',
    );
    expect(s.currentGame).toEqual({ gameId: 'g1', holes: [7, 12], count: 2 });
    expect(s.otherGames).toEqual([
      { gameId: 'gA', holes: [5, 9], count: 2 },
      { gameId: 'gB', holes: [2], count: 1 },
    ]);
    expect(s.totalCount).toBe(5);
  });

  it('holes are sorted ascending and deduped (defensive)', () => {
    const s = summarizeQuarantine(
      [
        qItem({ scoreId: 'g1:u1:18' }),
        qItem({ scoreId: 'g1:u2:18' }),
        qItem({ scoreId: 'g1:u1:1' }),
      ],
      'g1',
    );
    expect(s.currentGame).toEqual({ gameId: 'g1', holes: [1, 18], count: 3 });
  });

  it.each([
    ['missing parts', 'g1:3'],
    ['non-numeric hole', 'g1:u1:abc'],
    ['fractional hole', 'g1:u1:3.5'],
    ['zero hole', 'g1:u1:0'],
    ['negative hole', 'g1:u1:-2'],
    ['empty gameId', ':u1:3'],
    ['empty userId', 'g1::3'],
    ['too many parts', 'g1:u1:3:extra'],
  ])('malformed scoreId (%s) counts but is not grouped', (_label, scoreId) => {
    const s = summarizeQuarantine([qItem({ scoreId })], 'g1');
    expect(s.currentGame).toBeNull();
    expect(s.otherGames).toEqual([]);
    expect(s.unparsedCount).toBe(1);
    expect(s.totalCount).toBe(1);
  });

  it('currentGameId null → every group lands in otherGames', () => {
    const s = summarizeQuarantine(
      [qItem({ scoreId: 'g1:u1:7' }), qItem({ scoreId: 'g2:u1:3' })],
      null,
    );
    expect(s.currentGame).toBeNull();
    expect(s.otherGames.map((g) => g.gameId)).toEqual(['g1', 'g2']);
  });

  it('errors are distinct, non-empty, in queue order — across all games', () => {
    const s = summarizeQuarantine(
      [
        qItem({ scoreId: 'g1:u1:3', lastError: 'boom' }),
        qItem({ scoreId: 'g1:u1:4', lastError: null }),
        qItem({ scoreId: 'g2:u1:5', lastError: 'boom' }),
        qItem({ scoreId: 'g2:u1:6', lastError: 'other failure' }),
        qItem({ scoreId: 'bad-id', lastError: 'from unparsed' }),
      ],
      'g1',
    );
    expect(s.errors).toEqual(['boom', 'other failure', 'from unparsed']);
  });
});

describe('formatHoleList', () => {
  it.each([
    [[7], 'no', '7'],
    [[3, 7], 'no', '3 og 7'],
    [[3, 7, 12], 'no', '3, 7 og 12'],
    [[3, 7], 'en', '3 and 7'],
    [[3, 7, 12], 'en', '3, 7, and 12'],
  ])('%j in %s → %s', (holes, locale, expected) => {
    expect(formatHoleList(holes, locale)).toBe(expected);
  });
});
