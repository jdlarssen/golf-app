import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PasskeyLoginButton } from './PasskeyLoginButton';

const signInWithPasskey = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({ auth: { signInWithPasskey } }),
}));

// The button only renders where WebAuthn exists; force that on in tests.
let supported = true;
vi.mock('@/lib/auth/useWebAuthnSupported', () => ({
  useWebAuthnSupported: () => supported,
}));

const assign = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  supported = true;
  Object.defineProperty(window, 'location', {
    value: { assign, href: 'http://localhost/login' },
    writable: true,
  });
});

describe('PasskeyLoginButton', () => {
  it('renders nothing when WebAuthn is unsupported', () => {
    supported = false;
    const { container } = render(<PasskeyLoginButton next="/spill" />);
    expect(container.firstChild).toBeNull();
  });

  it('hard-navigates to next on a successful sign-in', async () => {
    signInWithPasskey.mockResolvedValue({
      data: { session: { access_token: 'x' }, user: { id: 'u1' } },
      error: null,
    });
    render(<PasskeyLoginButton next="/spill" />);

    fireEvent.click(screen.getByRole('button', { name: 'Logg inn med Face ID' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/spill'));
    expect(signInWithPasskey).toHaveBeenCalledTimes(1);
  });

  it('falls back to the code and does not navigate when no passkey exists', async () => {
    signInWithPasskey.mockResolvedValue({
      data: null,
      error: { code: 'webauthn_credential_not_found' },
    });
    render(<PasskeyLoginButton next="/spill" />);

    fireEvent.click(screen.getByRole('button', { name: 'Logg inn med Face ID' }));

    expect(
      await screen.findByText('Fant ingen Face ID på denne enheten. Bruk koden i stedet.'),
    ).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });
});
