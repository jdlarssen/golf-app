import { describe, it, expect } from 'vitest';
import { fromTeeShotRow, nextTeeShotStamp, serverTeeShotWins } from './teeShotRow';

// Type A (#2580): the rules the web (Dexie) and the app (SQLite) share.
describe('serverTeeShotWins', () => {
  const at = (clientUpdatedAt: string) => ({ clientUpdatedAt });

  it('a row still in the queue is never overwritten', () => {
    expect(serverTeeShotWins(at('2026-10-15T10:00:00.000Z'), at('2026-10-15T11:00:00.000Z'), true)).toBe(false);
    expect(serverTeeShotWins(undefined, at('2026-10-15T11:00:00.000Z'), true)).toBe(false);
  });

  it('with nothing stored, the server row is taken', () => {
    expect(serverTeeShotWins(undefined, at('2026-10-15T10:00:00.000Z'), false)).toBe(true);
    expect(serverTeeShotWins(null, at('2026-10-15T10:00:00.000Z'), false)).toBe(true);
  });

  it('last write wins: only a strictly newer server stamp replaces the local row', () => {
    const local = at('2026-10-15T10:00:00.000Z');
    expect(serverTeeShotWins(local, at('2026-10-15T10:00:00.001Z'), false)).toBe(true);
    expect(serverTeeShotWins(local, at('2026-10-15T10:00:00.000Z'), false)).toBe(false);
    expect(serverTeeShotWins(local, at('2026-10-15T09:59:59.999Z'), false)).toBe(false);
  });

  it('compares instants, not text (#2211: the server echoes +00:00)', () => {
    // As text "…000+00:00" sorts before "…000Z", but they are the same instant.
    expect(serverTeeShotWins(at('2026-10-15T10:00:00.000Z'), at('2026-10-15T10:00:00.000+00:00'), false)).toBe(false);
    expect(serverTeeShotWins(at('2026-10-15T10:00:00.000Z'), at('2026-10-15T12:00:00.001+02:00'), false)).toBe(true);
  });
});

describe('nextTeeShotStamp', () => {
  const NOW = '2026-10-15T10:00:00.000Z';

  it('takes the clock when nothing is stored, or the stored stamp is behind it', () => {
    expect(nextTeeShotStamp(undefined, NOW)).toBe(NOW);
    expect(nextTeeShotStamp(null, NOW)).toBe(NOW);
    expect(nextTeeShotStamp('2026-10-15T09:00:00.000Z', NOW)).toBe(NOW);
  });

  it('goes 1 ms past a stored stamp that is not behind the clock', () => {
    expect(nextTeeShotStamp(NOW, NOW)).toBe('2026-10-15T10:00:00.001Z');
    expect(nextTeeShotStamp('2026-10-15T10:00:05.000Z', NOW)).toBe('2026-10-15T10:00:05.001Z');
    expect(nextTeeShotStamp('2026-10-15T10:00:00.000+00:00', NOW)).toBe('2026-10-15T10:00:00.001Z');
  });
});

describe('fromTeeShotRow', () => {
  it('maps the snake_case row', () => {
    expect(
      fromTeeShotRow({
        game_id: 'g1',
        team_number: 2,
        hole_number: 7,
        tee_shot_by: null,
        entered_by: 'u1',
        client_updated_at: '2026-10-15T10:00:00.000Z',
        updated_at: '2026-10-15T10:00:01.000Z',
      }),
    ).toEqual({
      gameId: 'g1',
      teamNumber: 2,
      holeNumber: 7,
      teeShotBy: null,
      enteredBy: 'u1',
      clientUpdatedAt: '2026-10-15T10:00:00.000Z',
      serverUpdatedAt: '2026-10-15T10:00:01.000Z',
    });
  });
});
