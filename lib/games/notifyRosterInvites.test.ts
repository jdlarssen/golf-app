// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2215): hvem som får `invite` etter at appen har publisert en runde.
 *
 * Supabase er dobbelen, og `notifyInvitedToGame` er en spion som skriver
 * varsel-raden inn i den samme falske tabellen som dedupen leser. Da beviser
 * «andre kall gir 0» at dedupen faktisk leser det første kallet skrev, ikke
 * bare at en teller ble nullstilt. `findGuestIds` kjører ekte mot dobbelen.
 */

const GAME_ID = '22222222-2222-2222-2222-222222222222';
const ORGANISER = '11111111-1111-1111-1111-111111111111';
const OLA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const GUEST = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const WITHDRAWN = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ALREADY = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

type Notification = { user_id: string; kind: string; game_id: string };

let db: {
  /** `null` = spillet finnes ikke. */
  status: string | null;
  roster: { user_id: string; withdrawn_at: string | null }[];
  guests: Set<string>;
  notifications: Notification[];
  rosterError: boolean;
};

function respond(op: QueryOp): QueryResponse {
  const value = (column: string) =>
    op.filters.find((f) => f.column === column)?.value;

  if (op.table === 'games') {
    return {
      data: db.status !== null && value('id') === GAME_ID ? { status: db.status } : null,
    };
  }
  if (op.table === 'game_players') {
    if (db.rosterError) return { data: null, error: { message: 'connection reset' } };
    const activeOnly = op.filters.some(
      (f) => f.op === 'is' && f.column === 'withdrawn_at' && f.value === null,
    );
    return {
      data: db.roster
        .filter(() => value('game_id') === GAME_ID)
        .filter((r) => !activeOnly || r.withdrawn_at === null)
        .map((r) => ({ user_id: r.user_id })),
    };
  }
  if (op.table === 'users') {
    // `findGuestIds`: `.in('id', ids).eq('is_guest', true)`.
    const ids = value('id') as string[];
    return { data: ids.filter((id) => db.guests.has(id)).map((id) => ({ id })) };
  }
  if (op.table === 'notifications') {
    const ids = value('user_id') as string[];
    return {
      data: db.notifications
        .filter(
          (n) =>
            n.kind === value('kind') &&
            n.game_id === value('payload->>game_id') &&
            ids.includes(n.user_id),
        )
        .map((n) => ({ user_id: n.user_id })),
    };
  }
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

const notifyInvitedMock = vi.fn(
  async (opts: { recipientUserId: string; gameId: string; inviterUserId: string }) => {
    // Det `notify()` gjør i databasen: én `invite`-rad per mottaker.
    db.notifications.push({ user_id: opts.recipientUserId, kind: 'invite', game_id: opts.gameId });
  },
);
vi.mock('@/lib/notifications/notifyInvitedToGame', () => ({
  notifyInvitedToGame: (opts: { recipientUserId: string; gameId: string; inviterUserId: string }) =>
    notifyInvitedMock(opts),
}));

import { revalidateTag } from 'next/cache';
import { notifyRosterInvites } from './notifyRosterInvites';

const recipients = () => notifyInvitedMock.mock.calls.map(([opts]) => opts.recipientUserId);

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = {
    status: 'scheduled',
    roster: [
      { user_id: ORGANISER, withdrawn_at: null },
      { user_id: OLA, withdrawn_at: null },
      { user_id: PER, withdrawn_at: null },
      { user_id: GUEST, withdrawn_at: null },
      { user_id: WITHDRAWN, withdrawn_at: '2026-09-27T10:00:00+00:00' },
      { user_id: ALREADY, withdrawn_at: null },
    ],
    guests: new Set([GUEST]),
    notifications: [
      { user_id: ALREADY, kind: 'invite', game_id: GAME_ID },
      // Et varsel for en ANNEN runde eller av en annen type teller ikke.
      { user_id: OLA, kind: 'invite', game_id: 'et-annet-spill' },
      { user_id: PER, kind: 'player_added', game_id: GAME_ID },
    ],
    rosterError: false,
  };
});

describe('notifyRosterInvites', () => {
  it('varsler de aktive medspillerne — ikke kalleren, gjester, trukne eller alt inviterte', async () => {
    const result = await notifyRosterInvites({ gameId: GAME_ID, inviterUserId: ORGANISER });

    expect(result).toEqual({ ok: true, invited: 2 });
    expect(recipients().sort()).toEqual([OLA, PER].sort());
    for (const [opts] of notifyInvitedMock.mock.calls) {
      expect(opts).toMatchObject({ gameId: GAME_ID, inviterUserId: ORGANISER });
    }
    expect(revalidateTag).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('et andre kall gir 0 nye varsler — dedupen leser radene det første skrev', async () => {
    await notifyRosterInvites({ gameId: GAME_ID, inviterUserId: ORGANISER });
    notifyInvitedMock.mockClear();

    const second = await notifyRosterInvites({ gameId: GAME_ID, inviterUserId: ORGANISER });

    expect(second).toEqual({ ok: true, invited: 0 });
    expect(notifyInvitedMock).not.toHaveBeenCalled();
    expect(
      db.notifications.filter((n) => n.kind === 'invite' && n.game_id === GAME_ID),
    ).toHaveLength(3);
  });

  it('dedupen spør bare etter invite-varsler for akkurat denne runden', async () => {
    await notifyRosterInvites({ gameId: GAME_ID, inviterUserId: ORGANISER });

    const lookup = fake.ops.find((op) => op.table === 'notifications');
    expect(lookup?.filters).toEqual(
      expect.arrayContaining([
        { op: 'eq', column: 'kind', value: 'invite' },
        { op: 'eq', column: 'payload->>game_id', value: GAME_ID },
      ]),
    );
  });

  it('ukjent spill → not_found, ingen varsler', async () => {
    db.status = null;

    const result = await notifyRosterInvites({ gameId: GAME_ID, inviterUserId: ORGANISER });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(notifyInvitedMock).not.toHaveBeenCalled();
    expect(fake.ops.some((op) => op.table === 'game_players')).toBe(false);
  });

  it.each(['active', 'finished'])('status %s → game_locked, ingen varsler', async (status) => {
    db.status = status;

    const result = await notifyRosterInvites({ gameId: GAME_ID, inviterUserId: ORGANISER });

    expect(result).toEqual({ ok: false, reason: 'game_locked' });
    expect(notifyInvitedMock).not.toHaveBeenCalled();
  });

  it('bare kalleren på rosteret → 0, men cachen tømmes likevel', async () => {
    db.roster = [{ user_id: ORGANISER, withdrawn_at: null }];

    const result = await notifyRosterInvites({ gameId: GAME_ID, inviterUserId: ORGANISER });

    expect(result).toEqual({ ok: true, invited: 0 });
    expect(notifyInvitedMock).not.toHaveBeenCalled();
    expect(revalidateTag).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('et roster som ikke lar seg lese KASTER — ikke «ingen å varsle»', async () => {
    db.rosterError = true;

    await expect(
      notifyRosterInvites({ gameId: GAME_ID, inviterUserId: ORGANISER }),
    ).rejects.toMatchObject({ message: 'connection reset' });
    expect(notifyInvitedMock).not.toHaveBeenCalled();
  });

  it('én mottaker som feiler stopper ikke de andre', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyInvitedMock.mockRejectedValueOnce(new Error('push nede'));

    const result = await notifyRosterInvites({ gameId: GAME_ID, inviterUserId: ORGANISER });

    expect(result).toEqual({ ok: true, invited: 1 });
    expect(notifyInvitedMock).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      '[notifyRosterInvites] invite notify failed',
      expect.objectContaining({ gameId: GAME_ID }),
    );
  });
});
