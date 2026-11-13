import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { TeamRegistrationForm } from './TeamRegistrationForm';
import type { TeamPickerFriend } from '@/lib/games/teamFriendPicker';

const submitTeamRegistrationMock = vi.fn();
vi.mock('./teamActions', () => ({
  submitTeamRegistration: (...args: unknown[]) => submitTeamRegistrationMock(...args),
}));

const SHORT_ID = 'abc12345';

function friend(id: string, label: string, extra: Partial<TeamPickerFriend> = {}): TeamPickerFriend {
  const [first, last] = label.split(' ');
  return {
    id,
    label,
    shortName: first,
    initials: `${first[0]}${last?.[0] ?? ''}`,
    isGuest: false,
    hcp: 12.4,
    stats: { roundsTogether: 4, lastPlayedAt: null, lastGameName: null },
    unavailable: false,
    ...extra,
  };
}

// #2840 del 5: the captain's friends, one of them in the round already.
const FRIENDS: TeamPickerFriend[] = [
  friend('u1', 'Ola Kompis'),
  friend('u2', 'Kari Nord'),
  friend('u3', 'Per Hansen'),
  friend('u4', 'Eirik Dahl', { unavailable: true }),
];

function renderForm(teamSize: number, friends: TeamPickerFriend[] = FRIENDS) {
  return render(
    <TeamRegistrationForm
      shortId={SHORT_ID}
      teamSize={teamSize}
      friends={friends}
      friendLinkPath="/venner/legg-til/ABC123"
      suggestedName="Martins lag"
      ownInitials="MB"
      meta="Ons 19. nov kl. 17:30 · Byneset North · 8 av 12 plasser"
    />,
  );
}

const row = (id: string) => screen.getByTestId(`friend-row-${id}`);
const submitButton = () => screen.getByTestId('team-submit');
const lineup = () => within(screen.getByRole('list', { name: 'Laget' }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TeamRegistrationForm (#2840 del 5)', () => {
  it('fills the lineup from the list and empties it from the lineup', () => {
    renderForm(4);
    expect(lineup().getAllByText('Ledig')).toHaveLength(3);
    expect(submitButton()).toHaveTextContent('Velg 3 til');
    expect(submitButton()).toBeDisabled();

    fireEvent.click(row('u2'));
    expect(row('u2')).toHaveAttribute('aria-pressed', 'true');
    expect(lineup().getAllByText('Ledig')).toHaveLength(2);
    expect(submitButton()).toHaveTextContent('Velg 2 til');

    fireEvent.click(lineup().getByRole('button', { name: 'Ta Kari ut av laget' }));
    expect(row('u2')).toHaveAttribute('aria-pressed', 'false');
    expect(lineup().getAllByText('Ledig')).toHaveLength(3);
  });

  it('greys out a friend in the round already, and the rest once the team is full', () => {
    renderForm(2);
    expect(row('u4')).toBeDisabled();
    expect(within(row('u4')).getByText('Alt påmeldt i runden')).toBeInTheDocument();

    fireEvent.click(row('u1'));
    expect(row('u2')).toBeDisabled();
    expect(row('u1')).toBeEnabled();
    expect(submitButton()).toHaveTextContent('Meld på Martins lag');
    expect(submitButton()).toBeEnabled();
  });

  it('keeps «Legg til venn» beside the search: at start, with a full team and with no hits', () => {
    renderForm(2);
    expect(screen.getByTestId('add-friend')).toBeInTheDocument();
    fireEvent.click(row('u1'));
    expect(screen.getByTestId('add-friend')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Søk i vennene' }), {
      target: { value: 'Jonas' },
    });
    expect(screen.getByTestId('friend-no-hit')).toHaveTextContent('Ingen av vennene dine heter «Jonas».');
    expect(screen.getByTestId('add-friend')).toBeInTheDocument();
  });

  it('opens the sheet with «Kopier lenken din» and «Gå til Venner»', () => {
    renderForm(2);
    fireEvent.click(screen.getByTestId('add-friend'));
    const sheet = within(screen.getByRole('dialog', { name: 'Legg til en venn' }));
    expect(sheet.getByTestId('copy-friend-link')).toHaveTextContent('Kopier lenken din');
    expect(sheet.getByRole('link', { name: 'Gå til Venner' })).toHaveAttribute('href', '/profile/venner');
    // v3.1: «Kopier lenken din» and «Gå til Venner» are the only buttons; ✕ closes it.
    expect(sheet.getAllByRole('button').map((b) => b.getAttribute('data-testid') ?? b.getAttribute('aria-label'))).toEqual([
      'Lukk',
      'copy-friend-link',
    ]);
    fireEvent.click(sheet.getByRole('button', { name: 'Lukk' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('without friends: the note and a whole «Legg til en venn»', () => {
    renderForm(4, []);
    expect(screen.getByTestId('team-no-friends')).toHaveTextContent(
      'Du har ingen venner på Tørny ennå. Bare venner kan være på laget ditt.',
    );
    fireEvent.click(screen.getByTestId('add-first-friend'));
    expect(screen.getByRole('dialog', { name: 'Legg til en venn' })).toBeInTheDocument();
  });

  it('renames in place: counter, the error under the field, and «Ferdig» off', () => {
    renderForm(2);
    fireEvent.click(screen.getByTestId('team-name-heading'));
    const field = screen.getByRole('textbox', { name: 'Lagnavn (3–40 tegn)' });
    fireEvent.change(field, { target: { value: 'Bi' } });

    expect(screen.getByText('2/40')).toBeInTheDocument();
    expect(screen.getByText('Lagnavnet må ha minst 3 tegn.')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Ferdig' })).toBeDisabled();

    fireEvent.change(field, { target: { value: 'Birdie-jegerne' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ferdig' }));
    expect(screen.getByTestId('team-name-heading')).toHaveTextContent('Birdie-jegerne');
  });

  it('sends the picked friends as ids with the team name (#2207)', async () => {
    submitTeamRegistrationMock.mockResolvedValue({
      ok: true,
      captainRequestId: 'cap-1',
      slotResults: [
        { ok: true, outcome: 'known_added', userId: 'u2' },
        { ok: false, userId: 'u1', reason: 'alreadyRegistered' },
      ],
    });
    renderForm(3);
    fireEvent.click(row('u2'));
    fireEvent.click(row('u1'));
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(submitTeamRegistrationMock).toHaveBeenCalledWith({
        shortId: SHORT_ID,
        teamName: 'Martins lag',
        memberIds: ['u2', 'u1'],
        website: '',
      }),
    );
    expect(await screen.findByTestId('team-registration-success')).toBeInTheDocument();
    expect(screen.getByText(/Ola Kompis — Allerede påmeldt/)).toBeInTheDocument();
  });

  it('shows the server error', async () => {
    submitTeamRegistrationMock.mockResolvedValue({ ok: false, error: 'teammate_not_friend' });
    renderForm(2);
    fireEvent.click(row('u1'));
    fireEvent.click(submitButton());
    expect(await screen.findByTestId('signup-error')).toHaveAttribute(
      'data-error-code',
      'teammate_not_friend',
    );
  });
});
