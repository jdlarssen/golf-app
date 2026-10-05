import { beforeEach, describe, expect, it } from 'vitest';
import { recordingClient } from '@/tests/queryBuilderMock';
import { readAnyOwnStandaloneRound } from './readAnyOwnStandaloneRound';

// Type A for the quick read that tells a new player in the Klubbhus room
// (#2494): your own games, standalone only (no cup match, no league flight),
// every status, one row is enough. The request client is the boundary.
let result: { data: unknown; error: unknown } = { data: [], error: null };
const db = recordingClient(() => result);
const supabase = db.client as unknown as Parameters<typeof readAnyOwnStandaloneRound>[0];

beforeEach(() => {
  db.reset();
  result = { data: [], error: null };
});

describe('readAnyOwnStandaloneRound', () => {
  it('reads one of your own standalone games, of any status', async () => {
    result = { data: [{ id: 'g1' }], error: null };
    await expect(readAnyOwnStandaloneRound(supabase, 'me')).resolves.toEqual({ ok: true, games: [{ id: 'g1' }] });
    const calls = db.calls();
    expect(calls).toEqual(
      expect.arrayContaining([
        ['from', 'games'],
        ['eq', 'created_by', 'me'],
        ['is', 'tournament_id', null],
        ['is', 'league_round_id', null],
        ['limit', 1],
      ]),
    );
    expect(calls.some((c) => c[0] === 'eq' && c[1] === 'status')).toBe(false);
  });

  it('none → an empty list; a failed read → not ok (never «new»)', async () => {
    await expect(readAnyOwnStandaloneRound(supabase, 'me')).resolves.toEqual({ ok: true, games: [] });
    result = { data: null, error: { message: 'boom' } };
    await expect(readAnyOwnStandaloneRound(supabase, 'me')).resolves.toEqual({ ok: false });
  });
});
