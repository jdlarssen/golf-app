import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2749): the entry-fee core. The counts are the web's (the Betaling
 * card and the «Purr»-button), the write must hit a row, and the reminder
 * reaches only the unpaid, unwithdrawn non-guests.
 */

let respond: (op: QueryOp) => QueryResponse = () => ({ data: null });
const fake = createAdminClientMock({ tokens: {}, respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('@/lib/notifications/paymentReminder', () => ({ sendPaymentReminder: vi.fn() }));
vi.mock('@/lib/admin/auditLog', () => ({ logAdminEvent: vi.fn() }));
vi.mock('@/lib/games/expireGameCache', () => ({ expireGameCache: vi.fn() }));

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { logAdminEvent } from '@/lib/admin/auditLog';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { sendPaymentReminder } from '@/lib/notifications/paymentReminder';
import { isRemindable, paymentCounts, paymentRoster, remindUnpaidPlayers, setPlayerPaid } from './payments';

const client = fake.client as unknown as SupabaseClient<Database>;

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
});

describe('paymentCounts', () => {
  const p = (paid: boolean, withdrawn = false, isGuest = false) => ({ paid, withdrawn, isGuest });

  it('ingen spillere gir nuller', () => {
    expect(paymentCounts([])).toEqual({ paidCount: 0, totalCount: 0, remindable: 0 });
  });

  it('betalt og påmeldt teller ikke trukne; purrbare er ubetalte ikke-gjester som ikke har trukket seg', () => {
    expect(
      paymentCounts([p(true), p(true), p(false), p(false), p(false, false, true), p(false, true), p(true, true)]),
    ).toEqual({ paidCount: 2, totalCount: 5, remindable: 2 });
  });

  it.each([
    [p(false), true],
    [p(true), false],
    [p(false, true), false],
    [p(false, false, true), false],
  ])('isRemindable(%j) er %s', (player, expected) => {
    expect(isRemindable(player)).toBe(expected);
  });
});

describe('paymentRoster', () => {
  it('navn med kallenavn som på nettet, og null når profilen ikke kan leses', async () => {
    respond = (op) =>
      op.table === 'games'
        ? { data: { name: 'Lørdagsrunden', entry_fee_kr: 200 } }
        : {
            data: [
              { user_id: 'a', paid_at: 'x', withdrawn_at: null, users: { name: 'Ada', nickname: 'Albatross', is_guest: false } },
              { user_id: 'b', paid_at: null, withdrawn_at: null, users: null },
            ],
          };
    const roster = await paymentRoster(client, 'g');
    expect(roster?.players.map((r) => r.name)).toEqual(['Ada «Albatross»', null]);
    expect(roster).toMatchObject({ entryFeeKr: 200, paidCount: 1, totalCount: 2, remindable: 1 });
  });

  it('et spill som ikke kan leses gir null; en lesefeil kaster', async () => {
    respond = () => ({ data: null });
    expect(await paymentRoster(client, 'g')).toBeNull();
    respond = (op) => (op.table === 'games' ? { data: { name: 'X', entry_fee_kr: 1 } } : { data: null, error: { message: 'boom' } });
    await expect(paymentRoster(client, 'g')).rejects.toBeTruthy();
  });
});

describe('setPlayerPaid', () => {
  const actor = { id: 'arr', name: 'Sofie' };

  it('0 rader er en feil (felle 2): ingen audit, ingen cache', async () => {
    respond = () => ({ data: [] });
    await expect(setPlayerPaid(client, { gameId: 'g', userId: 'u', paid: true, actor })).rejects.toThrow();
    expect(logAdminEvent).not.toHaveBeenCalled();
    expect(expireGameCache).not.toHaveBeenCalled();
  });

  it('en treff setter paid_at, logger og tømmer cachen; av setter null', async () => {
    respond = () => ({ data: [{ user_id: 'u' }] });
    await setPlayerPaid(client, { gameId: 'g', userId: 'u', paid: true, actor });
    await setPlayerPaid(client, { gameId: 'g', userId: 'u', paid: false, actor });
    const updates = fake.ops.filter((op) => op.kind === 'update');
    expect(updates[0].payload?.paid_at).toEqual(expect.any(String));
    expect(updates[1].payload?.paid_at).toBeNull();
    expect(vi.mocked(logAdminEvent).mock.calls.map((c) => c[0].eventType)).toEqual([
      'game.player_marked_paid',
      'game.player_marked_unpaid',
    ]);
    expect(expireGameCache).toHaveBeenCalledWith('g');
  });
});

describe('remindUnpaidPlayers', () => {
  const user = (is_guest = false) => ({ email: 'spiller@example.test', name: 'N', locale: 'no', is_guest });

  it('når bare ubetalte som ikke har trukket seg og ikke er gjester', async () => {
    respond = (op) =>
      op.table === 'games'
        ? { data: { id: 'g', name: 'Runden', status: 'scheduled', entry_fee_kr: 250, payment_link: null } }
        : {
            data: [
              { user_id: 'ubetalt', paid_at: null, withdrawn_at: null, users: user() },
              { user_id: 'betalt', paid_at: 'x', withdrawn_at: null, users: user() },
              { user_id: 'trukket', paid_at: null, withdrawn_at: 'x', users: user() },
              { user_id: 'gjest', paid_at: null, withdrawn_at: null, users: user(true) },
            ],
          };
    expect(await remindUnpaidPlayers(client, 'g')).toEqual({ count: 1 });
    expect(vi.mocked(sendPaymentReminder).mock.calls.map((c) => c[0].player.userId)).toEqual(['ubetalt']);
  });

  it('uten kontingent purres ingen', async () => {
    respond = () => ({ data: { id: 'g', name: 'R', status: 'scheduled', entry_fee_kr: 0, payment_link: null } });
    expect(await remindUnpaidPlayers(client, 'g')).toEqual({ count: 0 });
    expect(sendPaymentReminder).not.toHaveBeenCalled();
  });
});
