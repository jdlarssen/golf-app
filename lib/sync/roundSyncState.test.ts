import { describe, it, expect } from 'vitest';
import type { SyncQueueItem, TeeShotQueueItem } from './db';
import { REFUSED_WRITE_ERROR } from './classifyError';
import {
  SETTLE_MS,
  roundSyncState,
  syncCellState,
  syncChipState,
  type RoundSyncState,
} from './roundSyncState';

const NOW = Date.parse('2026-11-11T12:00:00.000Z');
/** Created long enough ago to count as settled on age alone. */
const OLD = new Date(NOW - 60_000).toISOString();
/** Created just now: not settled unless tried or failed. */
const FRESH = new Date(NOW).toISOString();

function score(scoreId: string, overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    id: scoreId,
    scoreId,
    attemptCount: 0,
    lastError: null,
    createdAt: OLD,
    ...overrides,
  };
}

function teeShot(teeShotId: string, overrides: Partial<TeeShotQueueItem> = {}): TeeShotQueueItem {
  return {
    id: teeShotId,
    teeShotId,
    attemptCount: 0,
    lastError: null,
    createdAt: OLD,
    ...overrides,
  };
}

const ABANDONED = { abandonedAt: OLD, attemptCount: 6 };
/** A network failure as the app's sync worker records it. */
const NET_ERROR = 'TypeError: Network request failed';
const isNetworkError = (msg: string | null | undefined) =>
  (msg ?? '').toLowerCase().includes('network request failed');

function state(
  scoreItems: SyncQueueItem[],
  teeShotItems: TeeShotQueueItem[] = [],
  nowMs = NOW,
): RoundSyncState {
  return roundSyncState({ scoreItems, teeShotItems, gameId: 'g1', nowMs, isNetworkError });
}

describe('roundSyncState', () => {
  it('empty queues → nothing pending, nothing quarantined', () => {
    expect(state([])).toEqual({
      pendingScoreCount: 0,
      pendingTeeShotCount: 0,
      pendingHoles: [],
      pendingScoreHoles: [],
      settled: false,
      lastErrorIsNetwork: false,
      quarantinedHoles: [],
      quarantineLockedHoles: [],
      quarantineLockedOnly: false,
    });
  });

  it('counts strokes, not holes: three players on one hole are three strokes on one hole', () => {
    const s = state([score('g1:a:7'), score('g1:b:7'), score('g1:c:7'), score('g1:a:8')]);
    expect(s.pendingScoreCount).toBe(4);
    expect(s.pendingHoles).toEqual([7, 8]);
  });

  it('ignores another game, including one whose id is a string prefix of this one', () => {
    const s = state([score('g2:a:3'), score('g10:a:4'), score('g1:a:5')]);
    expect(s.pendingScoreCount).toBe(1);
    expect(s.pendingHoles).toEqual([5]);
  });

  it('keeps quarantine out of pending', () => {
    const s = state([score('g1:a:7', ABANDONED), score('g1:a:8')]);
    expect(s.pendingScoreCount).toBe(1);
    expect(s.pendingHoles).toEqual([8]);
    expect(s.quarantinedHoles).toEqual([7]);
    expect(s.quarantineLockedOnly).toBe(false);
  });

  it('locked quarantine in this game is lockedOnly, and another game does not count', () => {
    const locked = state([
      score('g1:a:7', { ...ABANDONED, lastError: REFUSED_WRITE_ERROR }),
      score('g2:a:3', { ...ABANDONED, lastError: 'something else' }),
    ]);
    expect(locked.quarantinedHoles).toEqual([7]);
    expect(locked.quarantineLockedOnly).toBe(true);

    const mixed = state([
      score('g1:a:7', { ...ABANDONED, lastError: REFUSED_WRITE_ERROR }),
      score('g1:a:8', { ...ABANDONED, lastError: 'server error' }),
    ]);
    expect(mixed.quarantineLockedOnly).toBe(false);
    // Only hole 7 is locked: retyping hole 8 can still help, retyping 7 cannot.
    expect(mixed.quarantineLockedHoles).toEqual([7]);
  });

  it('a hole is locked only when every quarantined item on it is a locked refusal', () => {
    const s = state([
      score('g1:a:7', { ...ABANDONED, lastError: REFUSED_WRITE_ERROR }),
      score('g1:b:7', { ...ABANDONED, lastError: 'server error' }),
      score('g1:a:9', { ...ABANDONED, lastError: REFUSED_WRITE_ERROR }),
      score('g2:a:3', { ...ABANDONED, lastError: REFUSED_WRITE_ERROR }),
    ]);
    expect(s.quarantinedHoles).toEqual([7, 9]);
    expect(s.quarantineLockedHoles).toEqual([9]);
  });

  it('a malformed key in this game counts as a stroke but names no hole', () => {
    const s = state([score('g1:a:x'), score('g1:a:4')]);
    expect(s.pendingScoreCount).toBe(2);
    expect(s.pendingHoles).toEqual([4]);
  });

  it.each([
    ['fresh, untried, no error', { createdAt: FRESH }, false],
    ['2999 ms old', { createdAt: new Date(NOW - (SETTLE_MS - 1)).toISOString() }, false],
    ['3000 ms old', { createdAt: new Date(NOW - SETTLE_MS).toISOString() }, true],
    ['fresh but tried once', { createdAt: FRESH, attemptCount: 1 }, true],
    ['fresh but failed', { createdAt: FRESH, lastError: NET_ERROR }, true],
  ])('settled: %s → %s', (_label, overrides, expected) => {
    expect(state([score('g1:a:1', overrides)]).settled).toBe(expected);
  });

  it('a quarantined item never settles the active set', () => {
    expect(state([score('g1:a:1', ABANDONED)]).settled).toBe(false);
  });

  it('tee shots without strokes: the hole is pending, but no strokes are counted', () => {
    const s = state([], [teeShot('g1:1:9')]);
    expect(s.pendingScoreCount).toBe(0);
    expect(s.pendingTeeShotCount).toBe(1);
    expect(s.pendingHoles).toEqual([9]);
    expect(s.settled).toBe(true);
  });

  it('a stroke and a tee shot on the same hole name the hole once', () => {
    expect(state([score('g1:a:9')], [teeShot('g1:1:9')]).pendingHoles).toEqual([9]);
  });

  it('pendingScoreHoles names only holes with a waiting stroke, never a tee-shot-only hole', () => {
    const s = state([score('g1:a:7')], [teeShot('g1:1:9')]);
    expect(s.pendingHoles).toEqual([7, 9]);
    expect(s.pendingScoreHoles).toEqual([7]);
  });

  it.each([
    ['network error', [NET_ERROR], true],
    ['other error', ['JWT expired'], false],
    ['no error', [null], false],
    ['latest error decides: network then auth', [NET_ERROR, 'JWT expired'], false],
    ['latest error decides: auth then network', ['JWT expired', NET_ERROR], true],
  ])('lastErrorIsNetwork: %s', (_label, errors, expected) => {
    const items = errors.map((lastError, i) =>
      score(`g1:a:${i + 1}`, { lastError, createdAt: new Date(NOW - 60_000 + i).toISOString() }),
    );
    expect(state(items).lastErrorIsNetwork).toBe(expected);
  });
});

describe('syncChipState', () => {
  it.each([
    ['nothing at all', [], [], 'saved'],
    ['pending but not settled (good network, just tapped)', [score('g1:a:1', { createdAt: FRESH })], [], 'saved'],
    ['pending and settled', [score('g1:a:1')], [], 'pending'],
    ['only a tee shot, settled', [], [teeShot('g1:1:1')], 'pending'],
    ['quarantine wins over pending', [score('g1:a:1', ABANDONED), score('g1:a:2')], [], 'quarantined'],
  ] as const)('%s → %s', (_label, scores, tees, expected) => {
    expect(syncChipState(state([...scores], [...tees]))).toBe(expected);
  });
});

describe('syncCellState', () => {
  const s = state([score('g1:a:7', ABANDONED), score('g1:a:8'), score('g1:b:7')]);
  const scored = new Set([1, 7, 8]);

  it.each([
    [7, 'quarantined'], // quarantined and pending: quarantine wins
    [8, 'pending'],
    [1, 'sent'],
    [2, 'empty'],
  ] as const)('hole %i → %s', (hole, expected) => {
    expect(syncCellState(hole, s, scored)).toBe(expected);
  });

  it('a pending hole without a local score is still pending (a cleared score waiting)', () => {
    expect(syncCellState(8, s, new Set())).toBe('pending');
  });
});
