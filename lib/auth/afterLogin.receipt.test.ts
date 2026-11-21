import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (0252): the REAL `afterLogin` with game-less invitations.
 *
 * «Legg til venn på e-post» writes one game-less invitation for every address.
 * For a person who already had an account it is only the sender's receipt,
 * marked in `invitation_receipts`: the person has a friend request to answer.
 * A login must leave that invitation alone (no consume, no friendship). An
 * invitation without the mark is taken as before, whatever its timestamps
 * say: nothing a signed-in client can write decides this.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const INVITER = '22222222-2222-4222-8222-222222222222';
const EMAIL = 'kari@example.test';
const future = new Date(Date.now() + 7 * 86_400_000).toISOString();

type Invitation = { id: string; game_id: null; invited_by: string; accepted_at: string | null; expires_at: string };
let invitations: Invitation[];
/** The rows `friend_request_by_email` marked. `null` = the read fails. */
let marks: string[] | null = [];

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'invitations') return { data: invitations.filter((i) => i.accepted_at === null) };
  if (op.table === 'invitation_receipts') {
    return marks === null
      ? { data: null, error: { message: 'nede' } }
      : { data: marks.map((invitation_id) => ({ invitation_id })) };
  }
  if (op.table === 'users') return op.kind === 'select' ? { data: { id: ME } } : { data: [] };
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

const invitation = (id: string): Invitation => ({
  id,
  game_id: null,
  invited_by: INVITER,
  accepted_at: null,
  expires_at: future,
});

beforeEach(() => {
  consumedIds.length = 0;
  rpc.mockClear();
  marks = [];
});

describe('afterLogin and game-less invitations (0252)', () => {
  it('leaves a marked receipt: no consume, no friendship', async () => {
    invitations = [invitation('receipt')];
    marks = ['receipt'];
    await afterLogin(client, { userId: null, email: EMAIL });
    expect(consumedIds).toEqual([]);
    expect(befriended()).toEqual([]);
  });

  it('takes an invitation without the mark, and befriends the inviter', async () => {
    invitations = [invitation('joined')];
    await afterLogin(client, { userId: null, email: EMAIL });
    expect(consumedIds).toEqual(['joined']);
    expect(befriended()).toEqual([{ p_inviter: INVITER }]);
  });

  it('takes the one and leaves the other when both are open', async () => {
    invitations = [
      invitation('joined'),
      { ...invitation('receipt'), invited_by: '33333333-3333-4333-8333-333333333333' },
    ];
    marks = ['receipt'];
    await afterLogin(client, { userId: null, email: EMAIL });
    expect(consumedIds).toEqual(['joined']);
    expect(befriended()).toEqual([{ p_inviter: INVITER }]);
  });

  // Fail closed: «we could not read the marks» must never read as «no marks».
  it('takes no game-less invitation when the marks cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    invitations = [invitation('joined'), invitation('receipt')];
    marks = null;
    await afterLogin(client, { userId: null, email: EMAIL });
    expect(consumedIds).toEqual([]);
    expect(befriended()).toEqual([]);
  });
});
