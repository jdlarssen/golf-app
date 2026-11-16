// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2483): the reminder to confirm, one home for the admin «Status»
 * page (everyone at once) and the organiser's «Klar for i morgen?» (one
 * player). Who is a target: on the list, not withdrawn, not a guest, not yet
 * confirmed, in a round that is scheduled or in progress. `userIds` only
 * narrows that set, so a forged form post cannot reach anyone else.
 */

type PlayerRow = {
  user_id: string;
  withdrawn_at: string | null;
  accepted_at: string | null;
  users: { is_guest: boolean } | null;
};

const GAME_ID = 'spill-1';

let db: {
  game: { id: string; name: string; status: string; created_by: string | null } | null;
  players: PlayerRow[];
  creator: { name: string | null; email: string | null } | null;
  playersError: { message: string } | null;
};

function player(user_id: string, overrides: Partial<Omit<PlayerRow, 'user_id'>> = {}): PlayerRow {
  return { user_id, withdrawn_at: null, accepted_at: null, users: { is_guest: false }, ...overrides };
}

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'games') return { data: db.game };
  if (op.table === 'game_players') return { data: db.players, error: db.playersError };
  if (op.table === 'users') return { data: db.creator };
  throw new Error(`unexpected query: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('@/lib/notifications/notify', () => ({
  notify: vi.fn(async () => ({ shouldAlsoSendMail: false })),
}));

import { notify } from '@/lib/notifications/notify';
import { sendUnconfirmedReminders } from './remindUnconfirmed';

const notifyMock = vi.mocked(notify);
const remindedIds = () => notifyMock.mock.calls.map((c) => c[0].userId);

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = {
    game: { id: GAME_ID, name: 'Lørdagsrunden', status: 'scheduled', created_by: 'org' },
    players: [
      player('org', { accepted_at: '2026-11-10T10:00:00Z' }),
      player('kari'),
      player('ola'),
      player('marte', { accepted_at: '2026-11-11T10:00:00Z' }),
      player('trukket', { withdrawn_at: '2026-11-12T10:00:00Z' }),
      player('gjest', { users: { is_guest: true } }),
    ],
    creator: { name: 'Jørgen Larssen', email: 'jorgen@example.test' },
    playersError: null,
  };
});

describe('sendUnconfirmedReminders', () => {
  it('without a filter: everyone on the list who has not confirmed, not the withdrawn, not the guest', async () => {
    await expect(sendUnconfirmedReminders(GAME_ID)).resolves.toEqual({ ok: true, reminded: 2 });
    expect(remindedIds()).toEqual(['kari', 'ola']);
    expect(notifyMock).toHaveBeenCalledWith({
      userId: 'kari',
      kind: 'player_added',
      payload: { game_id: GAME_ID, game_name: 'Lørdagsrunden', added_by_name: 'Jørgen Larssen' },
    });
  });

  it('asks the database only for rows without accepted_at', async () => {
    await sendUnconfirmedReminders(GAME_ID);
    const roster = fake.ops.find((op) => op.table === 'game_players')!;
    expect(roster.filters).toEqual([
      { op: 'eq', column: 'game_id', value: GAME_ID },
      { op: 'is', column: 'accepted_at', value: null },
    ]);
  });

  it('with userIds: only that player', async () => {
    await expect(sendUnconfirmedReminders(GAME_ID, { userIds: ['kari'] })).resolves.toEqual({
      ok: true,
      reminded: 1,
    });
    expect(remindedIds()).toEqual(['kari']);
  });

  it.each([
    ['someone who has confirmed', 'marte'],
    ['someone who withdrew', 'trukket'],
    ['a guest', 'gjest'],
    ['someone not on the list', 'fremmed'],
  ])('a userId of %s gives 0 reminders and no send', async (_label, userId) => {
    await expect(sendUnconfirmedReminders(GAME_ID, { userIds: [userId] })).resolves.toEqual({
      ok: true,
      reminded: 0,
    });
    expect(notifyMock).not.toHaveBeenCalled();
    // Nobody to remind: the organiser's name is never read.
    expect(fake.ops.map((op) => op.table)).toEqual(['games', 'game_players']);
  });

  it('works while the round is in progress, as the admin page uses it', async () => {
    db.game = { ...db.game!, status: 'active' };
    await expect(sendUnconfirmedReminders(GAME_ID)).resolves.toEqual({ ok: true, reminded: 2 });
  });

  it.each(['draft', 'finished'])('a %s round is not_active and sends nothing', async (status) => {
    db.game = { ...db.game!, status };
    await expect(sendUnconfirmedReminders(GAME_ID)).resolves.toEqual({ ok: false, reason: 'not_active' });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(fake.ops.map((op) => op.table)).toEqual(['games']);
  });

  it('an unknown game is not_found', async () => {
    db.game = null;
    await expect(sendUnconfirmedReminders('finnes-ikke')).resolves.toEqual({ ok: false, reason: 'not_found' });
  });

  it('a failed roster read throws instead of reporting nobody to remind', async () => {
    db.playersError = { message: 'connection reset' };
    await expect(sendUnconfirmedReminders(GAME_ID)).rejects.toThrow('connection reset');
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('a nameless organiser shows masked; a round without one says Tørny', async () => {
    db.creator = { name: null, email: 'jorgen@example.test' };
    await sendUnconfirmedReminders(GAME_ID, { userIds: ['kari'] });
    const masked = (notifyMock.mock.calls[0][0].payload as { added_by_name: string }).added_by_name;
    expect(masked).not.toContain('jorgen@example.test');
    expect(masked).toContain('@example.test');

    notifyMock.mockClear();
    db.game = { ...db.game!, created_by: null };
    await sendUnconfirmedReminders(GAME_ID, { userIds: ['kari'] });
    expect((notifyMock.mock.calls[0][0].payload as { added_by_name: string }).added_by_name).toBe('Tørny');
  });

  it('a failed send for one player does not stop the others', async () => {
    notifyMock.mockRejectedValueOnce(new Error('push down'));
    await expect(sendUnconfirmedReminders(GAME_ID)).resolves.toEqual({ ok: true, reminded: 2 });
    expect(remindedIds()).toEqual(['kari', 'ola']);
  });
});
