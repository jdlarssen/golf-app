import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2748): the invitation link for someone logged in. `afterLogin` has its
 * own rules; here stands when it may run. Above all that a second tap writes
 * nothing and notifies nobody: `notify` has no dedupe, and a team invitation stays
 * open on purpose.
 */

const TOKEN = '44444444-4444-4444-8444-444444444444';
const GAME = '55555555-5555-4555-8555-555555555555';
const ME = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'kari@example.test';

const DAY = 86_400_000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

let invitation: Record<string, unknown> | null;
let invitationError: { message: string } | null;
let game: { status: string; registration_type: string } | null;
let gameError: { message: string } | null;
let rosterRow: { user_id: string } | null;
let rosterError: { message: string } | null;

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'invitations') return { data: invitation, error: invitationError };
  if (op.table === 'games') return { data: game, error: gameError };
  if (op.table === 'game_players') return { data: rosterRow, error: rosterError };
  throw new Error(`openInvitation reads no ${op.table}`);
}

const fake = createAdminClientMock({ respond });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

// What the real one does for an open solo invitation to a round that has not
// started: a roster row, and the invitation consumed.
const afterLogin = vi.fn(async () => {
  rosterRow = { user_id: ME };
  if (invitation) invitation.accepted_at = inDays(0);
  return { landing: null };
});
vi.mock('@/lib/auth/afterLogin', () => ({ afterLogin: (...args: unknown[]) => afterLogin(...(args as [])) }));

import { openInvitation } from './openInvitation';

const client = {} as SupabaseClient<Database>;
const open = (token = TOKEN, email = EMAIL) => openInvitation(client, { token, userId: ME, email });

beforeEach(() => {
  afterLogin.mockClear();
  invitation = { email: EMAIL, game_id: GAME, accepted_at: null, expires_at: inDays(7) };
  invitationError = null;
  game = { status: 'scheduled', registration_type: 'solo' };
  gameError = null;
  rosterRow = null;
  rosterError = null;
});

describe('openInvitation', () => {
  it('an open invitation to a round that has not started gives the round', async () => {
    expect(await open()).toEqual({ status: 'in_game', gameId: GAME });
    expect(afterLogin).toHaveBeenCalledTimes(1);
    expect(afterLogin).toHaveBeenCalledWith(client, { userId: ME, email: EMAIL });
  });

  it('a second tap gives the same round, and runs nothing again', async () => {
    await open();
    expect(await open()).toEqual({ status: 'in_game', gameId: GAME });
    expect(afterLogin).toHaveBeenCalledTimes(1);
  });

  it('an open invitation for someone already on the list runs nothing', async () => {
    rosterRow = { user_id: ME };
    expect(await open()).toEqual({ status: 'in_game', gameId: GAME });
    expect(afterLogin).not.toHaveBeenCalled();
  });

  it('the address only differs in case and spaces: same person', async () => {
    invitation!.email = ' Kari@Example.TEST ';
    expect(await open()).toEqual({ status: 'in_game', gameId: GAME });
  });

  it('another address gets nothing about the round, and runs nothing', async () => {
    const before = fake.ops.length;
    expect(await open(TOKEN, 'ola@example.test')).toEqual({ status: 'other_account' });
    expect(afterLogin).not.toHaveBeenCalled();
    expect(fake.ops.slice(before).map((op) => op.table)).toEqual(['invitations']);
  });

  it('a round that has started: no spot, and the invitation is still consumed', async () => {
    game = { status: 'active', registration_type: 'solo' };
    afterLogin.mockImplementationOnce(async () => {
      invitation!.accepted_at = inDays(0);
      return { landing: null };
    });
    expect(await open()).toEqual({ status: 'started' });
    expect(afterLogin).toHaveBeenCalledTimes(1);
  });

  it('a guest already on a finished round gets the round', async () => {
    game = { status: 'finished', registration_type: 'solo' };
    rosterRow = { user_id: ME };
    expect(await open()).toEqual({ status: 'in_game', gameId: GAME });
  });

  // `afterLogin` notifies on every run for these: they stay open for the web's flow.
  it.each(['team', 'both'])('a %s invitation runs nothing, however often it is opened', async (registration_type) => {
    game = { status: 'scheduled', registration_type };
    expect(await open()).toEqual({ status: 'no_game' });
    expect(await open()).toEqual({ status: 'no_game' });
    expect(afterLogin).not.toHaveBeenCalled();
  });

  it('a draft is hidden, also with a roster spot (#2445)', async () => {
    game = { status: 'draft', registration_type: 'solo' };
    expect(await open()).toEqual({ status: 'no_game' });
    rosterRow = { user_id: ME };
    expect(await open()).toEqual({ status: 'no_game' });
  });

  it('an expired invitation runs nothing and gives no round', async () => {
    invitation!.expires_at = inDays(-1);
    expect(await open()).toEqual({ status: 'no_game' });
    expect(afterLogin).not.toHaveBeenCalled();
  });

  it('a consumed invitation with no spot gives no round, and runs nothing', async () => {
    invitation!.accepted_at = inDays(-1);
    expect(await open()).toEqual({ status: 'no_game' });
    expect(afterLogin).not.toHaveBeenCalled();
  });

  it('an invitation without a round is taken, and has nothing to open', async () => {
    invitation!.game_id = null;
    expect(await open()).toEqual({ status: 'no_game' });
    expect(afterLogin).toHaveBeenCalledTimes(1);
  });

  it('a round that is gone has nothing to open', async () => {
    game = null;
    expect(await open()).toEqual({ status: 'no_game' });
  });

  it('an unknown token is null, and a token of the wrong shape asks nobody', async () => {
    invitation = null;
    expect(await open()).toBeNull();
    const before = fake.ops.length;
    expect(await open('not-a-token')).toBeNull();
    expect(fake.ops.length).toBe(before);
  });

  it.each<[string, () => void]>([
    ['the invitation', () => (invitationError = { message: 'boom' })],
    ['the round', () => (gameError = { message: 'boom' })],
    ['the roster', () => (rosterError = { message: 'boom' })],
  ])('a failed read of %s throws, never a guess', async (_label, breakIt) => {
    breakIt();
    await expect(open()).rejects.toThrow(/openInvitation/);
    expect(afterLogin).not.toHaveBeenCalled();
  });
});
