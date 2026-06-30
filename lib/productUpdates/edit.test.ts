import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ rpc: rpcMock }),
}));

import { editProductUpdate } from './edit';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('editProductUpdate', () => {
  it('calls the edit_product_update RPC with p_-prefixed args and returns the count', async () => {
    rpcMock.mockResolvedValueOnce({ data: 3, error: null });

    const res = await editProductUpdate({
      id: 'pu-1',
      title: 'T',
      body: 'B',
      link: '/x',
      cta_label: 'Se',
    });

    expect(rpcMock).toHaveBeenCalledWith('edit_product_update', {
      p_id: 'pu-1',
      p_title: 'T',
      p_body: 'B',
      p_link: '/x',
      p_cta_label: 'Se',
    });
    expect(res).toEqual({ notificationCount: 3 });
  });

  it('passes null link/cta straight through (cleared fields)', async () => {
    rpcMock.mockResolvedValueOnce({ data: 0, error: null });

    await editProductUpdate({
      id: 'pu-2',
      title: 'T',
      body: 'B',
      link: null,
      cta_label: null,
    });

    expect(rpcMock).toHaveBeenCalledWith('edit_product_update', {
      p_id: 'pu-2',
      p_title: 'T',
      p_body: 'B',
      p_link: null,
      p_cta_label: null,
    });
  });

  it('coerces a null count to 0', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    const res = await editProductUpdate({
      id: 'pu-4',
      title: 'T',
      body: 'B',
      link: null,
      cta_label: null,
    });
    expect(res).toEqual({ notificationCount: 0 });
  });

  it('throws when the RPC returns an error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

    await expect(
      editProductUpdate({ id: 'pu-3', title: 'T', body: 'B', link: null, cta_label: null }),
    ).rejects.toThrow(/boom/);
  });
});
