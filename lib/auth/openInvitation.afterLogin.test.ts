import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2748): the invitation link with the REAL `afterLogin`, for a player with
 * both a solo and a team invitation. `afterLogin` takes every open invitation on the
 * address, as a login does, and greets the team invitation each time it runs. So the
 * first opening of the solo link greets the team round once, like logging in. What
 * must hold: the team invitation stays open for the web's flow, it gets no roster
 * spot, and opening either link again changes nothing.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const INVITER = '22222222-2222-4222-8222-222222222222';
const EMAIL = 'kari@example.test';
const SOLO = '33333333-3333-4333-8333-333333333333';
const TEAM = '44444444-4444-4444-8444-444444444444';
const SOLO_TOKEN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEAM_TOKEN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const future = new Date(Date.now() + 7 * 86_400_000).toISOString();

type Invitation = {
  id: string;
  token: string;
  email: string;
  game_id: string;
  invited_by: string;
  accepted_at: string | null;
  expires_at: string;
};

let invitations: Invitation[];
let roster: Array<{ game_id: string; user_id: string }>;

const GAMES: Record<string, { status: string; registration_type: string; short_id: string }> = {
  [SOLO]: { status: 'scheduled', registration_type: 'solo', short_id: 'solo0001' },
  [TEAM]: { status: 'scheduled', registration_type: 'team', short_id: 'team0001' },
};

const filter = (op: QueryOp, column: string) => op.filters.find((f) => f.column === column)?.value;

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'invitations') {
    const token = filter(op, 'token');
    if (token) return { data: invitations.find((i) => i.token === token) ?? null };
    return { data: invitations.filter((i) => i.accepted_at === null) };
  }
  if (op.table === 'games') return { data: GAMES[filter(op, 'id') as string] ?? null };
  if (op.table === 'users') return op.kind === 'select' ? { data: { id: ME } } : { data: [] };
  if (op.table === 'game_players') {
    if (op.kind === 'insert') {
      roster.push({ game_id: op.payload!.game_id as string, user_id: op.payload!.user_id as string });
      return { data: null };
    }
    const row = roster.find((r) => r.game_id === filter(op, 'game_id') && r.user_id === filter(op, 'user_id'));
    return { data: row ?? null };
  }
  throw new Error(`unexpected read of ${op.table}`);
}

const fake = createAdminClientMock({ respond });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

// The caller's client: the consume runs through it, under RLS.
const callerFake = createAdminClientMock({
  respond: (op) => {
    const ids = op.filters.find((f) => f.op === 'in')?.value as string[];
    for (const invitation of invitations) {
      if (ids.includes(invitation.id)) invitation.accepted_at = new Date().toISOString();
    }
    return { data: ids.map((id) => ({ id })) };
  },
});
const client = {
  ...callerFake.client,
  rpc: async () => ({ error: null }),
} as unknown as SupabaseClient<Database>;

const notified = vi.fn();
vi.mock('@/lib/notifications/notifyInvitedToGame', () => ({
  notifyInvitedToGame: async (opts: { gameId: string }) => notified(opts.gameId),
}));
vi.mock('@/lib/games/joinTeeGenders', () => ({
  joinTeeGenders: async (_gameId: string, ids: string[]) => Object.fromEntries(ids.map((id) => [id, 'mens'])),
}));

import { openInvitation } from './openInvitation';

const open = (token: string) => openInvitation(client, { token, userId: ME, email: EMAIL });
const invitationFor = (gameId: string) => invitations.find((i) => i.game_id === gameId)!;

beforeEach(() => {
  notified.mockClear();
  roster = [];
  invitations = [
    { id: 'i-solo', token: SOLO_TOKEN, email: EMAIL, game_id: SOLO, invited_by: INVITER, accepted_at: null, expires_at: future },
    { id: 'i-team', token: TEAM_TOKEN, email: EMAIL, game_id: TEAM, invited_by: INVITER, accepted_at: null, expires_at: future },
  ];
});

describe('a player with both a solo and a team invitation', () => {
  it('the solo link gives the solo round, and leaves the team invitation open with no spot', async () => {
    expect(await open(SOLO_TOKEN)).toEqual({ status: 'in_game', gameId: SOLO });
    expect(roster).toEqual([{ game_id: SOLO, user_id: ME }]);
    expect(invitationFor(SOLO).accepted_at).not.toBeNull();
    expect(invitationFor(TEAM).accepted_at).toBeNull();
  });

  it('the first opening greets both once, as a login does', async () => {
    await open(SOLO_TOKEN);
    expect(notified.mock.calls.map(([gameId]) => gameId).sort()).toEqual([SOLO, TEAM].sort());
  });

  it('opening the solo link again writes nothing and notifies nobody', async () => {
    await open(SOLO_TOKEN);
    notified.mockClear();
    const writes = fake.ops.filter((op) => op.kind !== 'select').length;

    expect(await open(SOLO_TOKEN)).toEqual({ status: 'in_game', gameId: SOLO });

    expect(notified).not.toHaveBeenCalled();
    expect(fake.ops.filter((op) => op.kind !== 'select').length).toBe(writes);
    expect(roster).toHaveLength(1);
  });

  it('the team link runs nothing, before and after the solo link, and the solo invitation stays open until then', async () => {
    expect(await open(TEAM_TOKEN)).toEqual({ status: 'no_game' });
    expect(notified).not.toHaveBeenCalled();
    expect(invitationFor(SOLO).accepted_at).toBeNull();

    await open(SOLO_TOKEN);
    notified.mockClear();
    expect(await open(TEAM_TOKEN)).toEqual({ status: 'no_game' });
    expect(notified).not.toHaveBeenCalled();
    expect(invitationFor(TEAM).accepted_at).toBeNull();
  });
});
