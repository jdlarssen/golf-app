// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type C (#2839): the `joinable` list on `GET /api/liga`: draft club leagues in
 * the caller's own clubs that the caller is not in. The mock records the
 * filters, so what is asserted is which clubs the read was bounded to and what
 * the list does with the caller's own leagues.
 */

const ME = '11111111-1111-4111-8111-111111111111';

let myLeagueRows: Array<{ league_id: string }> = [];
let myClubRows: Array<{ group_id: string }> = [];
let clubLeagueRows: Array<{ id: string; name: string; status: string }> = [];
let clubsError: { message: string } | null = null;

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'league_players') return { data: myLeagueRows };
  if (op.table === 'group_members') return { data: myClubRows, error: clubsError };
  if (op.table === 'leagues') {
    const byGroup = op.filters.some((f) => f.column === 'group_id');
    // `readMyLeagues` asks by id; the joinable read asks by club.
    return { data: byGroup ? clubLeagueRows : [] };
  }
  if (op.table === 'league_rounds') return { data: [] };
  if (op.table === 'game_players') return { data: [] };
  throw new Error(`unexpected read of ${op.table}`);
}

const fake = createAdminClientMock({ respond });
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

import { getMyLeagues } from './getMyLeagues';

beforeEach(() => {
  fake.reset();
  myLeagueRows = [];
  myClubRows = [];
  clubLeagueRows = [];
  clubsError = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getMyLeagues joinable (#2839)', () => {
  it('lists the draft club leagues in my clubs, with no round state', async () => {
    myClubRows = [{ group_id: 'k1' }];
    clubLeagueRows = [{ id: 'l1', name: 'Klubbligaen', status: 'draft' }];
    expect(await getMyLeagues(ME)).toEqual({
      leagues: [],
      joinable: [
        { id: 'l1', name: 'Klubbligaen', status: 'draft', openRound: null, delivered: false, inProgress: false, markerCards: [] },
      ],
    });
  });

  it('bounds the read to my own clubs and to draft leagues', async () => {
    myClubRows = [{ group_id: 'k1' }, { group_id: 'k2' }];
    await getMyLeagues(ME);
    const read = fake.ops.find((op) => op.table === 'leagues' && op.filters.some((f) => f.column === 'group_id'));
    expect(read?.filters).toEqual([
      { op: 'in', column: 'group_id', value: ['k1', 'k2'] },
      { op: 'eq', column: 'status', value: 'draft' },
    ]);
    // The membership read is the caller's own, by id from the token.
    const clubs = fake.ops.find((op) => op.table === 'group_members');
    expect(clubs?.filters).toEqual([{ op: 'eq', column: 'user_id', value: ME }]);
  });

  it('a league I am already in is not offered', async () => {
    myLeagueRows = [{ league_id: 'l1' }];
    myClubRows = [{ group_id: 'k1' }];
    clubLeagueRows = [
      { id: 'l1', name: 'Jeg er med', status: 'draft' },
      { id: 'l2', name: 'Ikke med', status: 'draft' },
    ];
    const { joinable } = await getMyLeagues(ME);
    expect(joinable.map((l) => l.id)).toEqual(['l2']);
  });

  it('no club membership gives no joinable list, and no league read by club', async () => {
    const res = await getMyLeagues(ME);
    expect({
      joinable: res.joinable,
      clubReads: fake.ops.filter((op) => op.filters.some((f) => f.column === 'group_id')).length,
    }).toEqual({ joinable: [], clubReads: 0 });
  });

  it('a failed club read gives an empty joinable list and keeps «Ligaene dine»', async () => {
    myLeagueRows = [{ league_id: 'l1' }];
    clubsError = { message: 'boom' };
    const res = await getMyLeagues(ME);
    expect(res.joinable).toEqual([]);
    expect(res.leagues).toEqual([]); // the leagues read is the empty fake; what matters is that nothing threw
  });
});
