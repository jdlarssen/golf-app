// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A: the monthly newsletter (0246). The month is claimed before anything
 * is sent, each recipient is claimed before their one send, a failed send gives
 * the recipient back, and every read error throws. The mail itself has its own
 * suite (`lib/mail/productUpdateDigest.test.ts`).
 */

type Db = {
  updates: Record<string, unknown>[];
  updatesError: boolean;
  /** The month's row when it is already there, else the insert wins. */
  existingDigest: { id: string; sent_at: string; completed_at: string | null } | null;
  existingReadError: boolean;
  users: Record<string, unknown>[];
  usersError: boolean;
};
let db: Db;
const reached = new Set<string>();
/** Users another run holds the claim for and then releases: the insert says duplicate, no row stays. */
const heldThenReleased = new Set<string>();

const DIGEST = { id: 'digest-1', sent_at: '2026-11-01T07:00:00.000Z', completed_at: null };

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'product_updates') {
    return db.updatesError ? { error: { message: 'boom' } } : { data: db.updates };
  }
  if (op.table === 'product_update_digests' && op.kind === 'insert') {
    return db.existingDigest
      ? { error: { message: 'duplicate key value violates unique constraint', code: '23505' } as never }
      : { data: DIGEST };
  }
  if (op.table === 'product_update_digests' && op.kind === 'select') {
    return db.existingReadError ? { error: { message: 'timeout' } } : { data: db.existingDigest };
  }
  if (op.table === 'product_update_digests' && op.kind === 'update') return { data: null };
  if (op.table === 'users') {
    if (db.usersError) return { error: { message: 'boom' } };
    return { data: op.range?.[0] === 0 ? db.users : [] };
  }
  if (op.table === 'product_update_digest_recipients') {
    const userId = op.payload?.user_id as string | undefined;
    if (op.kind === 'insert') {
      if (heldThenReleased.has(userId!)) {
        return { error: { message: 'duplicate key value', code: '23505' } as never };
      }
      if (reached.has(userId!)) {
        return { error: { message: 'duplicate key value', code: '23505' } as never };
      }
      reached.add(userId!);
      return { data: null };
    }
    if (op.kind === 'delete') {
      reached.delete(op.filters.find((f) => f.column === 'user_id')!.value as string);
      return { data: null };
    }
    return { data: op.range?.[0] === 0 ? [...reached].map((user_id) => ({ user_id })) : [] };
  }
  throw new Error(`unexpected query: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('@/lib/mail/productUpdateDigest', () => ({ sendProductUpdateDigest: vi.fn(async () => {}) }));
vi.mock('./unsubscribeToken', () => ({ signUnsubToken: (id: string) => `token-${id}` }));

import { sendProductUpdateDigest } from '@/lib/mail/productUpdateDigest';
import { MailSendError } from '@/lib/mail/send';
import { osloMonthStartIso, previousMonthPeriod, sendDigestForPeriod } from './digest';

const mailMock = vi.mocked(sendProductUpdateDigest);
const NOV_1 = Date.UTC(2026, 10, 1, 8);
const user = (id: string) => ({ id, name: `${id} Nordmann`, email: `${id}@example.test`, locale: 'no' });
const run = () => sendDigestForPeriod({ sentByUserId: null, nowMs: NOV_1 });
const writes = (table: string, kind: QueryOp['kind']) =>
  fake.ops.filter((op) => op.table === table && op.kind === kind);

beforeEach(() => {
  vi.clearAllMocks();
  mailMock.mockReset();
  fake.reset();
  reached.clear();
  heldThenReleased.clear();
  db = {
    updates: [{ id: 'pu1', title: 'Nytt', body: 'Tekst', link: null, cta_label: null }],
    updatesError: false,
    existingDigest: null,
    existingReadError: false,
    users: [user('ada'), user('bo')],
    usersError: false,
  };
});

describe('previousMonthPeriod', () => {
  it('mai-1 → forrige måned er april', () => {
    // 1. mai 2026 kl. 09:00 Europe/Oslo = 07:00 UTC
    const may1 = Date.UTC(2026, 4, 1, 7, 0, 0);
    const result = previousMonthPeriod(may1);
    expect(result.periodStart).toBe('2026-04-01');
    expect(result.periodEnd).toBe('2026-04-30');
    expect(result.periodLabel).toBe('april 2026');
  });

  it('jan-1 → forrige måned er desember året før', () => {
    // 1. januar 2027 kl. 09:00 Europe/Oslo = 08:00 UTC (CET vinter)
    const jan1 = Date.UTC(2027, 0, 1, 8, 0, 0);
    const result = previousMonthPeriod(jan1);
    expect(result.periodStart).toBe('2026-12-01');
    expect(result.periodEnd).toBe('2026-12-31');
    expect(result.periodLabel).toBe('desember 2026');
  });

  it('mars-1 → forrige måned er februar (28 dager i ikke-skuddår)', () => {
    const mar1_2026 = Date.UTC(2026, 2, 1, 8, 0, 0);
    const result = previousMonthPeriod(mar1_2026);
    expect(result.periodStart).toBe('2026-02-01');
    expect(result.periodEnd).toBe('2026-02-28');
  });

  it('mars-1 i skuddår → februar 29 dager', () => {
    // 2028 is a leap year (divisible by 4, not by 100)
    const mar1_2028 = Date.UTC(2028, 2, 1, 8, 0, 0);
    const result = previousMonthPeriod(mar1_2028);
    expect(result.periodStart).toBe('2028-02-01');
    expect(result.periodEnd).toBe('2028-02-29');
  });

  it('mid-måned → forrige hele kalendermåned (ikke rullende 30 dager)', () => {
    // 15. mai 2026 → forrige måned er april (ikke 15.apr–15.mai)
    const mid_may = Date.UTC(2026, 4, 15, 12, 0, 0);
    const result = previousMonthPeriod(mid_may);
    expect(result.periodStart).toBe('2026-04-01');
    expect(result.periodEnd).toBe('2026-04-30');
  });
});

describe('osloMonthStartIso', () => {
  it('a winter month starts at 23:00 UTC the day before, a summer month at 22:00', () => {
    expect(osloMonthStartIso(2026, 11)).toBe('2026-10-31T23:00:00.000Z');
    expect(osloMonthStartIso(2026, 10)).toBe('2026-09-30T22:00:00.000Z');
    expect(osloMonthStartIso(2026, 4)).toBe('2026-03-31T22:00:00.000Z');
    expect(osloMonthStartIso(2026, 3)).toBe('2026-02-28T23:00:00.000Z');
  });
});

describe('sendDigestForPeriod', () => {
  it('reads the updates of the Oslo month, not the UTC month', async () => {
    await run();
    const read = fake.ops.find((op) => op.table === 'product_updates')!;
    expect(read.filters).toEqual([
      { op: 'gte', column: 'created_at', value: '2026-09-30T22:00:00.000Z' },
      { op: 'lt', column: 'created_at', value: '2026-10-31T23:00:00.000Z' },
    ]);
  });

  it('claims the month before the first send, then marks it finished', async () => {
    const claimedBeforeSend: boolean[] = [];
    mailMock.mockImplementation(async () => {
      claimedBeforeSend.push(writes('product_update_digests', 'insert').length === 1);
    });

    await expect(run()).resolves.toMatchObject({ kind: 'sent', recipientCount: 2, failedCount: 0 });

    expect(claimedBeforeSend).toEqual([true, true]);
    expect(writes('product_update_digests', 'insert')[0]!.payload).toMatchObject({
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      recipient_count: 0,
      update_ids: ['pu1'],
    });
    const [close] = writes('product_update_digests', 'update');
    expect(close!.payload).toMatchObject({ recipient_count: 2, completed_at: expect.any(String) });
  });

  it('a finished month is not sent again', async () => {
    db.existingDigest = { ...DIGEST, completed_at: '2026-11-01T07:05:00.000Z' };
    await expect(run()).resolves.toMatchObject({ kind: 'already_sent' });
    expect(mailMock).not.toHaveBeenCalled();
  });

  it('a failed lookup of the month throws and sends nothing', async () => {
    db.existingDigest = DIGEST;
    db.existingReadError = true;
    await expect(run()).rejects.toThrow(/timeout/);
    expect(mailMock).not.toHaveBeenCalled();
  });

  it('a failed read of the updates throws, and nothing is claimed', async () => {
    db.updatesError = true;
    await expect(run()).rejects.toThrow(/boom/);
    expect(writes('product_update_digests', 'insert')).toEqual([]);
  });

  it('two runs at once: a recipient the other run has is skipped, so nobody gets it twice', async () => {
    db.existingDigest = DIGEST;
    reached.add('ada');
    await run();
    expect(mailMock.mock.calls.map((c) => c[0].to)).toEqual(['bo@example.test']);
  });

  it('a failed send gives the recipient back, leaves the month open, and the next run sends only to them', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mailMock.mockImplementation(async (p) => {
      if (p.to === 'bo@example.test') throw new Error('rate limited');
    });

    await expect(run()).resolves.toMatchObject({ kind: 'sent', recipientCount: 1, failedCount: 1 });
    const [close] = writes('product_update_digests', 'update');
    expect(close!.payload).toEqual({ recipient_count: 1, completed_at: null });

    // Day 2: the month is there and still open.
    mailMock.mockReset();
    fake.reset();
    db.existingDigest = DIGEST;
    await expect(run()).resolves.toMatchObject({ kind: 'sent', recipientCount: 2, failedCount: 0 });
    expect(mailMock.mock.calls.map((c) => c[0].to)).toEqual(['bo@example.test']);
    err.mockRestore();
  });

  it('Resend refused the send: the recipient is given back for the next run', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mailMock.mockImplementation(async (p) => {
      if (p.to === 'bo@example.test') {
        throw new MailSendError('Resend send failed: invalid', { outcome: 'not_sent', statusCode: 422 });
      }
    });
    await expect(run()).resolves.toMatchObject({ recipientCount: 1, failedCount: 1, unknownCount: 0 });
    expect(reached.has('bo')).toBe(false);
    expect(writes('product_update_digests', 'update')[0]!.payload).toEqual({ recipient_count: 1, completed_at: null });
    err.mockRestore();
  });

  it('an unknown outcome (network failure) keeps the recipient, so the mail is never sent twice', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mailMock.mockImplementation(async (p) => {
      if (p.to === 'bo@example.test') {
        throw new MailSendError('Resend send failed: fetch failed', { outcome: 'unknown' });
      }
    });
    await expect(run()).resolves.toMatchObject({ recipientCount: 2, failedCount: 0, unknownCount: 1 });
    expect(writes('product_update_digest_recipients', 'delete')).toEqual([]);
    // Nobody is left to try: the month is finished.
    expect(writes('product_update_digests', 'update')[0]!.payload).toMatchObject({ completed_at: expect.any(String) });

    // Day 2 sends nothing.
    mailMock.mockReset();
    fake.reset();
    db.existingDigest = DIGEST;
    await run();
    expect(mailMock).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('a recipient another run skipped past and then released keeps the month open', async () => {
    db.existingDigest = DIGEST;
    heldThenReleased.add('ada');
    await expect(run()).resolves.toMatchObject({ recipientCount: 1, failedCount: 0 });
    expect(mailMock.mock.calls.map((c) => c[0].to)).toEqual(['bo@example.test']);
    expect(writes('product_update_digests', 'update')[0]!.payload).toEqual({ recipient_count: 1, completed_at: null });
  });

  it('a later run reaches only users who existed when the month was claimed', async () => {
    db.existingDigest = DIGEST;
    await run();
    const read = fake.ops.find((op) => op.table === 'users')!;
    expect(read.filters).toContainEqual({ op: 'lte', column: 'created_at', value: DIGEST.sent_at });
  });

  it('no updates in the month: nothing is claimed or sent', async () => {
    db.updates = [];
    await expect(run()).resolves.toMatchObject({ kind: 'no_updates' });
    expect(writes('product_update_digests', 'insert')).toEqual([]);
  });
});

describe('sendDigestForPeriod — feilet brukerlesing (#2227)', () => {
  it('avviser og sender ingenting når mottakerlista ikke kan leses', async () => {
    db.usersError = true;
    await expect(run()).rejects.toThrow(/boom/);
    expect(mailMock).not.toHaveBeenCalled();
    // The month stays open, so the next day's run sends it.
    expect(writes('product_update_digests', 'update')).toEqual([]);
  });
});
