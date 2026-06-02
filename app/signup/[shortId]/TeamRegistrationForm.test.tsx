import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TeamRegistrationForm } from './TeamRegistrationForm';

const submitTeamRegistrationMock = vi.fn();
vi.mock('./teamActions', () => ({
  submitTeamRegistration: (...args: unknown[]) =>
    submitTeamRegistrationMock(...args),
}));

const SHORT_ID = 'abc12345';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TeamRegistrationForm — rendering', () => {
  it('rendrer team_size−1 slots (texas scramble 4-mannslag = 3 slots)', () => {
    render(<TeamRegistrationForm shortId={SHORT_ID} teamSize={4} />);
    const inputs = screen.getAllByRole('textbox', { name: /Medspiller/i });
    expect(inputs).toHaveLength(3);
  });

  it('rendrer 1 slot for par-spill (team_size=2)', () => {
    render(<TeamRegistrationForm shortId={SHORT_ID} teamSize={2} />);
    const inputs = screen.getAllByRole('textbox', { name: /Medspiller/i });
    expect(inputs).toHaveLength(1);
  });

  it('viser lag-navn-input + submit-knapp', () => {
    render(<TeamRegistrationForm shortId={SHORT_ID} teamSize={2} />);
    expect(screen.getByPlaceholderText(/Birdie/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Meld på laget/i }),
    ).toBeInTheDocument();
  });

  it('hver slot har toggle for lookup vs email-modus', () => {
    render(<TeamRegistrationForm shortId={SHORT_ID} teamSize={2} />);
    expect(screen.getByText(/Eksisterende spiller/)).toBeInTheDocument();
    expect(screen.getByText(/Inviter via e-post/)).toBeInTheDocument();
  });
});

describe('TeamRegistrationForm — submit', () => {
  it('submitter med riktig payload (shortId, teamName, slots)', async () => {
    submitTeamRegistrationMock.mockResolvedValue({
      ok: true,
      captainRequestId: 'cap-1',
      slotResults: [
        {
          ok: true,
          outcome: 'known_added',
          email: 'kompis@example.com',
        },
      ],
    });

    render(<TeamRegistrationForm shortId={SHORT_ID} teamSize={2} />);
    fireEvent.change(screen.getByPlaceholderText(/Birdie/), {
      target: { value: 'Birdie-jegerne' },
    });
    fireEvent.change(screen.getByLabelText('Medspiller 1'), {
      target: { value: 'kompis@example.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Meld på laget/i }));

    await waitFor(() => {
      expect(submitTeamRegistrationMock).toHaveBeenCalledTimes(1);
    });
    expect(submitTeamRegistrationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shortId: SHORT_ID,
        teamName: 'Birdie-jegerne',
        slots: [
          expect.objectContaining({
            mode: 'lookup',
            value: 'kompis@example.com',
          }),
        ],
      }),
    );
  });

  it('viser suksess-banner og oppsummering når submit lykkes', async () => {
    submitTeamRegistrationMock.mockResolvedValue({
      ok: true,
      captainRequestId: 'cap-1',
      slotResults: [
        {
          ok: true,
          outcome: 'known_added',
          email: 'kompis@example.com',
        },
      ],
    });

    render(<TeamRegistrationForm shortId={SHORT_ID} teamSize={2} />);
    fireEvent.change(screen.getByPlaceholderText(/Birdie/), {
      target: { value: 'Birdie-jegerne' },
    });
    fireEvent.change(screen.getByLabelText('Medspiller 1'), {
      target: { value: 'kompis@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Meld på laget/i }));

    expect(
      await screen.findByText(/Laget er opprettet/i),
    ).toBeInTheDocument();
  });

  it('blokkerer submit og viser inline-feil ved for kort lag-navn', async () => {
    render(<TeamRegistrationForm shortId={SHORT_ID} teamSize={2} />);
    fireEvent.change(screen.getByPlaceholderText(/Birdie/), {
      target: { value: 'AB' },
    });
    fireEvent.change(screen.getByLabelText('Medspiller 1'), {
      target: { value: 'kompis@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Meld på laget/i }));

    expect(
      await screen.findByText(/minst 3 tegn/),
    ).toBeInTheDocument();
    expect(submitTeamRegistrationMock).not.toHaveBeenCalled();
  });

  it('viser inline-feil for ugyldig e-post on-blur og blokkerer submit', async () => {
    render(<TeamRegistrationForm shortId={SHORT_ID} teamSize={2} />);
    fireEvent.change(screen.getByPlaceholderText(/Birdie/), {
      target: { value: 'Birdie-jegerne' },
    });
    const slot = screen.getByLabelText('Medspiller 1');
    fireEvent.change(slot, { target: { value: 'ikke-epost' } });
    fireEvent.blur(slot);

    expect(
      await screen.findByText(/gyldig e-postadresse/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Meld på laget/i }));
    expect(submitTeamRegistrationMock).not.toHaveBeenCalled();
  });

  it('foreslår co-players i lookup-modus og fyller slot ved valg', async () => {
    submitTeamRegistrationMock.mockResolvedValue({
      ok: true,
      captainRequestId: 'cap-1',
      slotResults: [
        { ok: true, outcome: 'known_added', email: 'kari@example.com' },
      ],
    });
    render(
      <TeamRegistrationForm
        shortId={SHORT_ID}
        teamSize={2}
        candidates={[
          {
            id: 'u1',
            name: 'Kari Nordmann',
            nickname: 'Birdie',
            email: 'kari@example.com',
          },
        ]}
      />,
    );
    const slot = screen.getByLabelText('Medspiller 1');
    fireEvent.focus(slot);
    fireEvent.change(slot, { target: { value: 'kari' } });

    const suggestion = await screen.findByText(/Kari Nordmann/);
    expect(screen.getByText(/ka•••@example\.com/)).toBeInTheDocument();
    fireEvent.mouseDown(suggestion);

    // Valget vises som chip med maskert e-post; rå-adressen er ikke i et felt.
    expect(screen.getByLabelText(/Fjern Kari Nordmann/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Birdie/), {
      target: { value: 'Birdie-jegerne' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Meld på laget/i }));
    await waitFor(() => {
      expect(submitTeamRegistrationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          slots: [
            expect.objectContaining({
              mode: 'lookup',
              value: 'kari@example.com',
            }),
          ],
        }),
      );
    });
  });

  it('viser warning for feilede slots i blandet resultat', async () => {
    submitTeamRegistrationMock.mockResolvedValue({
      ok: true,
      captainRequestId: 'cap-1',
      slotResults: [
        {
          ok: true,
          outcome: 'known_added',
          email: 'ok@example.com',
        },
        {
          ok: false,
          email: 'feilet@example.com',
          reason: 'Bruker ikke funnet',
        },
      ],
    });

    render(<TeamRegistrationForm shortId={SHORT_ID} teamSize={3} />);
    fireEvent.change(screen.getByPlaceholderText(/Birdie/), {
      target: { value: 'Lag B' },
    });
    fireEvent.change(screen.getByLabelText('Medspiller 1'), {
      target: { value: 'ok@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Medspiller 2'), {
      target: { value: 'feilet@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Meld på laget/i }));

    expect(
      await screen.findByText(/Disse plassene kom ikke gjennom/i),
    ).toBeInTheDocument();
  });
});
