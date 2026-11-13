import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TeamDashboardClient } from './TeamDashboardClient';
import type { TeamPickerFriend } from '@/lib/games/teamFriendPicker';

// Server actions are stubbed so the import never pulls 'use server' modules
// into jsdom.
const ok = async () => ({ ok: true as const });
const transferCaptaincyMock = vi.fn(ok);
const removeTeamMemberMock = vi.fn(ok);
const resendTeamInviteMock = vi.fn(ok);
const addTeamMemberMock = vi.fn(ok);
vi.mock('../teamActions', () => ({
  acceptTeamInvite: vi.fn(),
  declineTeamInvite: vi.fn(),
  removeTeamMember: (...args: unknown[]) => removeTeamMemberMock(...(args as [])),
  resendTeamInvite: (...args: unknown[]) => resendTeamInviteMock(...(args as [])),
  attachToCaptainTeam: vi.fn(),
  transferCaptaincy: (...args: unknown[]) => transferCaptaincyMock(...(args as [])),
  addTeamMember: (...args: unknown[]) => addTeamMemberMock(...(args as [])),
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const SHORT_ID = 'abc12345';

const INGRID: TeamPickerFriend = {
  id: 'u-ingrid',
  label: 'Ingrid Næss',
  shortName: 'Ingrid',
  initials: 'IN',
  isGuest: false,
  hcp: null,
  stats: null,
  unavailable: false,
};

function renderTeam(mode: 'captain' | 'member', myRowId = 'cap-1', signupsClosed = false) {
  return render(
    <TeamDashboardClient
      mode={mode}
      shortId={SHORT_ID}
      myRowId={myRowId}
      myStatus={mode === 'captain' ? 'approved' : 'pending'}
      joinEffect="approval"
      teamName="Birdie-jegerne"
      gameName="Onsdagsgolfen"
      teamSize={5}
      signupsClosed={signupsClosed}
      picker={mode === 'captain' ? { friends: [INGRID], friendLinkPath: null } : null}
      captain={{ requestId: 'cap-1', userId: 'u-cap', displayName: 'Martin Berg', status: 'approved' }}
      members={[
        { requestId: 'req-ola', userId: 'u-ola', displayName: 'Ola Kompis', status: 'approved', isGuest: false },
        { requestId: 'req-kari', userId: 'u-kari', displayName: 'Kari Nord', status: 'pending', isGuest: false },
        { requestId: 'req-per', userId: 'u-per', displayName: 'Per Hansen', status: 'rejected', isGuest: false },
        // #2607: a guest can never be captain.
        { requestId: 'req-gjest', userId: 'u-gjest', displayName: 'Gunn Gjest', status: 'approved', isGuest: true },
      ]}
    />,
  );
}

function openMenu(requestId: string) {
  fireEvent.click(within(screen.getByTestId(`team-row-${requestId}`)).getByTestId('team-row-menu'));
  return within(screen.getByRole('menu'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TeamDashboardClient — the captain (#2840 del 5)', () => {
  it.each([
    ['req-kari', ['Send på nytt', 'Fjern fra laget']],
    ['req-ola', ['Gi kapteinsrollen', 'Fjern fra laget']],
    ['req-gjest', ['Fjern fra laget']],
  ])('«•••» on %s holds %j', (requestId, items) => {
    renderTeam('captain');
    const menu = openMenu(requestId);
    expect(menu.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(items);
  });

  it('a teammate who said no has «Bytt med en venn» and no «•••»', () => {
    renderTeam('captain');
    const per = within(screen.getByTestId('team-row-req-per'));
    expect(per.getByText('Takket nei')).toBeInTheDocument();
    expect(per.queryByTestId('team-row-menu')).toBeNull();
    expect(per.getByTestId('team-swap')).toHaveTextContent('Bytt med en venn');
  });

  it('«Fjern fra laget» asks first, then removes that teammate', async () => {
    renderTeam('captain');
    fireEvent.click(openMenu('req-kari').getByText('Fjern fra laget'));
    expect(screen.getByRole('heading', { name: 'Fjerne Kari Nord fra laget?' })).toBeInTheDocument();
    expect(removeTeamMemberMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('team-confirm-button'));
    await vi.waitFor(() => expect(removeTeamMemberMock).toHaveBeenCalledWith('req-kari', SHORT_ID));
  });

  it('#2840: «Send på nytt» resends at once, without a confirmation', async () => {
    renderTeam('captain');
    fireEvent.click(openMenu('req-kari').getByText('Send på nytt'));
    await vi.waitFor(() => expect(resendTeamInviteMock).toHaveBeenCalledWith('req-kari', SHORT_ID));
    expect(screen.queryByTestId('team-confirm-button')).toBeNull();
  });

  it('#2840: with signups closed the captain sees the team but cannot change it', () => {
    renderTeam('captain', 'cap-1', true);
    expect(screen.getByTestId('team-rows')).toBeInTheDocument();
    expect(screen.queryByTestId('team-row-menu')).toBeNull();
    expect(screen.queryByTestId('team-swap')).toBeNull();
    expect(screen.queryByTestId('team-pick-friend')).toBeNull();
  });

  it('#2840: a new screen moves focus to its heading, and back again on «Avbryt»', async () => {
    renderTeam('captain');
    fireEvent.click(openMenu('req-kari').getByText('Fjern fra laget'));
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Fjerne Kari Nord fra laget?' })),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }));
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Birdie-jegerne' })));
  });

  it('«Avbryt» on the confirmation changes nothing', () => {
    renderTeam('captain');
    fireEvent.click(openMenu('req-ola').getByText('Gi kapteinsrollen'));
    expect(screen.getByRole('heading', { name: 'Gi kapteinsrollen til Ola Kompis?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }));
    expect(transferCaptaincyMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('team-rows')).toBeInTheDocument();
  });

  it('«Gi kapteinsrollen» hands it over after the confirmation (#2358)', async () => {
    renderTeam('captain');
    fireEvent.click(openMenu('req-ola').getByText('Gi kapteinsrollen'));
    fireEvent.click(screen.getByTestId('team-confirm-button'));
    await vi.waitFor(() => expect(transferCaptaincyMock).toHaveBeenCalledWith('req-ola', SHORT_ID));
  });

  it('«Bytt med en venn» sends the friend with replaceRequestId', async () => {
    renderTeam('captain');
    fireEvent.click(screen.getByTestId('team-swap'));
    expect(screen.getByTestId('team-picker')).toBeInTheDocument();
    expect(screen.getByTestId('add-friend')).toBeInTheDocument();
    expect(screen.getByTestId('team-add-friend')).toBeDisabled();

    fireEvent.click(screen.getByTestId('friend-row-u-ingrid'));
    expect(screen.getByTestId('team-add-friend')).toHaveTextContent('Legg Ingrid til på laget');
    fireEvent.click(screen.getByTestId('team-add-friend'));
    await vi.waitFor(() =>
      expect(addTeamMemberMock).toHaveBeenCalledWith(SHORT_ID, 'u-ingrid', 'req-per'),
    );
  });
});

describe('TeamDashboardClient — the teammate', () => {
  it('sees the team without «•••» and can answer', () => {
    renderTeam('member', 'req-kari');
    expect(screen.queryByTestId('team-row-menu')).toBeNull();
    expect(screen.queryByTestId('team-swap')).toBeNull();
    expect(screen.getByText('Bare kapteinen kan endre laget.')).toBeInTheDocument();
    expect(screen.getByText('Martin vil ha deg med på laget')).toBeInTheDocument();
    expect(screen.getByText(/Sier du ja.*godkjenne laget/i)).toBeInTheDocument();
    expect(screen.getByTestId('team-accept')).toHaveTextContent('Bli med på laget');
  });
});

describe('TeamDashboardClient — an e-mail invitation from before #2840', () => {
  it('names the team and the captain when the server knows who invited', () => {
    render(
      <TeamDashboardClient
        mode="invited_unknown"
        shortId={SHORT_ID}
        invitationId="inv-1"
        joinEffect="instant"
        teamName="Birdie-jegerne"
        captainName="Kaptein Sabeltann"
      />,
    );
    // #1343: a certain match on invited_by names the team and the captain.
    expect(
      screen.getByText(/Kaptein Sabeltann vil ha deg med på laget Birdie-jegerne/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bli med på lag/i })).toBeInTheDocument();
  });

  it('keeps the text generic without a team name', () => {
    render(
      <TeamDashboardClient mode="invited_unknown" shortId={SHORT_ID} invitationId="inv-1" joinEffect="approval" />,
    );
    expect(screen.getByText(/Arrangøren må godkjenne laget/i)).toBeInTheDocument();
    expect(screen.queryByText(/vil ha deg med på laget/i)).toBeNull();
  });
});
