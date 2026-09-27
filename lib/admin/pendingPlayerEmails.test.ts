import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';

// Type A (#2207): the `pending=` query parameter is user input. Only uuids
// reach the lookup, at most 50, and the banner text keeps the id order.

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

let rows: Array<{ id: string; email: string | null }> = [];
let failWith: { message: string } | null = null;
const fake = createAdminClientMock({
  respond: () => (failWith ? { error: failWith } : { data: rows }),
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

import { pendingPlayerList } from './pendingPlayerEmails';

beforeEach(() => {
  fake.reset();
  failWith = null;
  rows = [
    { id: B, email: 'b@example.test' },
    { id: A, email: 'a@example.test' },
  ];
});

describe('pendingPlayerList', () => {
  it('names the addresses in the order of the ids', async () => {
    expect(await pendingPlayerList(`${A},${B}`)).toBe(': a@example.test, b@example.test');
  });

  it('drops anything that is not a uuid, and never queries for nothing', async () => {
    expect(await pendingPlayerList('ola@example.test,1 or 1=1,')).toBe('');
    expect(fake.ops).toEqual([]);
    expect(await pendingPlayerList(undefined)).toBe('');
  });

  it('looks up at most 50 ids', async () => {
    const many = Array.from(
      { length: 60 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    await pendingPlayerList(many.join(','));
    const ids = fake.ops[0]?.filters.find((f) => f.op === 'in')?.value as string[];
    expect(ids).toHaveLength(50);
  });

  it('names nobody when the lookup fails', async () => {
    failWith = { message: 'boom' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await pendingPlayerList(A)).toBe('');
  });
});
