import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegistrationForm } from './RegistrationForm';

const registerForOpenGameMock = vi.fn();
const requestApprovalMock = vi.fn();

vi.mock('./actions', () => ({
  registerForOpenGame: (...args: unknown[]) => registerForOpenGameMock(...args),
  requestApproval: (...args: unknown[]) => requestApprovalMock(...args),
}));

const SHORT_ID = 'abc12345';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RegistrationForm — open-modus', () => {
  it('viser «Meld meg på»-knapp uten message-felt', () => {
    render(<RegistrationForm mode="open" shortId={SHORT_ID} />);
    expect(
      screen.getByRole('button', { name: 'Meld meg på' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/hilsen/i)).not.toBeInTheDocument();
  });

  it('submitter form med shortId i FormData', async () => {
    registerForOpenGameMock.mockResolvedValue({ ok: true });
    render(<RegistrationForm mode="open" shortId={SHORT_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Meld meg på' }));

    await waitFor(() => {
      expect(registerForOpenGameMock).toHaveBeenCalledTimes(1);
    });
    const formData = registerForOpenGameMock.mock.calls[0]?.[0] as FormData;
    expect(formData.get('shortId')).toBe(SHORT_ID);
  });

  it('viser error-banner ved already_registered', async () => {
    registerForOpenGameMock.mockResolvedValue({
      ok: false,
      error: 'already_registered',
    });
    render(<RegistrationForm mode="open" shortId={SHORT_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Meld meg på' }));

    expect(
      await screen.findByText(/allerede påmeldt/i),
    ).toBeInTheDocument();
  });
});

describe('RegistrationForm — manual_approval-modus', () => {
  it('viser message-textarea + «Send forespørsel»-knapp', () => {
    render(<RegistrationForm mode="manual_approval" shortId={SHORT_ID} />);
    expect(screen.getByText(/Valgfri hilsen/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Send forespørsel' }),
    ).toBeInTheDocument();
  });

  it('viser tegn-teller for message', () => {
    render(<RegistrationForm mode="manual_approval" shortId={SHORT_ID} />);
    const textarea = screen.getByPlaceholderText(/Hei!/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hei på deg' } });
    expect(screen.getByText('10/200')).toBeInTheDocument();
  });

  it('viser kvittering etter vellykket request', async () => {
    requestApprovalMock.mockResolvedValue({ ok: true });
    render(<RegistrationForm mode="manual_approval" shortId={SHORT_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Send forespørsel' }));

    expect(
      await screen.findByText(/Forespørsel sendt/i),
    ).toBeInTheDocument();
  });

  it('viser error-banner ved already_requested', async () => {
    requestApprovalMock.mockResolvedValue({
      ok: false,
      error: 'already_requested',
    });
    render(<RegistrationForm mode="manual_approval" shortId={SHORT_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Send forespørsel' }));

    expect(
      await screen.findByText(/allerede sendt/i),
    ).toBeInTheDocument();
  });
});
