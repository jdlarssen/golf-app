import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';

/**
 * Type A (#2445): medspiller-avledningen i app-koden speiler medspiller-grenen
 * i `is_invite_eligible` (migrasjon 0202). Et utkast gjør bare arrangøren til
 * medspiller; andres utkast teller ikke.
 */

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

import { getCoPlayerIds } from './getCoPlayerIds';

const ME = '11111111-1111-1111-1111-111111111111';
const ORGANISER = '22222222-2222-2222-2222-222222222222';
const GAME = '33333333-3333-3333-3333-333333333333';

function myGames(status: string, createdBy: string): QueryResult {
  return { data: [{ game_id: GAME, games: { status, created_by: createdBy } }], error: null };
}

const CO_ROWS: QueryResult = { data: [{ user_id: 'p1' }, { user_id: 'p2' }], error: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getCoPlayerIds', () => {
  it.each([
    { label: 'andres utkast gir ingen medspillere fra det spillet', status: 'draft', createdBy: ORGANISER, expected: [] },
    { label: 'eget utkast gir dem', status: 'draft', createdBy: ME, expected: ['p1', 'p2'] },
    { label: 'et publisert spill gir dem', status: 'scheduled', createdBy: ORGANISER, expected: ['p1', 'p2'] },
  ])('$label', async ({ status, createdBy, expected }) => {
    adminMock = buildSupabaseMock([myGames(status, createdBy), CO_ROWS]);

    const result = await getCoPlayerIds(ME);

    expect(result).toEqual(expected);
    // The first read carries the game's status and organiser.
    expect(adminMock.__fromCalls).toContainEqual({
      table: 'game_players',
      method: 'select',
      args: ['game_id, games!inner(status, created_by)'],
    });
    const coPlayerRead = adminMock.__fromCalls.find(
      (c) => c.method === 'in' && c.args[0] === 'game_id',
    );
    if (expected.length === 0) {
      expect(coPlayerRead).toBeUndefined();
    } else {
      expect(coPlayerRead?.args[1]).toEqual([GAME]);
    }
  });

  it('feil i den første lesingen gir tom liste', async () => {
    adminMock = buildSupabaseMock([{ data: null, error: { message: 'boom' } }]);

    expect(await getCoPlayerIds(ME)).toEqual([]);
  });
});
