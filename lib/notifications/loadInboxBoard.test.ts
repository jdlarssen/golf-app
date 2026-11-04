// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';
import type { InboxRow } from './inboxSections';
import { loadInboxBoard, readSettledInputs } from './loadInboxBoard';

/**
 * #2759: the reads behind the board, the web's page and the app's route share
 * them. The rules themselves are `findSettledActionIds`
 * (`inboxSections.test.ts`). Here: what is asked of the database, by which
 * client, and that a failed read never reads as «no rows».
 */

const ME = '66666666-6666-6666-6666-666666666666';
const GAME = '11111111-1111-1111-1111-111111111111';
const MARTE = '44444444-4444-4444-4444-444444444444';
const ROUND = '88888888-8888-8888-8888-888888888888';
const CLUB = '99999999-9999-9999-9999-999999999999';

let adminAnswers: (op: QueryOp) => QueryResponse;
let clientAnswers: (op: QueryOp) => QueryResponse;
const admin = createAdminClientMock({ respond: (op) => adminAnswers(op) });
const caller = createAdminClientMock({ respond: (op) => clientAnswers(op) });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => admin.client }));

const client = caller.client as unknown as Parameters<typeof loadInboxBoard>[0];

function row(id: string, kind: string, payload: Record<string, unknown>, read = false): InboxRow {
  return {
    id,
    kind: kind as InboxRow['kind'],
    payload: payload as InboxRow['payload'],
    read_at: read ? '2026-10-01T07:00:00Z' : null,
    created_at: '2026-10-01T08:00:00Z',
  };
}

/** The viewer's rows for the board's two reads, split the way the board reads them. */
function serveRows(rows: InboxRow[], other: (op: QueryOp) => QueryResponse = () => ({ data: [] })) {
  clientAnswers = (op) => {
    if (op.table !== 'notifications') return other(op);
    const unreadRead = op.filters.some((f) => f.op === 'is' && f.column === 'read_at');
    return { data: rows.filter((r) => (r.read_at == null) === unreadRead) };
  };
}

const opsOn = (fake: typeof admin, table: string) => fake.ops.filter((op) => op.table === table);
const hasFilter = (op: QueryOp, column: string, value: unknown) =>
  op.filters.some((f) => f.column === column && JSON.stringify(f.value) === JSON.stringify(value));

beforeEach(() => {
  admin.reset();
  caller.reset();
  adminAnswers = () => ({ data: [] });
  serveRows([]);
});

describe('loadInboxBoard', () => {
  it('an empty inbox asks for nothing but the two reads of the rows', async () => {
    const board = await loadInboxBoard(client, ME);
    expect(board).toMatchObject({ rows: [], staleIds: [], settledIds: [] });
    expect(admin.ops).toEqual([]);
    expect(caller.ops.map((op) => op.table)).toEqual(['notifications', 'notifications']);
  });

  it('both reads of the rows are the viewer’s own, without archived rows', async () => {
    await loadInboxBoard(client, ME);
    for (const op of caller.ops) {
      expect(hasFilter(op, 'user_id', ME)).toBe(true);
      expect(op.filters).toContainEqual(expect.objectContaining({ op: 'is', column: 'archived_at' }));
    }
  });

  it('a settled row is read on the board at once, and its id goes to the caller', async () => {
    const pay = row('pay', 'payment_reminder', { game_id: GAME, game_name: 'X', entry_fee_kr: 200 });
    serveRows([pay], (op) =>
      op.table === 'game_players'
        ? { data: [{ game_id: GAME, result_summary: null, paid_at: 'x', submitted_at: null, accepted_at: 'a', withdrawn_at: null }] }
        : { data: [] },
    );
    adminAnswers = (op) =>
      op.table === 'games'
        ? { data: [{ id: GAME, status: 'active', scheduled_tee_off_at: null, league_round_id: null }] }
        : { data: [] };

    const board = await loadInboxBoard(client, ME);

    expect(board.settledIds).toEqual(['pay']);
    expect(board.rows[0]!.read_at).not.toBeNull();
  });

  it('a signup row about a game that is gone is hidden and goes to the caller to archive (#1393)', async () => {
    const gone = row('gone', 'registration_request', { game_id: GAME, game_name: 'X', request_id: MARTE });
    serveRows([gone]);

    const board = await loadInboxBoard(client, ME);

    expect(board.rows).toEqual([]);
    expect(board.staleIds).toEqual(['gone']);
    expect(board.settledIds).toEqual([]);
  });

  it('a read of the rows that fails throws: never an empty inbox (#1392)', async () => {
    clientAnswers = () => ({ error: { message: 'nede' } });
    await expect(loadInboxBoard(client, ME)).rejects.toBeTruthy();
  });

  it.each(['games', 'game_players', 'game_registration_requests', 'friendships', 'group_join_requests'])(
    'a lookup on %s that fails throws and settles nothing (#1393)',
    async (table) => {
      const rows = [
        row('a', 'payment_reminder', { game_id: GAME, game_name: 'X', entry_fee_kr: 1 }),
        row('b', 'peer_approval_request', { game_id: GAME, game_name: 'X', submitter_id: MARTE }),
        row('c', 'team_invite', { game_id: GAME, game_short_id: 'abcd1234', game_name: 'X', request_id: MARTE }),
        row('d', 'friend_request', { actor_id: MARTE }),
        row('e', 'club_join_request', { group_id: CLUB, group_name: 'K', requester_name: 'M' }),
      ];
      serveRows(rows);
      adminAnswers = (op) => (op.table === table ? { error: { message: 'nede' } } : { data: [] });
      await expect(loadInboxBoard(client, ME)).rejects.toBeTruthy();
    },
  );

  it('a hand-edited row without a game id never reaches an .in() list', async () => {
    serveRows([row('odd', 'payment_reminder', { game_name: 'X', entry_fee_kr: 1 })]);
    await loadInboxBoard(client, ME);
    expect(opsOn(admin, 'games')).toEqual([]);
  });

  it('a read row needs no settle lookups, only what the row shows', async () => {
    serveRows([row('old', 'payment_reminder', { game_id: GAME, game_name: 'X', entry_fee_kr: 1 }, true)]);
    await loadInboxBoard(client, ME);
    expect(admin.ops).toEqual([]);
    expect(opsOn(caller, 'game_players')).toEqual([]);
  });

  it('the result and the tee-off come back for the caller to show', async () => {
    const summary = { kind: 'placement', rank: 2, fieldSize: 12, isTeam: false };
    serveRows([row('r', 'game_finished', { game_id: GAME, game_name: 'X' }, true)], (op) =>
      op.table === 'game_players'
        ? { data: [{ game_id: GAME, result_summary: summary, paid_at: null, submitted_at: null, accepted_at: null, withdrawn_at: null }] }
        : { data: [] },
    );
    adminAnswers = (op) =>
      op.table === 'games'
        ? { data: [{ id: GAME, status: 'finished', scheduled_tee_off_at: '2026-10-02T10:00:00Z', league_round_id: ROUND }] }
        : { data: [] };

    const board = await loadInboxBoard(client, ME);

    expect(board.resultByGame).toEqual({ [GAME]: summary });
    expect(board.teeOffByGame).toEqual({ [GAME]: '2026-10-02T10:00:00Z' });
    expect(board.finishedGameIds).toEqual([GAME]);
    expect(board.leagueFlightGameIds).toEqual([GAME]);
  });
});

describe('readSettledInputs', () => {
  const read = (rows: InboxRow[]) => readSettledInputs(client, ME, rows, 1_000);

  it('the marker’s card is read with the admin client: outside the flight RLS hides it', async () => {
    adminAnswers = (op) =>
      op.table === 'game_players'
        ? {
            data: [
              { game_id: GAME, user_id: MARTE, submitted_at: 'x', approved_at: null, withdrawn_at: null, marker_user_id: ME },
            ],
          }
        : { data: [] };
    const inputs = await read([
      row('m', 'league_marker_request', { league_id: ROUND, league_name: 'L', game_id: GAME, player_id: MARTE, player_name: 'M' }),
    ]);
    expect(inputs.cards).toHaveLength(1);
    expect(opsOn(caller, 'game_players')).toEqual([]);
  });

  it('the cards are paged, so a cut-off response cannot read as a card that is gone', async () => {
    adminAnswers = (op) => {
      if (op.table !== 'game_players') return { data: [] };
      return { data: op.range?.[0] === 0 ? Array.from({ length: 1000 }, (_, i) => ({ user_id: `u${i}`, game_id: GAME })) : [{ user_id: 'last', game_id: GAME }] };
    };
    const inputs = await read([row('p', 'peer_approval_request', { game_id: GAME, game_name: 'X', submitter_id: MARTE })]);
    expect(inputs.cards).toHaveLength(1001);
  });

  it('the deliverer’s copy and a reminder for kept cards read the cards; your own row does not', async () => {
    await read([row('own', 'scorecard_rejected', { game_id: GAME, game_name: 'X' })]);
    expect(opsOn(admin, 'game_players')).toEqual([]);
    await read([row('copy', 'scorecard_rejected', { game_id: GAME, game_name: 'X', player_name: 'M', player_id: MARTE })]);
    expect(opsOn(admin, 'game_players')).toHaveLength(1);
    await read([
      row('kept', 'deliver_reminder', { game_id: GAME, game_name: 'X', others_count: 1, card_user_ids: [MARTE] }),
    ]);
    expect(opsOn(admin, 'game_players')).toHaveLength(2);
  });

  it('your own player row is read with your own client, and has what the rules need', async () => {
    clientAnswers = () => ({
      data: [{ game_id: GAME, result_summary: null, paid_at: 'p', submitted_at: 's', accepted_at: 'a', withdrawn_at: 'w' }],
    });
    const inputs = await read([row('i', 'invite', { game_id: GAME, game_name: 'X', invited_by_name: 'P' })]);
    expect(inputs.own.get(GAME)).toEqual({ paid_at: 'p', submitted_at: 's', accepted_at: 'a', withdrawn_at: 'w' });
    expect(hasFilter(opsOn(caller, 'game_players')[0]!, 'user_id', ME)).toBe(true);
  });

  it('#2759: a team invite reads the viewer’s own request in the game, not the captain’s in the payload', async () => {
    adminAnswers = (op) =>
      op.table === 'game_registration_requests' ? { data: [{ game_id: GAME, status: 'approved' }] } : { data: [] };
    const inputs = await read([
      row('t', 'team_invite', { game_id: GAME, game_short_id: 'abcd1234', game_name: 'X', request_id: MARTE }),
    ]);
    expect(inputs.ownRequestStatus.get(GAME)).toBe('approved');
    expect(hasFilter(opsOn(admin, 'game_registration_requests')[0]!, 'user_id', ME)).toBe(true);
    expect(inputs.requestStatus.size).toBe(0);
  });

  it('#2759: a flight the viewer withdrew from does not count as played', async () => {
    adminAnswers = (op) =>
      op.table === 'games' && hasFilter(op, 'league_round_id', [ROUND])
        ? { data: [{ league_round_id: ROUND, status: 'active', game_players: [{ user_id: ME, withdrawn_at: 'x' }] }] }
        : { data: [] };
    const notice = row('l', 'league_round_open', {
      league_id: CLUB,
      league_name: 'L',
      round_id: ROUND,
      round_label: 'R',
      closes_at: '2099-01-01T00:00:00Z',
    });
    expect((await read([notice])).playedRoundIds.size).toBe(0);
    const flightsOp = opsOn(admin, 'games').find((op) => hasFilter(op, 'league_round_id', [ROUND]))!;
    expect(hasFilter(flightsOp, 'game_players.user_id', ME)).toBe(true);
  });

  it.each(['scheduled', 'active', 'finished'])('a flight the viewer is still in counts as played when it is %s', async (status) => {
    adminAnswers = (op) =>
      op.table === 'games' && hasFilter(op, 'league_round_id', [ROUND])
        ? { data: [{ league_round_id: ROUND, status, game_players: [{ user_id: ME, withdrawn_at: null }] }] }
        : { data: [] };
    const notice = row('l', 'league_round_closing', {
      league_id: CLUB,
      league_name: 'L',
      round_id: ROUND,
      round_label: 'R',
      closes_at: '2099-01-01T00:00:00Z',
    });
    expect((await read([notice])).playedRoundIds).toEqual(new Set([ROUND]));
  });

  it('a friend request reads only friendships addressed to the viewer that still wait', async () => {
    adminAnswers = (op) => (op.table === 'friendships' ? { data: [{ requester_id: MARTE }] } : { data: [] });
    const inputs = await read([row('f', 'friend_request', { actor_id: MARTE })]);
    expect(inputs.pendingFriendIds).toEqual(new Set([MARTE]));
    const op = opsOn(admin, 'friendships')[0]!;
    expect(hasFilter(op, 'addressee_id', ME)).toBe(true);
    expect(hasFilter(op, 'status', 'pending')).toBe(true);
  });

  it('a club counts only when someone waits and the viewer is still owner or admin there', async () => {
    const r = row('c', 'club_join_request', { group_id: CLUB, group_name: 'K', requester_name: 'M' });
    adminAnswers = (op) =>
      op.table === 'group_join_requests' ? { data: [{ group_id: CLUB }] } : { data: [] };
    expect((await read([r])).pendingClubIds.size).toBe(0);

    adminAnswers = (op) =>
      op.table === 'group_join_requests' || op.table === 'group_members' ? { data: [{ group_id: CLUB }] } : { data: [] };
    expect((await read([r])).pendingClubIds).toEqual(new Set([CLUB]));
    expect(hasFilter(opsOn(admin, 'group_members')[0]!, 'user_id', ME)).toBe(true);
  });
});
