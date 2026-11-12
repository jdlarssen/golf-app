import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TeamRegistrationForm } from './TeamRegistrationForm';
import type { TeamCandidate } from '@/lib/users/getTeamCandidates';

const submitTeamRegistrationMock = vi.fn();
vi.mock('./teamActions', () => ({
  submitTeamRegistration: (...args: unknown[]) =>
    submitTeamRegistrationMock(...args),
}));

const SHORT_ID = 'abc12345';

// #2840: the candidates are the captain's friends. #2207: masked addresses only.
const FRIENDS: TeamCandidate[] = [
  { id: 'u1', name: 'Kari Nordmann', nickname: 'Birdie', maskedEmail: 'ka•••@example.com' },
  { id: 'u2', name: 'Ola Hansen', nickname: null, maskedEmail: 'ol•••@example.com' },
  { id: 'u3', name: 'Kristin Berg', nickname: null, maskedEmail: 'kr•••@example.com' },
];

function renderForm(teamSize: number, candidates: TeamCandidate[] = FRIENDS) {
  return render(
    <TeamRegistrationForm shortId={SHORT_ID} teamSize={teamSize} candidates={candidates} />,
  );
}

/** Types into seat `n` and picks the suggestion that matches `name`. */
async function pickFriend(n: number, query: string, name: RegExp) {
  const slot = screen.getByLabelText(`Medspiller ${n}`);
  fireEvent.focus(slot);
  fireEvent.change(slot, { target: { value: query } });
  fireEvent.mouseDown(await screen.findByText(name));
}

function nameTeam(value = 'Birdie-jegerne') {
  fireEvent.change(screen.getByPlaceholderText(/Birdie/), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TeamRegistrationForm — rendering', () => {
  it('rendrer team_size−1 plasser (texas scramble 4-mannslag = 3 plasser)', () => {
    renderForm(4);
    expect(screen.getAllByRole('textbox', { name: /Medspiller/i })).toHaveLength(3);
  });

  it('rendrer 1 plass for par-spill (team_size=2)', () => {
    renderForm(2);
    expect(screen.getAllByRole('textbox', { name: /Medspiller/i })).toHaveLength(1);
  });

  it('viser lag-navn-input, submit-knapp og søk i vennene', () => {
    renderForm(2);
    expect(screen.getByPlaceholderText(/Birdie/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Meld på laget/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Søk i vennene dine')).toBeInTheDocument();
  });

  it('#2840: ingen valg mellom eksisterende spiller og e-post, og ingen e-postfelt', () => {
    renderForm(2);
    expect(screen.queryByText(/Eksisterende spiller/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Inviter via e-post/)).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(document.querySelector('input[type="email"]')).toBeNull();
  });

  it('#2840: uten venner står beskjeden og lenka til Venner, ikke skjemaet', () => {
    renderForm(2, []);
    expect(
      screen.getByText('Du har ingen venner på Tørny ennå. Bare venner kan være på laget ditt.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gå til Venner' })).toHaveAttribute(
      'href',
      '/profile/venner',
    );
    expect(screen.queryByRole('button', { name: /Meld på laget/i })).not.toBeInTheDocument();
  });
});

describe('TeamRegistrationForm — submit', () => {
  it('sender de valgte vennene som id-er (#2207), aldri en adresse', async () => {
    submitTeamRegistrationMock.mockResolvedValue({
      ok: true,
      captainRequestId: 'cap-1',
      slotResults: [{ ok: true, outcome: 'known_added', userId: 'u1' }],
    });
    renderForm(2);

    await pickFriend(1, 'kari', /Kari Nordmann/);
    // The pick shows as a chip with the masked address; nothing in a field.
    expect(screen.getByLabelText(/Fjern Kari Nordmann/)).toBeInTheDocument();
    nameTeam();
    fireEvent.click(screen.getByRole('button', { name: /Meld på laget/i }));

    await waitFor(() => {
      expect(submitTeamRegistrationMock).toHaveBeenCalledWith({
        shortId: SHORT_ID,
        teamName: 'Birdie-jegerne',
        memberIds: ['u1'],
        website: '',
      });
    });
  });

  it('en venn som er valgt på én plass, foreslås ikke på en annen', async () => {
    renderForm(3);
    await pickFriend(1, 'k', /Kari Nordmann/);

    const second = screen.getByLabelText('Medspiller 2');
    fireEvent.focus(second);
    fireEvent.change(second, { target: { value: 'k' } });

    expect(await screen.findByText('Kristin Berg')).toBeInTheDocument();
    expect(screen.queryAllByText(/Kari Nordmann/)).toHaveLength(1); // the chip only
  });

  it('en tom plass blokkerer submit med egen feil', async () => {
    renderForm(2);
    nameTeam();
    fireEvent.click(screen.getByRole('button', { name: /Meld på laget/i }));

    expect(await screen.findByText('Velg en venn til denne plassen.')).toBeInTheDocument();
    expect(submitTeamRegistrationMock).not.toHaveBeenCalled();
  });

  it('fritekst uten valgt venn sendes ikke', async () => {
    renderForm(2);
    nameTeam();
    fireEvent.change(screen.getByLabelText('Medspiller 1'), { target: { value: 'kompis@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Meld på laget/i }));

    expect(await screen.findByText('Velg en venn til denne plassen.')).toBeInTheDocument();
    expect(submitTeamRegistrationMock).not.toHaveBeenCalled();
  });

  it('blokkerer submit og viser inline-feil ved for kort lag-navn', async () => {
    renderForm(2);
    await pickFriend(1, 'kari', /Kari Nordmann/);
    nameTeam('AB');
    fireEvent.click(screen.getByRole('button', { name: /Meld på laget/i }));

    expect(await screen.findByText(/minst 3 tegn/)).toBeInTheDocument();
    expect(submitTeamRegistrationMock).not.toHaveBeenCalled();
  });

  it('viser suksess-banner og hvor mange som er lagt til', async () => {
    submitTeamRegistrationMock.mockResolvedValue({
      ok: true,
      captainRequestId: 'cap-1',
      slotResults: [
        { ok: true, outcome: 'known_added', userId: 'u1' },
        { ok: true, outcome: 'known_added', userId: 'u2' },
      ],
    });
    renderForm(3);
    await pickFriend(1, 'kari', /Kari Nordmann/);
    await pickFriend(2, 'ola', /Ola Hansen/);
    nameTeam();
    fireEvent.click(screen.getByRole('button', { name: /Meld på laget/i }));

    expect(await screen.findByText(/Laget er opprettet/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent === '2 medspillere er lagt til og får varsel.',
      ),
    ).toBeInTheDocument();
  });

  it('viser de plassene som ikke kom gjennom, med vennens navn', async () => {
    submitTeamRegistrationMock.mockResolvedValue({
      ok: true,
      captainRequestId: 'cap-1',
      slotResults: [
        { ok: true, outcome: 'known_added', userId: 'u1' },
        { ok: false, userId: 'u2', reason: 'alreadyRegistered' },
      ],
    });
    renderForm(3);
    await pickFriend(1, 'kari', /Kari Nordmann/);
    await pickFriend(2, 'ola', /Ola Hansen/);
    nameTeam('Lag B');
    fireEvent.click(screen.getByRole('button', { name: /Meld på laget/i }));

    expect(await screen.findByText(/Disse plassene kom ikke gjennom/i)).toBeInTheDocument();
    expect(screen.getByText(/Ola Hansen — Allerede påmeldt/)).toBeInTheDocument();
  });

  it.each([
    ['teammate_not_friend', 'Du kan bare melde på venner. Legg dem til som venner først.'],
    ['duplicate_members', 'Du har valgt samme venn to ganger.'],
  ])('serverens %s vises som egen tekst', async (code, text) => {
    submitTeamRegistrationMock.mockResolvedValue({ ok: false, error: code });
    renderForm(2);
    await pickFriend(1, 'kari', /Kari Nordmann/);
    nameTeam();
    fireEvent.click(screen.getByRole('button', { name: /Meld på laget/i }));

    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});
