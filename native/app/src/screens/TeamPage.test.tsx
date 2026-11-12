// #2840 del 3: lagsiden som skjerm (Type C).
//
// Reglene (`teamPageModel.ts`) og tekstene (`teamPageCopy.ts`) har egne Type A-tester.
// Her låses det skjermen svarer for: hvilken flate hvert svar gir, hva «•••» tilbyr for
// hvem, at «Fjern fra laget» og «Gi kapteinsrollen» går til bekreftelsen og aldri skriver
// her, og hvor «Velg en venn» og «Bytt med en venn» fører.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type {
  AppTeamPageMember,
  AppTeamPageResponse,
  AppTeamPageTeam,
} from '../../../../lib/games/appRoundInviteView';
import type { TeamPageActionResult, TeamPageLoadResult } from '../data/teamPage';
import { TEAM_PAGE_TEXT } from '../lib/teamPageCopy';
import type { ScreenProps } from '../navigation';
import { stackNavigation } from '../test/stackNavigation';
import { TeamPage } from './TeamPage';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    require('react').useEffect(callback, [callback]);
  },
}));
jest.mock('../data/teamPage', () => ({
  fetchTeamPage: jest.fn(async () => mockLoads.shift() ?? mockLoad),
  resendInvite: jest.fn(async () => mockAction),
  attachToTeam: jest.fn(async () => mockAction),
}));

let mockLoads: TeamPageLoadResult[] = [];
let mockLoad: TeamPageLoadResult;
let mockAction: TeamPageActionResult = { ok: true, status: 'resent' };

const { fetchTeamPage, resendInvite, attachToTeam } = jest.requireMock('../data/teamPage') as {
  fetchTeamPage: jest.Mock;
  resendInvite: jest.Mock;
  attachToTeam: jest.Mock;
};

const SHORT_ID = 'abcd2345';
const GAME = {
  id: 'g1',
  shortId: SHORT_ID,
  name: 'Onsdagsgolfen',
  courseName: 'Byneset',
  joinEffect: 'instant' as const,
  signupsClosed: false,
  teamSize: 4,
  teeOffAt: null,
};
const member = (id: string, status: AppTeamPageMember['status'], isGuest = false): AppTeamPageMember => ({
  requestId: `r-${id}`,
  userId: `u-${id}`,
  displayName: `${id} Kompis`,
  status,
  isGuest,
});

/** Tegningen, «Kapteinen»: Ola har sagt ja, Kari venter, Per takket nei. */
function captainView(overrides: Partial<AppTeamPageTeam> = {}): AppTeamPageResponse {
  return {
    kind: 'captain',
    game: GAME,
    myRowId: 'r-meg',
    myStatus: 'approved',
    teamName: 'Birdie-jegerne',
    captain: { requestId: 'r-meg', userId: 'u-meg', displayName: 'Martin Berg', status: 'approved' },
    members: [member('Ola', 'approved'), member('Kari', 'pending'), member('Per', 'rejected')],
    unavailableFriendIds: ['u-eirik'],
    ...overrides,
  };
}

function show(view: AppTeamPageResponse) {
  mockLoads = [];
  mockLoad = { ok: true, view };
}

async function renderPage() {
  const navigation = { ...stackNavigation([{ name: 'Home' }, { name: 'TeamPage', params: { shortId: SHORT_ID } }]), popToTop: jest.fn() };
  const props = { navigation, route: { key: 'team', name: 'TeamPage', params: { shortId: SHORT_ID } } };
  await render(<TeamPage {...(props as unknown as ScreenProps<'TeamPage'>)} />);
  return navigation;
}

async function openMenu(requestId: string) {
  await fireEvent.press(screen.getByTestId(`team-page-row-${requestId}-menu`));
}

beforeEach(() => {
  jest.clearAllMocks();
  show(captainView());
  mockAction = { ok: true, status: 'resent' };
});

describe('kapteinen', () => {
  it('ser laget, «•••» for den som har sagt ja og den som venter, og «Bytt med en venn» for et nei', async () => {
    await renderPage();
    expect(fetchTeamPage).toHaveBeenCalledWith(SHORT_ID);
    expect(screen.getByTestId('team-page-captain')).toBeTruthy();
    expect(screen.getByTestId('team-page-title')).toHaveTextContent('Birdie-jegerne');
    expect(screen.getByTestId('team-page-slot-0-disc-captain')).toBeTruthy();
    expect(screen.getByTestId('team-page-row-r-Ola-menu')).toBeTruthy();
    expect(screen.getByTestId('team-page-row-r-Kari-menu')).toBeTruthy();
    expect(screen.queryByTestId('team-page-row-r-Per-menu')).toBeNull();
    expect(screen.getByTestId('team-page-row-r-Per-swap')).toBeTruthy();
    expect(screen.getByTestId('team-page-note')).toHaveTextContent(TEAM_PAGE_TEXT.captainNote);
  });

  it.each([
    ['venter på svar', 'r-Kari', ['team-menu-resend', 'team-menu-remove'], ['team-menu-transfer']],
    ['med på laget', 'r-Ola', ['team-menu-transfer', 'team-menu-remove'], ['team-menu-resend']],
  ])('«•••» for en som %s', async (_label, requestId, shown, hidden) => {
    await renderPage();
    await openMenu(requestId);
    for (const id of shown) expect(screen.getByTestId(id)).toBeTruthy();
    for (const id of hidden) expect(screen.queryByTestId(id)).toBeNull();
  });

  it('en gjest kan ikke få kapteinsrollen', async () => {
    show(captainView({ members: [member('Gjest', 'approved', true)] }));
    await renderPage();
    await openMenu('r-Gjest');
    expect(screen.queryByTestId('team-menu-transfer')).toBeNull();
    expect(screen.getByTestId('team-menu-remove')).toBeTruthy();
  });

  it('«Fjern fra laget» går til bekreftelsen og skriver ingenting her', async () => {
    const navigation = await renderPage();
    await openMenu('r-Kari');
    await fireEvent.press(screen.getByTestId('team-menu-remove'));
    expect(navigation.navigate).toHaveBeenCalledWith('TeamRemoveConfirm', {
      shortId: SHORT_ID,
      requestId: 'r-Kari',
      name: 'Kari Kompis',
      teamName: 'Birdie-jegerne',
      pending: true,
    });
    expect(screen.queryByTestId('team-menu')).toBeNull();
  });

  it('«Gi kapteinsrollen» går til bekreftelsen', async () => {
    const navigation = await renderPage();
    await openMenu('r-Ola');
    await fireEvent.press(screen.getByTestId('team-menu-transfer'));
    expect(navigation.navigate).toHaveBeenCalledWith('TeamTransferConfirm', {
      shortId: SHORT_ID,
      requestId: 'r-Ola',
      name: 'Ola Kompis',
      teamName: 'Birdie-jegerne',
    });
  });

  it('«Send på nytt» skjer i arket, og linja sier at varselet gikk', async () => {
    await renderPage();
    await openMenu('r-Kari');
    await fireEvent.press(screen.getByTestId('team-menu-resend'));
    expect(resendInvite).toHaveBeenCalledWith(SHORT_ID, 'r-Kari');
    expect(screen.queryByTestId('team-menu')).toBeNull();
    expect(screen.getByTestId('team-page-notice')).toBeTruthy();
  });

  it('«Send på nytt» uten nett står i arket med «Prøv igjen»', async () => {
    mockAction = { ok: false, reason: 'network' };
    await renderPage();
    await openMenu('r-Kari');
    await fireEvent.press(screen.getByTestId('team-menu-resend'));
    expect(screen.getByTestId('team-menu-error')).toBeTruthy();
    expect(screen.getByTestId('team-menu-resend')).toHaveTextContent('Prøv igjen');
  });

  it('«Bytt med en venn» åpner velgeren med raden som byttes ut', async () => {
    const navigation = await renderPage();
    await fireEvent.press(screen.getByTestId('team-page-row-r-Per-swap'));
    expect(navigation.navigate).toHaveBeenCalledWith('TeamSlotPicker', {
      shortId: SHORT_ID,
      teamName: 'Birdie-jegerne',
      open: 1,
      replaceRequestId: 'r-Per',
      teamUserIds: ['u-meg', 'u-Ola', 'u-Kari', 'u-Per'],
      unavailableFriendIds: ['u-eirik'],
    });
  });

  it('en ledig plass står stiplet med «Velg en venn», uten rad å bytte ut', async () => {
    show(captainView({ members: [member('Ola', 'approved'), member('Kari', 'pending')] }));
    const navigation = await renderPage();
    expect(screen.getByTestId('team-page-slot-3-free')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('team-page-free-0-pick'));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'TeamSlotPicker',
      expect.objectContaining({ open: 1, replaceRequestId: null }),
    );
  });

  it('etter at påmeldingen er stengt, står laget uten knapper', async () => {
    show(captainView({ game: { ...GAME, signupsClosed: true } }));
    await renderPage();
    expect(screen.queryByTestId('team-page-row-r-Ola-menu')).toBeNull();
    expect(screen.queryByTestId('team-page-row-r-Per-swap')).toBeNull();
  });
});

describe('medspilleren', () => {
  it('ser laget uten «•••», og at bare kapteinen kan endre det', async () => {
    show(
      captainView({
        kind: 'member',
        myRowId: 'r-Ola',
        captain: { requestId: 'r-kari', userId: 'u-kari', displayName: 'Kari Nord', status: 'approved' },
      }),
    );
    await renderPage();
    expect(screen.getByTestId('team-page-member')).toBeTruthy();
    expect(screen.queryByTestId('team-page-row-r-Kari-menu')).toBeNull();
    expect(screen.queryByTestId('team-page-row-r-Per-swap')).toBeNull();
    expect(screen.queryByTestId('team-page-row-r-Ola')).toBeNull();
    expect(screen.getByTestId('team-page-row-r-kari-status')).toHaveTextContent(TEAM_PAGE_TEXT.captain);
    expect(screen.getByTestId('team-page-note')).toHaveTextContent(TEAM_PAGE_TEXT.memberNote);
  });
});

// #2840: varselet «Kari vil ha deg med på laget» peker på lagsiden, men svaret står på
// påmeldingsskjermen (tegningen, «2. Svaret på invitasjonen»).
describe('en medspiller som ikke har svart', () => {
  const pending = () =>
    captainView({
      kind: 'member',
      myRowId: 'r-Kari',
      myStatus: 'pending',
      captain: { requestId: 'r-ola', userId: 'u-ola', displayName: 'Ola Kompis', status: 'approved' },
    });

  it('går videre til svaret på påmeldingsskjermen, og lagsiden går ut av stakken', async () => {
    show(pending());
    const navigation = await renderPage();
    expect(navigation.replace).toHaveBeenCalledWith('RoundInvite', { shortId: SHORT_ID, src: null });
  });

  it('flytter ingenting når skjermen ikke står øverst lenger', async () => {
    show(pending());
    const navigation = { ...stackNavigation([{ name: 'Home' }, { name: 'TeamPage', params: { shortId: SHORT_ID } }]), popToTop: jest.fn() };
    navigation.isFocused.mockReturnValue(false);
    const props = { navigation, route: { key: 'team', name: 'TeamPage', params: { shortId: SHORT_ID } } };
    await render(<TeamPage {...(props as unknown as ScreenProps<'TeamPage'>)} />);
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

describe('en gammel invitasjon på e-post', () => {
  it('«Bli med på laget» kobler deg på, og skjermen spør på nytt', async () => {
    mockLoads = [
      {
        ok: true,
        view: { kind: 'invited_unknown', game: GAME, invitationId: 'i1', captainName: 'Kari Nord', teamName: 'Birdie-jegerne' },
      },
    ];
    mockLoad = { ok: true, view: captainView({ kind: 'member', myRowId: 'r-Ola' }) };
    mockAction = { ok: true, status: 'attached' };
    await renderPage();
    expect(screen.getByTestId('team-page-attach-ask')).toHaveTextContent('Kari vil ha deg med på laget');
    await fireEvent.press(screen.getByTestId('team-page-attach-join'));
    expect(attachToTeam).toHaveBeenCalledWith(SHORT_ID, 'i1');
    expect(fetchTeamPage).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('team-page-member')).toBeTruthy();
  });
});

describe('uten lag', () => {
  it.each([
    ['no_team', { kind: 'no_team', game: GAME }, 'team-page-no-team'],
    ['solo', { kind: 'solo', game: GAME }, 'team-page-solo'],
    ['team_unknown', { kind: 'team_unknown', game: GAME, noCaptain: false }, 'team-page-team-unknown'],
  ] as const)('%s: et rolig kort og veien til påmeldingen', async (_kind, view, testID) => {
    show(view as AppTeamPageResponse);
    const navigation = await renderPage();
    await fireEvent.press(screen.getByTestId(`${testID}-button`));
    expect(navigation.navigate).toHaveBeenCalledWith('RoundInvite', { shortId: SHORT_ID, src: null });
  });

  it('en runde som ikke finnes: til Hjem', async () => {
    mockLoad = { ok: false, reason: 'not_found' };
    const navigation = await renderPage();
    await fireEvent.press(screen.getByTestId('team-page-not-found-button'));
    expect(navigation.popToTop).toHaveBeenCalled();
  });
});
