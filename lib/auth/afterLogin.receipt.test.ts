import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (0252): the REAL `afterLogin` with game-less invitations.
 *
 * «Legg til venn på e-post» writes one game-less invitation for every address.
 * For a person who already had an account it is only the sender's receipt: the
 * person has a friend request to answer. A login must leave that invitation
 * alone (no consume, no friendship). An invitation the person joined on is
 * taken as before.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const INVITER = '22222222-2222-4222-8222-222222222222';
const EMAIL = 'kari@example.test';
const ACCOUNT_CREATED = '2026-03-01T10:00:00.000Z';
const future = new Date(Date.now() + 7 * 86_400_000).toISOString();

type Invitation = { id: string; game_id: null; invited_by: string; created_at: string; accepted_at: string | null; expires_at: string };
let invitations: Invitation[];

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'invitations') return { data: invitations.filter((i) => i.accepted_at === null) };
  if (op.table === 'users') {
    return op.kind === 'select' ? { data: { id: ME, created_at: ACCOUNT_CREATED } } : { data: [] };
  }
  throw new Error(`unexpected read of ${op.table}`);
}
const fake = createAdminClientMock({ respond });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

const consumedIds: string[] = [];
const callerFake = createAdminClientMock({
  respond: (op) => {
    const ids = (op.filters.find((f) => f.op === 'in')?.value as string[]) ?? [];
    consumedIds.push(...ids);
    return { data: ids.map((id) => ({ id })) };
  },
});
// Every RPC the login runs goes through here; the tests read the befriend calls.
const rpc = vi.fn(async (_name: string, _params?: unknown) => ({ error: null }));
const client = { ...callerFake.client, rpc } as unknown as SupabaseClient<Database>;
const befriended = () =>
  rpc.mock.calls.filter(([name]) => name === 'befriend_inviter').map(([, params]) => params);

vi.mock('@/lib/notifications/notifyInvitedToGame', () => ({ notifyInvitedToGame: vi.fn() }));

import { afterLogin } from './afterLogin';

const invitation = (id: string, createdAt: string): Invitation => ({
  id,
  game_id: null,
  invited_by: INVITER,
  created_at: createdAt,
  accepted_at: null,
  expires_at: future,
});

beforeEach(() => {
  consumedIds.length = 0;
  rpc.mockClear();
});

describe('afterLogin and game-less invitations (0252)', () => {
  it('leaves an invitation written after the account existed: no consume, no friendship', async () => {
    invitations = [invitation('receipt', '2026-03-05T10:00:00.000Z')];
    await afterLogin(client, { userId: null, email: EMAIL });
    expect(consumedIds).toEqual([]);
    expect(befriended()).toEqual([]);
  });

  it('takes an invitation the person joined on, and befriends the inviter', async () => {
    invitations = [invitation('joined', '2026-02-20T10:00:00.000Z')];
    await afterLogin(client, { userId: null, email: EMAIL });
    expect(consumedIds).toEqual(['joined']);
    expect(befriended()).toEqual([{ p_inviter: INVITER }]);
  });

  it('takes the one and leaves the other when both are open', async () => {
    invitations = [
      invitation('joined', '2026-02-20T10:00:00.000Z'),
      { ...invitation('receipt', '2026-03-05T10:00:00.000Z'), invited_by: '33333333-3333-4333-8333-333333333333' },
    ];
    await afterLogin(client, { userId: null, email: EMAIL });
    expect(consumedIds).toEqual(['joined']);
    expect(befriended()).toEqual([{ p_inviter: INVITER }]);
  });
});
