import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasskeyEnrollmentPrompt } from './PasskeyEnrollmentPrompt';

const list = vi.fn();
const registerPasskey = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({ auth: { passkey: { list }, registerPasskey } }),
}));

vi.mock('@/lib/auth/useWebAuthnSupported', () => ({
  useWebAuthnSupported: () => true,
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

const NUDGE_BODY = 'Da logger du rett inn neste gang, uten å hente kode i mailen.';

describe('PasskeyEnrollmentPrompt', () => {
  it('shows the nudge only when the user has no passkey yet', async () => {
    list.mockResolvedValue({ data: [] });
    render(<PasskeyEnrollmentPrompt />);
    expect(await screen.findByText(NUDGE_BODY)).toBeInTheDocument();
  });

  it('stays hidden when the user already has a passkey', async () => {
    list.mockResolvedValue({ data: [{ id: 'p1', created_at: '2026-06-01T00:00:00Z' }] });
    render(<PasskeyEnrollmentPrompt />);
    // Give the list() promise a tick to resolve before asserting absence.
    await Promise.resolve();
    expect(screen.queryByText(NUDGE_BODY)).toBeNull();
  });

  it('enrolls and shows the done state on tap', async () => {
    list.mockResolvedValue({ data: [] });
    registerPasskey.mockResolvedValue({ error: null });
    render(<PasskeyEnrollmentPrompt />);

    fireEvent.click(await screen.findByRole('button', { name: 'Slå på Face ID' }));

    expect(await screen.findByText('Face ID er på')).toBeInTheDocument();
    expect(registerPasskey).toHaveBeenCalledTimes(1);
  });
});
