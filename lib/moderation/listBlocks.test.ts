// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp } from '@/lib/supabase/testing/adminClientMock';

let names: { id: string; name: string | null; nickname: string | null }[] = [];
const admin = createAdminClientMock({
  respond: (op: QueryOp) => {
    if (op.table === 'users') return { data: names };
    throw new Error(`uventet tabell ${op.table}`);
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => admin.client }));

let rows: { blocked_id: string; created_at: string }[] | null = [];
let rowsError: { message: string } | null = null;
const caller = createAdminClientMock({
  respond: () => ({ data: rows, error: rowsError }),
});

import { listBlocksCore } from './listBlocks';

beforeEach(() => {
  admin.reset();
  caller.reset();
  rows = [];
  rowsError = null;
  names = [];
});

describe('listBlocksCore (#3019)', () => {
  it('reads the caller\'s own rows and adds the names', async () => {
    rows = [{ blocked_id: 'kh', created_at: '2026-11-28T10:00:00Z' }];
    names = [{ id: 'kh', name: 'Kristian Holm', nickname: null }];
    expect(await listBlocksCore(caller.client as never, 'me')).toEqual({
      ok: true,
      blocks: [{ userId: 'kh', name: 'Kristian Holm', blockedAt: '2026-11-28T10:00:00Z' }],
    });
    expect(caller.ops[0].filters).toContainEqual(expect.objectContaining({ column: 'blocker_id', value: 'me' }));
  });

  it('an empty list asks for no names', async () => {
    expect(await listBlocksCore(caller.client as never, 'me')).toEqual({ ok: true, blocks: [] });
    expect(admin.ops).toHaveLength(0);
  });

  it('a failed read is a failure, not an empty list', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    rows = null;
    rowsError = { message: 'nede' };
    expect(await listBlocksCore(caller.client as never, 'me')).toEqual({ ok: false });
    log.mockRestore();
  });
});
