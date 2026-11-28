// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp } from '@/lib/supabase/testing/adminClientMock';

// Type A: the paths through submitReportCore. The mail itself is Type B in
// lib/mail/contentReportNotification.test.ts.

let todayCount = 0;
const fake = createAdminClientMock({
  respond: (op: QueryOp) => {
    if (op.table === 'content_reports') return { data: null, count: todayCount };
    if (op.table === 'users' && op.filters.some((f) => f.column === 'is_admin')) {
      return { data: [{ id: 'admin-1', name: 'Sara Aune', locale: 'no' }] };
    }
    if (op.table === 'users') return { data: { name: 'Marte Lien', nickname: null } };
    if (op.table === 'games' && op.filters.some((f) => f.column === 'short_id')) {
      return { data: op.filters.some((f) => f.value === 'k7m3p9qx') ? { id: GAME } : null };
    }
    if (op.table === 'games') return { data: { name: 'Lørdagsrunden' } };
    throw new Error(`uventet tabell ${op.table}`);
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('@/lib/users/privateUserFields', () => ({
  getPrivateUserFields: async () => new Map([['admin-1', { email: 'admin@example.com' }]]),
}));
const sendMock = vi.fn(async () => {});
vi.mock('@/lib/mail/contentReportNotification', () => ({
  sendContentReportNotification: (...args: unknown[]) => sendMock(...(args as [])),
}));

import { submitReportCore, MAX_REPORTS_PER_DAY } from './submitReport';

const GAME = '22222222-2222-4222-8222-222222222222';
let insertError: { code: string; message: string } | null = null;
const inserted: unknown[] = [];
const caller = {
  from: () => ({
    insert: async (row: unknown) => {
      inserted.push(row);
      return { error: insertError };
    },
  }),
};

function deferred() {
  const tasks: (() => Promise<void>)[] = [];
  return { defer: (t: () => Promise<void>) => void tasks.push(t), run: () => Promise.all(tasks.map((t) => t())), tasks };
}

beforeEach(() => {
  fake.reset();
  todayCount = 0;
  insertError = null;
  inserted.length = 0;
  sendMock.mockClear();
});

const input = { targetUserId: null, targetGameId: GAME, targetGameShortId: null, reason: 'offensive' as const, note: 'Stygt' };

describe('submitReportCore', () => {
  it('writes the report as the caller and mails the admins afterwards', async () => {
    const later = deferred();
    expect(await submitReportCore(caller as never, 'me', input, later.defer)).toEqual({ ok: true });
    expect(inserted).toEqual([
      { reporter_id: 'me', target_user_id: null, target_game_id: GAME, reason: 'offensive', note: 'Stygt' },
    ]);
    expect(sendMock).not.toHaveBeenCalled();
    await later.run();
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@example.com', kind: 'game', target: 'Lørdagsrunden', reporterName: 'Marte Lien' }),
    );
  });

  it('refuses a report about yourself', async () => {
    const r = await submitReportCore(caller as never, 'me', { ...input, targetUserId: 'me', targetGameId: null }, deferred().defer);
    expect(r).toEqual({ ok: false, error: 'invalid' });
    expect(inserted).toHaveLength(0);
  });

  it(`stops at ${MAX_REPORTS_PER_DAY} reports in a day`, async () => {
    todayCount = MAX_REPORTS_PER_DAY;
    const later = deferred();
    expect(await submitReportCore(caller as never, 'me', input, later.defer)).toEqual({ ok: false, error: 'rate_limited' });
    expect(inserted).toHaveLength(0);
    expect(later.tasks).toHaveLength(0);
  });

  it.each([
    ['23503', 'invalid'],
    ['42501', 'db_error'],
  ])('a write error %s answers %s and sends nothing', async (code, error) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    insertError = { code, message: 'nei' };
    const later = deferred();
    expect(await submitReportCore(caller as never, 'me', input, later.defer)).toEqual({ ok: false, error });
    expect(later.tasks).toHaveLength(0);
    log.mockRestore();
  });
});

describe('submitReportCore — a round by its link id', () => {
  it('finds the round and writes its uuid', async () => {
    const later = deferred();
    const r = await submitReportCore(
      caller as never,
      'me',
      { ...input, targetGameId: null, targetGameShortId: 'k7m3p9qx' },
      later.defer,
    );
    expect(r).toEqual({ ok: true });
    expect((inserted[0] as { target_game_id: string }).target_game_id).toBe(GAME);
  });

  it('an unknown link id writes nothing', async () => {
    const r = await submitReportCore(
      caller as never,
      'me',
      { ...input, targetGameId: null, targetGameShortId: 'zzzzzzzz' },
      deferred().defer,
    );
    expect(r).toEqual({ ok: false, error: 'invalid' });
    expect(inserted).toHaveLength(0);
  });
});
