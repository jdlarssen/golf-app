// #2839: «Meld deg av ligaen» som skjerm (Type C).
//
// Regelen er `leave_club_league` (rutetest og staging). Her låses det skjermen
// svarer for: navnet i tittelen, ett kall per trykk, hvor «Avbryt» og en vellykket
// avmelding fører, én tekst per avvisning, og at et sent svar ikke flytter en
// skjerm som har mistet fokus.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ClubLeagueLeaveResult, LeagueResult } from '../data/league';
import type { ScreenProps } from '../navigation';
import { leagueView } from '../test/leagueFixtures';
import { stackNavigation } from '../test/stackNavigation';
import { LeagueLeave } from './LeagueLeave';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../data/league', () => ({
  fetchLeague: jest.fn(async () => mockLoad),
  leaveClubLeague: jest.fn(async () => mockLeave()),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    require('react').useEffect(callback, [callback]);
  },
}));

let mockLoad: LeagueResult = { ok: false, reason: 'load_failed' };
let mockLeave: () => Promise<ClubLeagueLeaveResult> | ClubLeagueLeaveResult = () => ({ ok: true, leagueId: LEAGUE_ID });

const { fetchLeague, leaveClubLeague } = jest.requireMock('../data/league') as {
  fetchLeague: jest.Mock;
  leaveClubLeague: jest.Mock;
};

const LEAGUE_ID = 'liga-vinter';
const LEAVE_ROUTE = { name: 'LeagueLeave', params: { leagueId: LEAGUE_ID } };
const STACK = [{ name: 'Home' }, { name: 'League', params: { leagueId: LEAGUE_ID } }, LEAVE_ROUTE];

async function renderLeave(focused = true) {
  const navigation = stackNavigation(STACK);
  navigation.isFocused.mockReturnValue(focused);
  const props = { navigation, route: { key: 'leave', name: 'LeagueLeave', params: { leagueId: LEAGUE_ID } } };
  await render(<LeagueLeave {...(props as unknown as ScreenProps<'LeagueLeave'>)} />);
  return navigation;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoad = { ok: true, view: leagueView() };
  mockLeave = () => ({ ok: true, leagueId: LEAGUE_ID });
});

describe('bekreftelsen', () => {
  it('viser navnet i tittelen, nettets undertekst og begge knappene', async () => {
    await renderLeave();
    expect(fetchLeague).toHaveBeenCalledWith(LEAGUE_ID);
    expect(screen.getByTestId('league-leave-heading')).toHaveTextContent('Meld deg av «Vinterliga på Trackman»?');
    expect(screen.getByText('Du tas ut av sesong-tabellen, men kan bli med igjen så lenge ligaen ikke har startet.')).toBeTruthy();
    expect(screen.getByTestId('league-leave-submit')).toHaveTextContent('Meld meg av');
    expect(screen.getByTestId('league-leave-cancel')).toHaveTextContent('Avbryt');
  });

  it('uten liga å vise (feil ved henting) står «Prøv igjen», og ingenting kan sendes', async () => {
    mockLoad = { ok: false, reason: 'offline' };
    await renderLeave();
    expect(screen.queryByTestId('league-leave-submit')).toBeNull();
    expect(leaveClubLeague).not.toHaveBeenCalled();
  });

  it('«Avbryt» går tilbake til ligasiden uten noe kall', async () => {
    const navigation = await renderLeave();
    await fireEvent.press(screen.getByTestId('league-leave-cancel'));
    expect(navigation.popTo).toHaveBeenCalledWith('League', { leagueId: LEAGUE_ID });
    expect(leaveClubLeague).not.toHaveBeenCalled();
  });
});

describe('«Meld meg av»', () => {
  it('ett kall, tilbake til ligasiden som ligger under', async () => {
    const navigation = await renderLeave();
    await fireEvent.press(screen.getByTestId('league-leave-submit'));
    expect(leaveClubLeague).toHaveBeenCalledWith(LEAGUE_ID);
    expect(navigation.popTo).toHaveBeenCalledWith('League', { leagueId: LEAGUE_ID });
  });

  it('et dobbelt trykk er ett kall, og knappen er av mens det går', async () => {
    let finish: (result: ClubLeagueLeaveResult) => void = () => {};
    mockLeave = () =>
      new Promise<ClubLeagueLeaveResult>((resolve) => {
        finish = resolve;
      });
    const navigation = await renderLeave();
    const button = screen.getByTestId('league-leave-submit');
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(leaveClubLeague).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('league-leave-submit')).toBeDisabled();
    expect(screen.getByTestId('league-leave-submit')).toHaveTextContent('Melder deg av …');
    await act(async () => finish({ ok: true, leagueId: LEAGUE_ID }));
    expect(navigation.popTo).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['already_played', 'Du har allerede spilt en runde. Be klubb-admin om å fjerne deg.'],
    ['finished', 'Ligaen er avsluttet.'],
    ['not_member', 'Du er ikke med i denne ligaen.'],
    ['not_club_league', 'Denne ligaen kan du ikke melde deg av selv.'],
    ['offline', 'Du er uten nett. Prøv igjen når nettet er tilbake.'],
    ['save_failed', 'Noe gikk galt. Prøv igjen.'],
  ] as const)('%s: riktig tekst, og skjermen blir stående', async (reason, text) => {
    mockLeave = () => ({ ok: false, reason });
    const navigation = await renderLeave();
    await fireEvent.press(screen.getByTestId('league-leave-submit'));
    expect(screen.getByTestId('league-leave-error')).toHaveTextContent(text);
    expect(screen.getByTestId('league-leave-submit')).not.toBeDisabled();
    expect(navigation.popTo).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('et sent svar flytter ikke en skjerm som har mistet fokus', async () => {
    let finish: (result: ClubLeagueLeaveResult) => void = () => {};
    mockLeave = () =>
      new Promise<ClubLeagueLeaveResult>((resolve) => {
        finish = resolve;
      });
    const navigation = await renderLeave();
    await fireEvent.press(screen.getByTestId('league-leave-submit'));
    navigation.isFocused.mockReturnValue(false);
    await act(async () => finish({ ok: true, leagueId: LEAGUE_ID }));
    expect(navigation.popTo).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
