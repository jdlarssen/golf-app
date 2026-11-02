// #2752: registreringen av sidepoeng som skjerm (Type C). Reglene er på serveren; her
// låses valgene og hva som sendes, at 0 er et svar, og at en ferdig cup kan rettes.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { AppCupManageView, AppCupSideAward } from '../../../../lib/cup/appCupManageView';
import { registerGirCounts, registerSideAwardWinner } from '../data/cupManage';
import type { ScreenProps } from '../navigation';
import { CupSideAwards } from './CupSideAwards';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/cupManage', () => ({
  fetchCupManage: jest.fn(async () => mockResults.shift() ?? mockLast),
  registerGirCounts: jest.fn(async () => ({ ok: true })),
  registerSideAwardWinner: jest.fn(async () => ({ ok: true })),
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

const ctp = (over: Partial<Extract<AppCupSideAward, { kind: 'ctp' | 'ld' }>> = {}): AppCupSideAward => ({
  id: 'ctp',
  kind: 'ctp',
  holeNumber: 7,
  points: 1,
  slot: 1,
  slotCount: 1,
  winnerUserId: null,
  noWinner: false,
  ...over,
});
const gir = (over: Partial<Extract<AppCupSideAward, { kind: 'gir' }>> = {}): AppCupSideAward => ({
  id: 'gir',
  kind: 'gir',
  holeNumber: 12,
  points: 1,
  maxPerTeam: 4,
  team1Count: null,
  team2Count: null,
  ...over,
});

const room = (sideAwards: AppCupSideAward[], status: AppCupManageView['status'] = 'active'): AppCupManageView => ({
  id: 'cup-1',
  name: 'Klubbmesterskapet',
  status,
  team1Name: 'Team Nord',
  team2Name: 'Team Sør',
  players: [
    { userId: 'ola', name: 'Ola Kompis', team: 1, withdrawn: false, canAct: true },
    { userId: 'kari', name: 'Kari Arrangør', team: 2, withdrawn: false, canAct: true },
  ],
  matches: [],
  sideAwards,
  finish: { progress: { played: 0, total: 1 }, missingAwards: [], activeMatches: [] },
});

async function renderAwards() {
  await render(
    <CupSideAwards
      {...({
        navigation: {},
        route: { key: 's', name: 'CupSideAwards', params: { cupId: 'cup-1' } },
      } as unknown as ScreenProps<'CupSideAwards'>)}
    />,
  );
}

const refocus = async () => {
  await act(async () => {
    mockFocus();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('nærmest pinnen og lengste drive', () => {
  it('velg en spiller og registrer: serveren får vinneren, og det står at den er registrert', async () => {
    answer({ ok: true, view: room([ctp()]) });
    await renderAwards();

    expect(screen.getByText('Nærmest pinnen · hull 7')).toBeTruthy();
    expect(screen.getByText('Team Nord')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('side-award-register-ctp'));
    expect(registerSideAwardWinner).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('side-award-option-ctp-ola'));
    await fireEvent.press(screen.getByTestId('side-award-register-ctp'));

    expect(registerSideAwardWinner).toHaveBeenCalledWith('cup-1', 'ctp', 'ola');
    expect(screen.getByTestId('side-award-saved-ctp')).toHaveTextContent('Vinneren er registrert.');
  });

  it('«Ingen kvalifiserte» sendes som null', async () => {
    answer({ ok: true, view: room([ctp()]) });
    await renderAwards();

    await fireEvent.press(screen.getByTestId('side-award-option-ctp-none'));
    await fireEvent.press(screen.getByTestId('side-award-register-ctp'));

    expect(registerSideAwardWinner).toHaveBeenCalledWith('cup-1', 'ctp', null);
    expect(screen.getByTestId('side-award-saved-ctp')).toHaveTextContent('Registrert: ingen vant her.');
  });

  it('det som er registrert, står valgt', async () => {
    answer({ ok: true, view: room([ctp({ winnerUserId: 'kari' }), ctp({ id: 'ingen', noWinner: true })]) });
    await renderAwards();

    expect(screen.getByTestId('side-award-option-ctp-kari').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('side-award-option-ingen-none').props.accessibilityState.selected).toBe(true);
  });

  it('flere plasser på ett hull står med «(2 av 3)»', async () => {
    answer({ ok: true, view: room([ctp({ slot: 2, slotCount: 3 })]) });
    await renderAwards();
    expect(screen.getByText('Nærmest pinnen · hull 7 (2 av 3)')).toBeTruthy();
  });

  it('en spiller utenfor cupen: serverens ord', async () => {
    answer({ ok: true, view: room([ctp()]) });
    (registerSideAwardWinner as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'not_a_participant' });
    await renderAwards();

    await fireEvent.press(screen.getByTestId('side-award-option-ctp-ola'));
    await fireEvent.press(screen.getByTestId('side-award-register-ctp'));

    expect(screen.getByTestId('side-award-error-ctp')).toHaveTextContent('Spilleren er ikke med i cupens spillerliste.');
  });

  it('mange spillere: søket finner dem', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      userId: `p${i}`,
      name: `Spiller ${i}`,
      team: 1 as const,
      withdrawn: false,
      canAct: true,
    }));
    answer({ ok: true, view: { ...room([ctp()]), players: many } });
    await renderAwards();

    expect(screen.queryByTestId('side-award-option-ctp-p29')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('side-award-search-ctp'), 'Spiller 29');
    expect(screen.getByTestId('side-award-option-ctp-p29')).toBeTruthy();
    expect(screen.getByTestId('side-award-option-ctp-none')).toBeTruthy();
  });
});

describe('GIR', () => {
  it('begge lag må fylles, og 0 er et svar', async () => {
    answer({ ok: true, view: room([gir()]) });
    await renderAwards();

    expect(screen.getByText('Hvor mange GIR klarte Team Nord?')).toBeTruthy();
    expect(screen.getAllByText('av 4')).toHaveLength(2);

    await fireEvent.changeText(screen.getByTestId('gir-count-1-gir'), '2');
    await fireEvent.press(screen.getByTestId('side-award-register-gir'));
    expect(registerGirCounts).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('gir-count-2-gir'), '0');
    await fireEvent.press(screen.getByTestId('side-award-register-gir'));

    expect(registerGirCounts).toHaveBeenCalledWith('cup-1', 'gir', 2, 0);
    expect(screen.getByTestId('side-award-saved-gir')).toHaveTextContent('GIR-tellingen er registrert.');
  });

  it('tegn som ikke er sifre, tas bort', async () => {
    answer({ ok: true, view: room([gir()]) });
    await renderAwards();
    await fireEvent.changeText(screen.getByTestId('gir-count-1-gir'), '2,5');
    expect(screen.getByTestId('gir-count-1-gir').props.value).toBe('25');
  });

  it('et tall utenfor grensen: serverens nei, med taket', async () => {
    answer({ ok: true, view: room([gir({ team1Count: 1, team2Count: 1 })]) });
    (registerGirCounts as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'invalid_counts' });
    await renderAwards();

    await fireEvent.press(screen.getByTestId('side-award-register-gir'));

    expect(screen.getByTestId('side-award-error-gir')).toHaveTextContent('Tallet må være mellom 0 og 4.');
  });
});

describe('rommet', () => {
  it('en ferdig cup sier at vinneren regnes på nytt, og kan rettes', async () => {
    answer({ ok: true, view: room([ctp({ winnerUserId: 'ola' })], 'finished') });
    await renderAwards();

    expect(screen.getByTestId('cup-side-awards-finished')).toHaveTextContent(
      'Cupen er avsluttet. Retter du et sidepoeng, regnes vinneren på nytt.',
    );
    await fireEvent.press(screen.getByTestId('side-award-register-ctp'));
    expect(registerSideAwardWinner).toHaveBeenCalledWith('cup-1', 'ctp', 'ola');
  });

  it('uten sidepoeng: det står', async () => {
    answer({ ok: true, view: room([]) });
    await renderAwards();
    expect(screen.getByTestId('cup-side-awards-empty')).toBeTruthy();
  });

  it('uten nett: registreringen står, men sender ingenting', async () => {
    answer({ ok: true, view: room([ctp({ winnerUserId: 'ola' })]) }, { ok: false, reason: 'offline' });
    await renderAwards();
    await refocus();

    expect(screen.getByTestId('cup-side-awards-stale')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('side-award-register-ctp'));
    expect(registerSideAwardWinner).not.toHaveBeenCalled();
  });

  it('uten noe hentet: feilen og «Prøv igjen»', async () => {
    answer({ ok: false, reason: 'offline' });
    await renderAwards();
    expect(screen.getByTestId('cup-side-awards-retry')).toBeTruthy();
  });
});
