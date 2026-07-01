import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PasskeySettings } from './PasskeySettings';

const list = vi.fn();
const del = vi.fn();
const registerPasskey = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({
    auth: { passkey: { list, delete: del, update: vi.fn() }, registerPasskey },
  }),
}));

vi.mock('@/lib/auth/useWebAuthnSupported', () => ({
  useWebAuthnSupported: () => true,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PasskeySettings', () => {
  it('lists enrolled passkeys by their friendly name', async () => {
    list.mockResolvedValue({
      data: [{ id: 'p1', friendly_name: 'iCloud Keychain', created_at: '2026-06-01T00:00:00Z' }],
    });
    render(<PasskeySettings />);
    expect(await screen.findByText('iCloud Keychain')).toBeInTheDocument();
  });

  it('deletes a passkey after confirmation', async () => {
    list
      .mockResolvedValueOnce({
        data: [{ id: 'p1', friendly_name: 'iCloud Keychain', created_at: '2026-06-01T00:00:00Z' }],
      })
      .mockResolvedValueOnce({ data: [] });
    del.mockResolvedValue({ error: null });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PasskeySettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Fjern' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith({ passkeyId: 'p1' }));
  });
});
