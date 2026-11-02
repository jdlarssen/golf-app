// #2752: cup-lenka som skjerm (Type C). Regelen er serverens; her låses hva hver tilstand
// viser, hvor knappene fører, og at uten nett skrives ingenting.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { AppCupJoinView } from '../../../../lib/cup/appCupSetupView';
import { joinCup, leaveCup } from '../data/cupSetup';
import type { ScreenProps } from '../navigation';
import { CupJoin } from './CupJoin';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../data/cupSetup', () => ({
  fetchCupJoin: jest.fn(async () => mockResults.shift() ?? mockLast),
  joinCup: jest.fn(async () => ({ ok: true, status: 'joined' })),
  leaveCup: jest.fn(async () => ({ ok: true, status: 'left' })),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
    require('react').useEffect(callback, [callback]);
  },
}));

type Load = { ok: true; view: AppCupJoinView } | { ok: false; reason: string };
let mockFocus: () => void = () => {};
let mockResults: Load[] = [];
let mockLast: Load = { ok: false, reason: 'offline' };

function answer(...results: Load[]) {
  mockResults = [...results];
  mockLast = results[results.length - 1];
}

const room = (decision: AppCupJoinView['decision'], over: Partial<AppCupJoinView> = {}): AppCupJoinView => ({
  decision,
  cup: { id: 'cup-1', name: 'Klubbmesterskapet', team1Name: 'Team Nord', team2Name: 'Team Sør' },
  courseName: 'Stiklestad Golfbane',
  when: { date: 'lørdag 20. november', time: '10:30' },
  cap: 40,
  club: null,
  canOpenCup: true,
  ...over,
});

async function renderJoin() {
  const navigation = {
    navigate: jest.fn(),
    popTo: jest.fn(),
    replace: jest.fn(),
    getState: () => ({ index: 1, routes: [{ name: 'Home' }, { name: 'CupJoin', params: { shortId: 'abcd2345' } }] }),
  };
  await render(
    <CupJoin
      {...({
        navigation,
        route: { key: 'j', name: 'CupJoin', params: { shortId: 'abcd2345' } },
      } as unknown as ScreenProps<'CupJoin'>)}
    />,
  );
  return navigation;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('du kan melde deg på', () => {
  it('viser cupen, banen og tiden, og knappen melder deg på', async () => {
    answer({ ok: true, view: room('can_join') }, { ok: true, view: room('already_joined') });
    await renderJoin();

    expect(screen.getByTestId('cup-join-name')).toHaveTextContent('Klubbmesterskapet');
    expect(screen.getByText('Team Nord mot Team Sør')).toBeTruthy();
    expect(screen.getByText('Stiklestad Golfbane · lørdag 20. november kl. 10:30')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('cup-join-button'));

    expect(joinCup).toHaveBeenCalledWith('abcd2345');
    expect(screen.getByTestId('cup-join-receipt')).toHaveTextContent('Du er påmeldt. Vi sa fra til arrangøren.');
    expect(screen.getByTestId('cup-join-already_joined')).toBeTruthy();
  });

  it('din egen cup sier ikke at arrangøren har fått beskjed', async () => {
    answer({ ok: true, view: room('can_join') }, { ok: true, view: room('already_joined') });
    (joinCup as jest.Mock).mockResolvedValueOnce({ ok: true, status: 'joined_self' });
    await renderJoin();
    await fireEvent.press(screen.getByTestId('cup-join-button'));
    expect(screen.getByTestId('cup-join-receipt')).toHaveTextContent('Du er påmeldt din egen cup.');
  });

  it('uten plan står ingen linje om bane og tid', async () => {
    answer({ ok: true, view: room('can_join', { courseName: null, when: null }) });
    await renderJoin();
    expect(screen.queryByText(/kl\./)).toBeNull();
  });

  it('serverens nei står, og skjermen hentes på nytt', async () => {
    answer({ ok: true, view: room('can_join') }, { ok: true, view: room('full') });
    (joinCup as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'full' });
    await renderJoin();

    await fireEvent.press(screen.getByTestId('cup-join-button'));

    expect(screen.getByTestId('cup-join-error')).toHaveTextContent('Cupen er full. Den tar 40 spillere.');
    expect(screen.getByTestId('cup-join-full')).toBeTruthy();
  });

  it('uten nett: setningen om nett, og ingen kvittering', async () => {
    answer({ ok: true, view: room('can_join') });
    (joinCup as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'offline' });
    await renderJoin();
    await fireEvent.press(screen.getByTestId('cup-join-button'));
    expect(screen.getByTestId('cup-join-error')).toHaveTextContent(/trenger nett/);
    expect(screen.queryByTestId('cup-join-receipt')).toBeNull();
  });
});

describe('du er påmeldt', () => {
  it('veien til cupen, og «Meld meg av»', async () => {
    answer({ ok: true, view: room('already_joined') }, { ok: true, view: room('can_join') });
    const navigation = await renderJoin();

    await fireEvent.press(screen.getByTestId('cup-join-open-cup'));
    expect(navigation.navigate).toHaveBeenCalledWith('Cup', { cupId: 'cup-1' });

    await fireEvent.press(screen.getByTestId('cup-join-leave'));
    expect(leaveCup).toHaveBeenCalledWith('abcd2345');
    expect(screen.getByTestId('cup-join-receipt')).toHaveTextContent('Du er meldt av. Vi sa fra til arrangøren.');
    expect(screen.getByTestId('cup-join-button')).toBeTruthy();
  });
});

describe('du kan ikke melde deg på', () => {
  it('stengt: setningen og veien til cupen', async () => {
    answer({ ok: true, view: room('closed') });
    await renderJoin();
    expect(screen.getByTestId('cup-join-closed')).toHaveTextContent(/Påmeldingen er stengt/);
    expect(screen.getByTestId('cup-join-open-cup')).toBeTruthy();
    expect(screen.queryByTestId('cup-join-button')).toBeNull();
  });

  it('stengt i en klubb-cup du ikke får se: ingen blindvei', async () => {
    answer({ ok: true, view: room('closed', { canOpenCup: false }) });
    await renderJoin();
    expect(screen.queryByTestId('cup-join-open-cup')).toBeNull();
  });

  it('full: med taket', async () => {
    answer({ ok: true, view: room('full') });
    await renderJoin();
    expect(screen.getByTestId('cup-join-full')).toHaveTextContent(/40 spillere/);
  });

  it('klubb-cup: hvilken klubb, og lenka dit åpner nettsiden', async () => {
    answer({ ok: true, view: room('not_member', { canOpenCup: false, club: { name: 'Stiklestad GK', shortId: 'klubb123' } }) });
    await renderJoin();
    expect(screen.getByTestId('cup-join-not_member')).toHaveTextContent(/medlemmer av Stiklestad GK/);
    expect(screen.getByTestId('cup-join-club')).toBeTruthy();
    expect(screen.queryByTestId('cup-join-open-cup')).toBeNull();
  });

  it('mangler handicap: veien til profilen', async () => {
    answer({ ok: true, view: room('profile_incomplete') });
    const navigation = await renderJoin();
    await fireEvent.press(screen.getByTestId('cup-join-profile'));
    expect(navigation.navigate).toHaveBeenCalledWith('EditProfile', undefined);
  });
});

describe('uten noe å vise', () => {
  it('en lenke som ikke finnes: en setning, uten «Prøv igjen»', async () => {
    answer({ ok: false, reason: 'not_found' });
    await renderJoin();
    expect(screen.getByTestId('cup-join-failed')).toHaveTextContent(/Sjekk at lenken er hel/);
    expect(screen.queryByTestId('cup-join-retry')).toBeNull();
  });

  it('uten nett: «Prøv igjen» henter på nytt', async () => {
    answer({ ok: false, reason: 'offline' }, { ok: true, view: room('can_join') });
    await renderJoin();
    await fireEvent.press(screen.getByTestId('cup-join-retry'));
    await act(async () => {
      mockFocus();
    });
    expect(screen.getByTestId('cup-join-can_join')).toBeTruthy();
  });
});
