import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Del-tellingen (#2130). Tre regler er verdt å holde vakt over:
 *
 *   - `user_id` kommer fra sesjonen, aldri fra argumentene
 *   - en ukjent kort-slug skrives ikke
 *   - en skriving som traff null rader er en FEIL, ikke en suksess (felle 2)
 */

const userIdMock = vi.fn<() => Promise<string | null>>(async () => USER_ID);
vi.mock('@/lib/auth/userId', () => ({
  getProxyVerifiedUserId: () => userIdMock(),
}));

type InsertResult = { data: { id: string }[] | null; error: { message: string } | null };

const insertMock = vi.fn<(row: Record<string, unknown>) => void>();
let insertResult: InsertResult = { data: [{ id: 'row-1' }], error: null };

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        insertMock({ table, ...row });
        return { select: () => insertResult };
      },
    }),
  }),
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';

import { logKavalkadeShare } from './shareActions';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  userIdMock.mockResolvedValue(USER_ID);
  insertResult = { data: [{ id: 'row-1' }], error: null };
});

describe('logKavalkadeShare', () => {
  it('skriver én rad med spilleren fra sesjonen', async () => {
    await expect(logKavalkadeShare(2026, 'best-round')).resolves.toEqual({ ok: true });
    expect(insertMock).toHaveBeenCalledWith({
      table: 'kavalkade_shares',
      user_id: USER_ID,
      year: 2026,
      card_kind: 'best-round',
    });
  });

  it('teller ingenting uten innlogging', async () => {
    userIdMock.mockResolvedValue(null);
    await expect(logKavalkadeShare(2026, 'team')).resolves.toEqual({
      ok: false,
      error: 'not_authed',
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('avviser en kort-slug ruta ikke kjenner', async () => {
    await expect(logKavalkadeShare(2026, 'beste-runde')).resolves.toEqual({
      ok: false,
      error: 'unknown_card',
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('avviser et år som ikke er et helt tall', async () => {
    await expect(logKavalkadeShare(2026.5, 'team')).resolves.toEqual({
      ok: false,
      error: 'unknown_card',
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('kaller en null-rads skriving en feil, ikke en suksess', async () => {
    insertResult = { data: [], error: null };
    await expect(logKavalkadeShare(2026, 'gang-winner')).resolves.toEqual({
      ok: false,
      error: 'db_error',
    });
  });

  it('svelger en databasefeil, men logger den', async () => {
    insertResult = { data: null, error: { message: 'connection reset' } };
    await expect(logKavalkadeShare(2026, 'rival')).resolves.toEqual({
      ok: false,
      error: 'db_error',
    });
    expect(console.error).toHaveBeenCalled();
  });
});
