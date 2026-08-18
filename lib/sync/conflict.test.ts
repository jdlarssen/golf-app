import { describe, it, expect } from 'vitest';
import { conflictRecordFor, resolveConflict } from './conflict';
import type { LocalScore } from './db';

describe('resolveConflict', () => {
  it('returns local-wins when local is newer', () => {
    expect(
      resolveConflict({
        localClientUpdatedAt: '2026-05-11T10:00:01.000Z',
        serverClientUpdatedAt: '2026-05-11T10:00:00.000Z',
      }),
    ).toBe('local-wins');
  });
  it('returns server-wins when server is newer', () => {
    expect(
      resolveConflict({
        localClientUpdatedAt: '2026-05-11T10:00:00.000Z',
        serverClientUpdatedAt: '2026-05-11T10:00:01.000Z',
      }),
    ).toBe('server-wins');
  });
  it('returns equal when timestamps match', () => {
    expect(
      resolveConflict({
        localClientUpdatedAt: '2026-05-11T10:00:00.000Z',
        serverClientUpdatedAt: '2026-05-11T10:00:00.000Z',
      }),
    ).toBe('equal');
  });
});

const ME = 'me-user-id';
const MATE = 'mate-user-id';

/** A local row as it sits in Dexie just before a server value replaces it. */
function localRow(overrides: Partial<LocalScore> = {}): LocalScore {
  const userId = overrides.userId ?? ME;
  return {
    id: `g1:${userId}:7`,
    gameId: 'g1',
    userId,
    holeNumber: 7,
    strokes: 5,
    putts: null,
    enteredBy: overrides.enteredBy ?? userId,
    clientUpdatedAt: '2026-08-18T10:00:00.000Z',
    serverUpdatedAt: null,
    ...overrides,
  };
}

// #1611: the rule that used to live inside drainQueue only. Both the drain and
// the realtime/catch-up merge run it, so it is tested once, here.
describe('conflictRecordFor', () => {
  it('writes a record when a number typed on this device is replaced', () => {
    const record = conflictRecordFor({
      existing: localRow({ strokes: 5 }),
      incomingStrokes: 4,
      currentUserId: ME,
    });

    expect(record).toEqual({
      id: `g1:${ME}:7`,
      gameId: 'g1',
      userId: ME,
      holeNumber: 7,
      localStrokes: 5,
      serverStrokes: 4,
      resolvedAt: expect.any(String),
      forOwnScore: true,
    });
  });

  it('marks a marker-kept row as not-own-score', () => {
    // Marker role: the row belongs to the flight-mate, but I typed it.
    const record = conflictRecordFor({
      existing: localRow({ userId: MATE, enteredBy: ME, strokes: 5 }),
      incomingStrokes: 4,
      currentUserId: ME,
    });

    expect(record).toMatchObject({
      userId: MATE,
      localStrokes: 5,
      serverStrokes: 4,
      forOwnScore: false,
    });
  });

  it.each([
    [
      'strokes are unchanged (a putts-only edit)',
      { existing: localRow({ strokes: 5 }), incomingStrokes: 5, currentUserId: ME },
    ],
    [
      'the row was typed by someone else',
      { existing: localRow({ enteredBy: MATE }), incomingStrokes: 4, currentUserId: ME },
    ],
    [
      'the row came from the hole seed (no known author)',
      { existing: localRow({ enteredBy: '' }), incomingStrokes: 4, currentUserId: ME },
    ],
    [
      'without a session, a marker-kept row cannot be attributed',
      {
        existing: localRow({ userId: MATE, enteredBy: ME }),
        incomingStrokes: 4,
        currentUserId: null,
      },
    ],
  ])('writes no record when %s', (_case, input) => {
    expect(conflictRecordFor(input)).toBeNull();
  });

  it('falls back to the own-row proxy when the session lookup failed', () => {
    const record = conflictRecordFor({
      existing: localRow({ strokes: 5 }),
      incomingStrokes: 4,
      currentUserId: null,
    });

    expect(record).toMatchObject({ localStrokes: 5, serverStrokes: 4, forOwnScore: true });
  });

  it.each([
    ['a cleared number replaced by a value', null, 5],
    ['a value replaced by a cleared number', 5, null],
  ])('counts %s as a change', (_case, local, incoming) => {
    const record = conflictRecordFor({
      existing: localRow({ strokes: local }),
      incomingStrokes: incoming,
      currentUserId: ME,
    });

    expect(record).toMatchObject({ localStrokes: local, serverStrokes: incoming });
  });
});
