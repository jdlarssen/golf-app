// #2748: «Bli med i liga» som skjerm (Type C).
//
// Regelen (`evaluateLeagueJoin`) og teksten har sine egne Type A-tester. Her
// låses det skjermen svarer for: hvilken tilstand hvert svar gir, hvor knappene
// fører etter tilbake-regelen, og at et dobbelt trykk bare er ett kall.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { AppLeagueJoinView } from '../../../../lib/league/appLeagueView';
import type { LeagueJoinLoadResult, LeagueJoinResult } from '../data/league';
import { LEAGUE_JOIN_TEXT, LEAGUE_TEXT } from '../lib/leagueCopy';
import type { ScreenProps } from '../navigation';
import { stackNavigation } from '../test/stackNavigation';
import { LeagueJoin } from './LeagueJoin';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../data/league', () => ({
  fetchLeagueJoin: jest.fn(async () => mockLoads.shift() ?? mockLoad),
  joinLeague: jest.fn(async () => mockJoin()),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
    require('react').useEffect(callback, [callback]);
  },
}));

let mockFocus: () => void = () => {};
let mockLoads: LeagueJoinLoadResult[] = [];
let mockLoad: LeagueJoinLoadResult = { ok: false, reason: 'load_failed' };
let mockJoin: () => Promise<LeagueJoinResult> | LeagueJoinResult = () => ({ ok: true, leagueId: LEAGUE_ID });

const { joinLeague, fetchLeagueJoin } = jest.requireMock('../data/league') as {
  joinLeague: jest.Mock;
  fetchLeagueJoin: jest.Mock;
};

const LEAGUE_ID = 'liga-vinter';
const CODE = 'abcd2345';
const JOIN_ROUTE = { name: 'LeagueJoin', params: { code: CODE } };

function view(overrides: Partial<AppLeagueJoinView> = {}): AppLeagueJoinView {
  return {
    decision: 'can_join',
    league: { id: LEAGUE_ID, name: 'Vinterliga', format: 'stableford', isSimulator: true, courseName: null },
    rounds: [{ sequence: 1, opensAt: '2026-11-02T12:00:00Z', closesAt: '2027-02-07T12:00:00Z' }],
    participantCount: 7,
    lateJoin: { kind: 'none' },
    ...overrides,
  };
}

function answer(result: LeagueJoinLoadResult) {
  mockLoads = [];
  mockLoad = result;
}

async function renderJoin(routes: Array<{ name: string; params?: object }> = [{ name: 'Home' }, JOIN_ROUTE]) {
  const navigation = { ...stackNavigation(routes), popToTop: jest.fn() };
  const props = {
    navigation,
    route: { key: 'join', name: 'LeagueJoin', params: { code: CODE } },
  };
  await render(<LeagueJoin {...(props as unknown as ScreenProps<'LeagueJoin'>)} />);
  return navigation;
}

beforeEach(() => {
  jest.clearAllMocks();
  answer({ ok: true, view: view() });
  mockJoin = () => ({ ok: true, leagueId: LEAGUE_ID });
});

describe('du kan bli med', () => {
  it('viser ligaen, rundene, antallet og knappen, og spør om lenkas kode', async () => {
    await renderJoin();
    expect(fetchLeagueJoin).toHaveBeenCalledWith(CODE);
    expect(screen.getByTestId('league-join-name')).toHaveTextContent('Vinterliga');
    expect(screen.getByTestId('league-join-format')).toHaveTextContent('Stableford · Simulator');
    expect(screen.getByTestId('league-join-rounds')).toHaveTextContent('1 runde · 2. nov 2026 – 7. feb 2027');
    expect(screen.getByTestId('league-join-count')).toHaveTextContent('7 påmeldt');
    expect(screen.getByTestId('league-join-button')).toHaveTextContent(LEAGUE_JOIN_TEXT.joinButton);
    expect(screen.queryByTestId('league-join-late')).toBeNull();
  });

  it('sier fra om runder som er spilt', async () => {
    answer({ ok: true, view: view({ lateJoin: { kind: 'from_next_round', played: [1] } }) });
    await renderJoin();
    expect(screen.getByTestId('league-join-late')).toHaveTextContent('Runde 1 er spilt. Du er med fra neste runde.');
  });

  it('[Hjem, Bli med] blir [Hjem, Ligaen] med kvitteringen', async () => {
    const navigation = await renderJoin();
    await fireEvent.press(screen.getByTestId('league-join-button'));
    expect(joinLeague).toHaveBeenCalledWith(CODE);
    expect(navigation.replace).toHaveBeenCalledWith('League', { leagueId: LEAGUE_ID, joined: true });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('et dobbelt trykk er ett kall, og knappen er av mens det går', async () => {
    let finish: (result: LeagueJoinResult) => void = () => {};
    mockJoin = () =>
      new Promise<LeagueJoinResult>((resolve) => {
        finish = resolve;
      });
    const navigation = await renderJoin();
    const button = screen.getByTestId('league-join-button');
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(joinLeague).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('league-join-button')).toBeDisabled();
    expect(screen.getByTestId('league-join-button')).toHaveTextContent(LEAGUE_JOIN_TEXT.joinPending);
    await act(async () => finish({ ok: true, leagueId: LEAGUE_ID }));
    expect(navigation.replace).toHaveBeenCalledTimes(1);
  });

  it('uten nett: ingenting skjer med stakken, feilen står, og «Prøv igjen» sender på nytt', async () => {
    mockJoin = () => ({ ok: false, reason: 'offline' });
    const navigation = await renderJoin();
    await fireEvent.press(screen.getByTestId('league-join-button'));
    expect(screen.getByTestId('league-join-error')).toHaveTextContent('Du er uten nett. Prøv igjen når nettet er tilbake.');
    expect(screen.getByTestId('league-join-button')).toHaveTextContent(LEAGUE_TEXT.retry);
    expect(navigation.replace).not.toHaveBeenCalled();

    mockJoin = () => ({ ok: true, leagueId: LEAGUE_ID });
    await fireEvent.press(screen.getByTestId('league-join-button'));
    expect(joinLeague).toHaveBeenCalledTimes(2);
    expect(navigation.replace).toHaveBeenCalledWith('League', { leagueId: LEAGUE_ID, joined: true });
  });

  it.each([
    ['closed', 'league-join-closed', LEAGUE_JOIN_TEXT.closed],
    ['profile_incomplete', 'league-join-profile_incomplete', LEAGUE_JOIN_TEXT.profileIncomplete],
  ] as const)('serveren sier %s etter trykket: skjermen følger svaret', async (reason, testID, text) => {
    mockJoin = () => ({ ok: false, reason });
    await renderJoin();
    await fireEvent.press(screen.getByTestId('league-join-button'));
    expect(screen.getByTestId(testID)).toBeTruthy();
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByTestId('league-join-button')).toBeNull();
  });

  it('lenka er slått av etter at skjermen åpnet: vei til Hjem', async () => {
    mockJoin = () => ({ ok: false, reason: 'not_found' });
    await renderJoin();
    await fireEvent.press(screen.getByTestId('league-join-button'));
    expect(screen.getByTestId('league-join-not-found')).toHaveTextContent(LEAGUE_JOIN_TEXT.notFound);
  });
});

describe('du er alt med', () => {
  beforeEach(() => answer({ ok: true, view: view({ decision: 'already_joined' }) }));

  it('rett til ligasiden, uten mellomskjerm og uten kvittering', async () => {
    const navigation = await renderJoin();
    expect(navigation.replace).toHaveBeenCalledWith('League', { leagueId: LEAGUE_ID });
    expect(screen.queryByTestId('league-join-screen')).toBeNull();
  });

  it('ligger ligaen alt under, går du tilbake til den: ingen kopi', async () => {
    const navigation = await renderJoin([
      { name: 'Home' },
      { name: 'League', params: { leagueId: LEAGUE_ID } },
      JOIN_ROUTE,
    ]);
    expect(navigation.popTo).toHaveBeenCalledWith('League', { leagueId: LEAGUE_ID });
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

describe('du kan ikke bli med', () => {
  it('ligaen er avsluttet: teksten og «Se tabellen»', async () => {
    answer({ ok: true, view: view({ decision: 'closed', lateJoin: { kind: 'all_played', played: [1] } }) });
    const navigation = await renderJoin();
    expect(screen.getByTestId('league-join-closed')).toBeTruthy();
    expect(screen.getByText(LEAGUE_JOIN_TEXT.closed)).toBeTruthy();
    expect(screen.queryByTestId('league-join-late')).toBeNull();
    await fireEvent.press(screen.getByTestId('league-join-next'));
    expect(navigation.replace).toHaveBeenCalledWith('League', { leagueId: LEAGUE_ID });
  });

  it('profilen mangler handicap: teksten og veien til profilen, og svaret leses på nytt ved fokus', async () => {
    answer({ ok: true, view: view({ decision: 'profile_incomplete' }) });
    const navigation = await renderJoin();
    expect(screen.getByText(LEAGUE_JOIN_TEXT.profileIncomplete)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('league-join-next'));
    expect(navigation.navigate).toHaveBeenCalledWith('EditProfile', undefined);

    answer({ ok: true, view: view() });
    await act(async () => mockFocus());
    expect(screen.getByTestId('league-join-button')).toBeTruthy();
  });

  it('lenka fører ingen steder: teksten og «Til Hjem»', async () => {
    answer({ ok: false, reason: 'not_found' });
    const navigation = await renderJoin();
    expect(screen.getByTestId('league-join-not-found')).toHaveTextContent(LEAGUE_JOIN_TEXT.notFound);
    await fireEvent.press(screen.getByTestId('league-join-home'));
    expect(navigation.popToTop).toHaveBeenCalled();
  });
});

describe('uten svar', () => {
  it('mens den henter står lasteskjermen', async () => {
    mockLoad = new Promise(() => {}) as never;
    await renderJoin();
    expect(screen.getByTestId('league-loading')).toBeTruthy();
  });

  it('nettfeil: feilen og «Prøv igjen», uten at noe er skrevet', async () => {
    answer({ ok: false, reason: 'network' });
    await renderJoin();
    expect(screen.getByTestId('league-load-failed')).toBeTruthy();
    expect(joinLeague).not.toHaveBeenCalled();

    answer({ ok: true, view: view() });
    await fireEvent.press(screen.getByTestId('league-retry'));
    expect(screen.getByTestId('league-join-button')).toBeTruthy();
  });

  it('en ny henting som feiler, tar ikke bort det skjermen alt viser', async () => {
    await renderJoin();
    answer({ ok: false, reason: 'network' });
    await act(async () => mockFocus());
    expect(screen.getByTestId('league-join-button')).toBeTruthy();
  });
});
