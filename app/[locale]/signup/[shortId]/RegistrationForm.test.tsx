import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegistrationForm, type MatchplaySideData } from './RegistrationForm';

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

// ── Matchplay side-velger (#544) ──────────────────────────────────────────────

describe('RegistrationForm — matchplay side-velger', () => {
  const sideData: MatchplaySideData = {
    teamSize: 1,
    side1: { count: 1, playerNames: ['Per Balle'] },
    side2: { count: 0, playerNames: [] },
  };

  it('viser side-kort med «Meld meg på»-knapp; side 2 forhåndsvalgt (kun ledig side)', async () => {
    registerForOpenGameMock.mockResolvedValue({ ok: true });
    render(
      <RegistrationForm mode="open" shortId={SHORT_ID} sideData={sideData} />,
    );

    // Begge side-knappene finnes
    expect(screen.getByRole('radio', { name: /Side 1/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Side 2/i })).toBeInTheDocument();

    // Side 1 er full → disabled
    expect(screen.getByRole('radio', { name: /Side 1/i })).toBeDisabled();

    // Side 2 er forhåndsvalgt (eneste med plass)
    expect(screen.getByRole('radio', { name: /Side 2/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // Per Balle vises som eksisterende spiller på side 1
    expect(screen.getByText('Per Balle')).toBeInTheDocument();

    // «Meld meg på»-knapp finnes og er aktiv
    const btn = screen.getByRole('button', { name: 'Meld meg på' });
    expect(btn).toBeEnabled();

    // Submit sender formData med side=2
    fireEvent.click(btn);
    await waitFor(() => {
      expect(registerForOpenGameMock).toHaveBeenCalledTimes(1);
    });
    const formData = registerForOpenGameMock.mock.calls[0]?.[0] as FormData;
    expect(formData.get('side')).toBe('2');
  });

  it('begge sider fulle → viser «Spillet er fullt»-banner, ingen knapp', () => {
    const fullData: MatchplaySideData = {
      teamSize: 1,
      side1: { count: 1, playerNames: ['A'] },
      side2: { count: 1, playerNames: ['B'] },
    };
    render(
      <RegistrationForm mode="open" shortId={SHORT_ID} sideData={fullData} />,
    );
    expect(screen.getByText(/Spillet er fullt/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Meld meg på/i }),
    ).not.toBeInTheDocument();
  });

  it('side_full error-melding vises', async () => {
    registerForOpenGameMock.mockResolvedValue({
      ok: false,
      error: 'side_full',
    });
    render(
      <RegistrationForm mode="open" shortId={SHORT_ID} sideData={sideData} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /Side 2/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Meld meg på' }));

    expect(
      await screen.findByText(/nettopp full/i),
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
