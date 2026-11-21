import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const rpcMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ rpc: rpcMock }),
}));

import { findForeignGuestIds, withoutForeignGuests } from './guestOwnership';

beforeEach(() => {
  rpcMock.mockReset();
});

describe('findForeignGuestIds (0251)', () => {
  it('asks the database rule for the actor and the ids, and returns its answer', async () => {
    rpcMock.mockResolvedValueOnce({ data: ['g2'], error: null });

    await expect(findForeignGuestIds('actor-1', ['g1', 'g2', 'u1'])).resolves.toEqual(
      new Set(['g2']),
    );
    expect(rpcMock).toHaveBeenCalledWith('foreign_guest_ids', {
      p_actor: 'actor-1',
      p_ids: ['g1', 'g2', 'u1'],
    });
  });

  it('no ids: no lookup', async () => {
    await expect(findForeignGuestIds('actor-1', [])).resolves.toEqual(new Set());
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('a failed lookup throws, so a write path refuses', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'down' } });

    await expect(findForeignGuestIds('actor-1', ['g1'])).rejects.toThrow(/down/);
  });
});

describe('withoutForeignGuests (0251)', () => {
  const rows = [
    { id: 'u1', isGuest: false },
    { id: 'g-mine', isGuest: true },
    { id: 'g-theirs', isGuest: true },
    { id: 'u2' },
  ];

  it('leaves out only the guests the actor may not use', async () => {
    rpcMock.mockResolvedValueOnce({ data: ['g-theirs'], error: null });

    const kept = await withoutForeignGuests('actor-1', rows);

    expect(kept.map((r) => r.id)).toEqual(['u1', 'g-mine', 'u2']);
    // Only the guests are asked about.
    expect(rpcMock).toHaveBeenCalledWith('foreign_guest_ids', {
      p_actor: 'actor-1',
      p_ids: ['g-mine', 'g-theirs'],
    });
  });

  it('no guests in the list: no lookup, the same rows', async () => {
    const plain = [{ id: 'u1' }, { id: 'u2', isGuest: false }];

    await expect(withoutForeignGuests('actor-1', plain)).resolves.toEqual(plain);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('a failed lookup leaves every guest out and keeps the others', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'down' } });

    const kept = await withoutForeignGuests('actor-1', rows);

    expect(kept.map((r) => r.id)).toEqual(['u1', 'u2']);
    errorSpy.mockRestore();
  });
});
