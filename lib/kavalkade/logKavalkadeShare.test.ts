// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2265): kjernen bak del-tellingen, delt av webbens server-action og
 * appens rute. Tre regler er verdt å holde vakt over:
 *
 *   - raden skrives med spilleren kallstedet ga — ingen annen kilde
 *   - en ukjent kort-slug eller et år som ikke er et helt tall skrives ikke
 *   - en skriving som traff null rader er en FEIL, ikke en suksess (felle 2)
 */

const USER_ID = '11111111-1111-1111-1111-111111111111';

let insertResponse: QueryResponse;

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'kavalkade_shares' && op.kind === 'insert') return insertResponse;
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));

import { logKavalkadeShareFor } from './logKavalkadeShare';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fake.reset();
  insertResponse = { data: [{ id: 'row-1' }] };
});

describe('logKavalkadeShareFor', () => {
  it('skriver én rad med spilleren kallstedet ga', async () => {
    await expect(logKavalkadeShareFor(USER_ID, 2026, 'best-round')).resolves.toEqual({
      ok: true,
    });
    expect(fake.ops).toEqual([
      expect.objectContaining({
        table: 'kavalkade_shares',
        kind: 'insert',
        payload: { user_id: USER_ID, year: 2026, card_kind: 'best-round' },
      }),
    ]);
  });

  it.each([
    ['en ukjent kort-slug', 2026, 'beste-runde'],
    ['en tom kort-slug', 2026, ''],
    ['et år som ikke er et helt tall', 2026.5, 'team'],
    ['et år som ikke er et tall', Number.NaN, 'team'],
  ])('%s: unknown_card, ingenting skrives', async (_navn, year, cardKind) => {
    await expect(logKavalkadeShareFor(USER_ID, year, cardKind)).resolves.toEqual({
      ok: false,
      error: 'unknown_card',
    });
    expect(fake.ops).toEqual([]);
  });

  it('kaller en null-rads skriving en feil, ikke en suksess', async () => {
    insertResponse = { data: [] };
    await expect(logKavalkadeShareFor(USER_ID, 2026, 'gang-winner')).resolves.toEqual({
      ok: false,
      error: 'db_error',
    });
    expect(console.error).toHaveBeenCalled();
  });

  it('svelger en databasefeil, men logger den', async () => {
    insertResponse = { data: null, error: { message: 'connection reset' } };
    await expect(logKavalkadeShareFor(USER_ID, 2026, 'rival')).resolves.toEqual({
      ok: false,
      error: 'db_error',
    });
    expect(console.error).toHaveBeenCalledWith(
      '[logKavalkadeShare] could not record the share',
      expect.objectContaining({ year: 2026, cardKind: 'rival' }),
    );
  });
});
