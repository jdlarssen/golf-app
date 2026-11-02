// #2752: avslutningen som skjerm (Type C). Kjernen regner alt; her låses det skjermen
// svarer for: hva som stenger knappen, «Avslutt likevel», hvor du havner, og at
// ingenting kan gjøres uten nett.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { AppCupManageView } from '../../../../lib/cup/appCupManageView';
import { finishCup, finishCupMatch } from '../data/cupManage';
import type { ScreenProps } from '../navigation';
import { CupFinish } from './CupFinish';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/cupManage', () => ({
  fetchCupManage: jest.fn(async () => mockResults.shift() ?? mockLast),
  finishCup: jest.fn(async () => ({ ok: true, alreadyFinished: false })),
  finishCupMatch: jest.fn(async () => ({ ok: true, alreadyFinished: false })),
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
    require('react').useEffect(callback, [callback]);
  },
}));

type Load = { ok: true; view: AppCupManageView } | { ok: false; reason: string };
let mockFocus: () => void = () => {};
let mockResults: Load[] = [];
let mockLast: Load = { ok: false, reason: 'offline' };

function answer(...results: Load[]) {
  mockResults = [...results];
  mockLast = results[results.length - 1];
}

const levert = { gameId: 'levert', label: 'Singel 1', side1: 'Ola', side2: 'Kari', blocksFinish: false };
const mangler = { gameId: 'mangler', label: 'Singel 4', side1: 'Tapp', side2: 'Per', blocksFinish: true };

const room = (over: Partial<AppCupManageView['finish']> = {}, status: AppCupManageView['status'] = 'active'): AppCupManageView => ({
  id: 'cup-1',
  name: 'Klubbmesterskapet',
  status,
  team1Name: 'Team Nord',
  team2Name: 'Team Sør',
  players: [],
  matches: [],
  sideAwards: [],
  finish: { progress: { played: 3, total: 8 }, missingAwards: [], activeMatches: [], ...over },
});

function navigationStub() {
  return {
    navigate: jest.fn(),
    popTo: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    setParams: jest.fn(),
    addListener: jest.fn(() => () => {}),
    getState: () => ({
      index: 3,
      routes: [
        { name: 'Home' },
        { name: 'Cup', params: { cupId: 'cup-1' } },
        { name: 'CupManage', params: { cupId: 'cup-1' } },
        { name: 'CupFinish', params: { cupId: 'cup-1' } },
      ],
    }),
  };
}

async function renderFinish() {
  const navigation = navigationStub();
  await render(
    <CupFinish
      {...({
        navigation,
        route: { key: 'f', name: 'CupFinish', params: { cupId: 'cup-1' } },
      } as unknown as ScreenProps<'CupFinish'>)}
    />,
  );
  return navigation;
}

const refocus = async () => {
  await act(async () => {
    mockFocus();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('hele cupen', () => {
  it('uten noe i veien: «Avslutt cupen», og du havner i cup-rommet med kvitteringen', async () => {
    answer({ ok: true, view: room({ activeMatches: [levert] }) });
    const navigation = await renderFinish();

    expect(screen.getByTestId('cup-finish-progress')).toHaveTextContent('3 av 8 matcher spilt');
    expect(screen.getByTestId('cup-finish-submit')).toHaveTextContent('Avslutt cupen');
    expect(screen.queryByTestId('cup-finish-not-submitted')).toBeNull();

    await fireEvent.press(screen.getByTestId('cup-finish-submit'));

    expect(finishCup).toHaveBeenCalledWith('cup-1', false);
    expect(navigation.popTo).toHaveBeenCalledWith('Cup', { cupId: 'cup-1', notice: 'cup_finished' });
  });

  it('kamper uten levering: lista, og «Avslutt likevel» sender allowMissing', async () => {
    answer({ ok: true, view: room({ activeMatches: [levert, mangler] }) });
    await renderFinish();

    expect(screen.getByTestId('cup-finish-not-submitted')).toHaveTextContent(
      'Noen kamper mangler leverte scorekort: Singel 4. Du kan avslutte cupen likevel — de som ikke har levert, teller ikke i resultatet.',
    );
    expect(screen.getByTestId('cup-finish-submit')).toHaveTextContent('Avslutt likevel');

    await fireEvent.press(screen.getByTestId('cup-finish-submit'));
    expect(finishCup).toHaveBeenCalledWith('cup-1', true);
  });

  it('sidepoeng som mangler: knappen er stengt og sier hvorfor, med vei til registreringen', async () => {
    answer({ ok: true, view: room({ missingAwards: [{ kind: 'ctp', holeNumber: 7 }] }) });
    const navigation = await renderFinish();

    expect(screen.getByTestId('cup-finish-awards-hint')).toHaveTextContent(
      'Registrer alle sidepoeng før du kan avslutte cupen: Nærmest pinnen (hull 7)',
    );
    await fireEvent.press(screen.getByTestId('cup-finish-submit'));
    expect(finishCup).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('cup-finish-open-awards'));
    expect(navigation.navigate).toHaveBeenCalledWith('CupSideAwards', { cupId: 'cup-1' });
  });

  it('en utdatert skjerm henter på nytt i stedet for å vise en feil', async () => {
    answer(
      { ok: true, view: room() },
      { ok: true, view: room({ activeMatches: [mangler] }) },
    );
    (finishCup as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'matches_not_submitted' });
    const navigation = await renderFinish();

    await fireEvent.press(screen.getByTestId('cup-finish-submit'));

    expect(screen.queryByTestId('cup-finish-error')).toBeNull();
    expect(screen.getByTestId('cup-finish-submit')).toHaveTextContent('Avslutt likevel');
    expect(navigation.popTo).not.toHaveBeenCalled();
  });

  it('en kamp som ikke lot seg avslutte: navngis, og cupen står', async () => {
    answer({ ok: true, view: room({ activeMatches: [levert] }) });
    (finishCup as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'match_finish_failed' });
    const navigation = await renderFinish();

    await fireEvent.press(screen.getByTestId('cup-finish-submit'));

    expect(screen.getByTestId('cup-finish-error')).toHaveTextContent(/^Disse kampene lot seg ikke avslutte: Singel 1\./);
    expect(navigation.popTo).not.toHaveBeenCalled();
  });

  it('en cup som allerede er avsluttet, har ingen knapp', async () => {
    answer({ ok: true, view: room({}, 'finished') });
    await renderFinish();
    expect(screen.getByTestId('cup-finish-already')).toHaveTextContent('Cupen er allerede avsluttet.');
    expect(screen.queryByTestId('cup-finish-submit')).toBeNull();
  });

  it('et utkast har ingen knapp', async () => {
    answer({ ok: true, view: room({}, 'draft') });
    await renderFinish();
    expect(screen.getByTestId('cup-finish-not-running')).toBeTruthy();
    expect(screen.queryByTestId('cup-finish-submit')).toBeNull();
  });
});

describe('én kamp', () => {
  it('spør først, avslutter, og står igjen på lista med kvitteringen', async () => {
    answer(
      { ok: true, view: room({ activeMatches: [levert] }) },
      { ok: true, view: room({ activeMatches: [] }) },
    );
    await renderFinish();

    await fireEvent.press(screen.getByTestId('cup-finish-open-match-levert'));
    expect(screen.getByTestId('cup-finish-match-title')).toHaveTextContent('Avslutt Singel 1?');
    expect(finishCupMatch).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('cup-finish-match-submit'));

    expect(finishCupMatch).toHaveBeenCalledWith('cup-1', 'levert', false);
    expect(screen.getByTestId('cup-finish-screen')).toBeTruthy();
    expect(screen.getByTestId('cup-finish-match-done')).toHaveTextContent('Kampen er avsluttet.');
  });

  it('uten levering: sier hva det betyr, og «Avslutt likevel» sender allowMissing', async () => {
    answer({ ok: true, view: room({ activeMatches: [mangler] }) });
    await renderFinish();

    await fireEvent.press(screen.getByTestId('cup-finish-open-match-mangler'));
    expect(screen.getByTestId('cup-finish-match-missing')).toHaveTextContent(/^Noen har ikke levert scorekort i Singel 4\./);
    expect(screen.getByTestId('cup-finish-match-submit')).toHaveTextContent('Avslutt likevel');

    await fireEvent.press(screen.getByTestId('cup-finish-match-submit'));
    expect(finishCupMatch).toHaveBeenCalledWith('cup-1', 'mangler', true);
  });

  it('peer-godkjenning som mangler: serverens nei står, og ingenting er avsluttet', async () => {
    answer({ ok: true, view: room({ activeMatches: [levert] }) });
    (finishCupMatch as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'not_all_approved' });
    await renderFinish();

    await fireEvent.press(screen.getByTestId('cup-finish-open-match-levert'));
    await fireEvent.press(screen.getByTestId('cup-finish-match-submit'));

    expect(screen.getByTestId('cup-finish-error')).toHaveTextContent(/venter på godkjenning/);
    expect(screen.getByTestId('cup-finish-match-screen')).toBeTruthy();
  });

  it('noen trakk tilbake kortet: spørsmålet blir «Avslutt likevel», uten en feil', async () => {
    answer(
      { ok: true, view: room({ activeMatches: [levert] }) },
      { ok: true, view: room({ activeMatches: [{ ...levert, blocksFinish: true }] }) },
    );
    (finishCupMatch as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'not_all_submitted' });
    await renderFinish();

    await fireEvent.press(screen.getByTestId('cup-finish-open-match-levert'));
    await fireEvent.press(screen.getByTestId('cup-finish-match-submit'));

    expect(screen.queryByTestId('cup-finish-error')).toBeNull();
    expect(screen.getByTestId('cup-finish-match-submit')).toHaveTextContent('Avslutt likevel');
  });

  it('«Avbryt» går tilbake til lista', async () => {
    answer({ ok: true, view: room({ activeMatches: [levert] }) });
    await renderFinish();

    await fireEvent.press(screen.getByTestId('cup-finish-open-match-levert'));
    await fireEvent.press(screen.getByTestId('cup-finish-match-cancel'));

    expect(screen.getByTestId('cup-finish-screen')).toBeTruthy();
    expect(finishCupMatch).not.toHaveBeenCalled();
  });
});

describe('uten nett', () => {
  it('står det skjermen har, uten knapper som lover noe', async () => {
    answer({ ok: true, view: room({ activeMatches: [levert] }) }, { ok: false, reason: 'offline' });
    await renderFinish();
    await refocus();

    expect(screen.getByTestId('cup-finish-stale')).toBeTruthy();
    expect(screen.queryByTestId('cup-finish-open-match-levert')).toBeNull();
    await fireEvent.press(screen.getByTestId('cup-finish-submit'));
    expect(finishCup).not.toHaveBeenCalled();
  });

  it('uten noe hentet: feilen og «Prøv igjen»', async () => {
    answer({ ok: false, reason: 'offline' });
    await renderFinish();
    expect(screen.getByTestId('cup-finish-failed')).toBeTruthy();
    expect(screen.getByTestId('cup-finish-retry')).toBeTruthy();
  });

  it('den som ikke styrer cupen: ingen «Prøv igjen»', async () => {
    answer({ ok: false, reason: 'not_manager' });
    await renderFinish();
    expect(screen.getByTestId('cup-finish-failed')).toHaveTextContent('Det er arrangøren som styrer cupen.');
    expect(screen.queryByTestId('cup-finish-retry')).toBeNull();
  });
});
