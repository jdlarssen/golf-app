// #2752: registreringen av sidepoeng som skjerm (Type C). Reglene er på serveren; her
// låses valgene og hva som sendes, at 0 er et svar, og at en ferdig cup kan rettes.
// #2283 (V3): og at «Meldt inn fra kampene» bare er tekst under kåringene. Ordlyden og
// reglene i boksene er låst i `lib/cupSideReportsCopy.parity.test.ts`; her står at
// skjermen tegner dem på rett sted og lar valgene og tellerne stå tomme.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { AppCupManageView, AppCupSideAward } from '../../../../lib/cup/appCupManageView';
import type { CupSideReportsResult } from '../../../../lib/cup/cupSideReports';
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
let mockScheme: 'light' | 'dark' = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme,
}));
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

const room = (
  sideAwards: AppCupSideAward[],
  status: AppCupManageView['status'] = 'active',
  sideReports?: CupSideReportsResult,
): AppCupManageView => ({
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
  ...(sideReports === undefined ? {} : { sideReports }),
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
  mockScheme = 'light';
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

describe('det kampene har meldt inn (#2283, V3)', () => {
  const reports: CupSideReportsResult = {
    slots: [
      {
        kind: 'ctp',
        holeNumber: 7,
        lines: [
          { gameId: 'g2', matchLabel: 'Four-ball 2', name: 'Kristian', distanceM: 1.8 },
          { gameId: 'g1', matchLabel: 'Four-ball 1', name: 'Marte', distanceM: 2.4 },
        ],
        missing: [{ gameId: 'g3', matchLabel: 'Four-ball 3' }],
      },
      {
        kind: 'ld',
        holeNumber: 9,
        lines: [
          { gameId: 'g1', matchLabel: 'Four-ball 1', name: 'Jonas', distanceM: null },
          { gameId: 'g2', matchLabel: 'Four-ball 2', name: null, distanceM: null },
        ],
        missing: [],
      },
    ],
    gir: [
      {
        holeNumber: 12,
        maxPerTeam: 2,
        team1: { count: 3, names: ['Jonas', 'Marte', 'Sigrid'], overMax: true },
        team2: { count: 1, names: ['Tore'], overMax: false },
        reportedMatches: 2,
        missing: [],
      },
    ],
  };
  const awards = [ctp(), ctp({ id: 'ld', kind: 'ld', holeNumber: 9 }), gir()];

  it('en boks per kåring: kampen som avsender, vinneren, avstanden, «Ingen på fairway» og kampen som mangler', async () => {
    answer({ ok: true, view: room(awards, 'active', reports) });
    await renderAwards();

    const ctpBox = screen.getByTestId('side-reports-ctp');
    expect(screen.getAllByText('Meldt inn fra kampene')).toHaveLength(3);
    expect(screen.getByTestId('side-reports-line-ctp-g2')).toHaveTextContent('Four-ball 2Kristian1,8 m');
    expect(screen.getByTestId('side-reports-line-ctp-g1')).toHaveTextContent('Four-ball 1Marte2,4 m');
    expect(screen.getByTestId('side-reports-missing-ctp-g3')).toHaveTextContent('Four-ball 3 har ikke meldt inn');
    // Boksen står inne i kåringens kort, over «Registrer».
    expect(screen.getByTestId('side-award-ctp')).toContainElement(ctpBox);

    expect(screen.getByTestId('side-reports-line-ld-g1')).toHaveTextContent('Four-ball 1Jonas');
    expect(screen.getByTestId('side-reports-line-ld-g2')).toHaveTextContent('Four-ball 2Ingen på fairway');
  });

  it('GIR: én boks under begge tellerne, ett lag per linje, og over maks i advarselsfargen', async () => {
    answer({ ok: true, view: room(awards, 'active', reports) });
    await renderAwards();

    expect(screen.getAllByTestId('side-reports-gir')).toHaveLength(1);
    const red = screen.getByTestId('side-reports-team1-gir');
    expect(red).toHaveTextContent('Team Nord: 3 (Jonas, Marte, Sigrid) · maks 2 GIR');
    expect(red).toHaveStyle({ color: '#7A5410' });
    const blue = screen.getByTestId('side-reports-team2-gir');
    expect(blue).toHaveTextContent('Team Sør: 1 (Tore)');
    expect(blue).not.toHaveTextContent('maks');
    expect(blue).toHaveStyle({ color: '#4A3F30' });
  });

  it('natt: boksen står på nattens bakgrunn og advarselen i nattens farge', async () => {
    mockScheme = 'dark';
    answer({ ok: true, view: room(awards, 'active', reports) });
    await renderAwards();

    expect(screen.getByTestId('side-reports-ctp')).toHaveStyle({ backgroundColor: '#14201A' });
    expect(screen.getByTestId('side-reports-team1-gir')).toHaveStyle({ color: '#E5B26F' });
  });

  it('valgene og tellerne står tomme, og registreringen virker som før', async () => {
    answer({ ok: true, view: room(awards, 'active', reports) });
    await renderAwards();

    expect(screen.getByTestId('side-award-option-ctp-ola').props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('side-award-option-ctp-none').props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('gir-count-1-gir').props.value).toBe('');
    expect(screen.getByTestId('gir-count-2-gir').props.value).toBe('');

    await fireEvent.press(screen.getByTestId('side-award-option-ctp-ola'));
    await fireEvent.press(screen.getByTestId('side-award-register-ctp'));
    expect(registerSideAwardWinner).toHaveBeenCalledWith('cup-1', 'ctp', 'ola');

    await fireEvent.changeText(screen.getByTestId('gir-count-1-gir'), '2');
    await fireEvent.changeText(screen.getByTestId('gir-count-2-gir'), '1');
    await fireEvent.press(screen.getByTestId('side-award-register-gir'));
    expect(registerGirCounts).toHaveBeenCalledWith('cup-1', 'gir', 2, 1);
  });

  it('ingen har meldt inn: én setning i hver boks, og kampene nevnes ikke', async () => {
    answer({
      ok: true,
      view: room(awards, 'active', {
        slots: [
          { kind: 'ctp', holeNumber: 7, lines: [], missing: [{ gameId: 'g1', matchLabel: 'Four-ball 1' }] },
          { kind: 'ld', holeNumber: 9, lines: [], missing: [{ gameId: 'g1', matchLabel: 'Four-ball 1' }] },
        ],
        gir: [
          {
            holeNumber: 12,
            maxPerTeam: 2,
            team1: { count: 0, names: [], overMax: false },
            team2: { count: 0, names: [], overMax: false },
            reportedMatches: 0,
            missing: [{ gameId: 'g1', matchLabel: 'Four-ball 1' }],
          },
        ],
      }),
    });
    await renderAwards();

    for (const id of ['ctp', 'ld', 'gir']) {
      expect(screen.getByTestId(`side-reports-empty-${id}`)).toHaveTextContent('Ingen kamper har meldt inn ennå.');
    }
    expect(screen.queryByText(/har ikke meldt inn$/)).toBeNull();
  });

  it('en kamp uten navn heter «Match», og en kamp som mangler på GIR står under lagene', async () => {
    answer({
      ok: true,
      view: room([ctp(), gir()], 'active', {
        slots: [
          {
            kind: 'ctp',
            holeNumber: 7,
            lines: [{ gameId: 'g1', matchLabel: null, name: 'Marte', distanceM: 2 }],
            missing: [{ gameId: 'g2', matchLabel: null }],
          },
        ],
        gir: [
          {
            holeNumber: 12,
            maxPerTeam: 4,
            team1: { count: 1, names: ['Jonas'], overMax: false },
            team2: { count: 0, names: [], overMax: false },
            reportedMatches: 1,
            missing: [{ gameId: 'g2', matchLabel: 'Four-ball 2' }],
          },
        ],
      }),
    });
    await renderAwards();

    expect(screen.getByTestId('side-reports-line-ctp-g1')).toHaveTextContent('MatchMarte2,0 m');
    expect(screen.getByTestId('side-reports-missing-ctp-g2')).toHaveTextContent('Match har ikke meldt inn');
    expect(screen.getByTestId('side-reports-team2-gir')).toHaveTextContent(/^Team Sør: 0$/);
    expect(screen.getByTestId('side-reports-missing-gir-g2')).toHaveTextContent('Four-ball 2 har ikke meldt inn');
  });

  it('lesingen feilet: boksen sier det, og registreringen står som før', async () => {
    answer({ ok: true, view: room(awards, 'active', 'failed') });
    await renderAwards();

    for (const id of ['ctp', 'ld', 'gir']) {
      expect(screen.getByTestId(`side-reports-empty-${id}`)).toHaveTextContent(
        'Fikk ikke hentet det kampene har meldt inn.',
      );
    }
    await fireEvent.press(screen.getByTestId('side-award-option-ctp-none'));
    await fireEvent.press(screen.getByTestId('side-award-register-ctp'));
    expect(registerSideAwardWinner).toHaveBeenCalledWith('cup-1', 'ctp', null);
  });

  it('en tjener uten rapporten (eller en cup uten noe å melde): ingen bokser, ingenting velter', async () => {
    answer({ ok: true, view: room(awards) });
    await renderAwards();
    expect(screen.getByTestId('side-award-ctp')).toBeTruthy();
    expect(screen.queryByText('Meldt inn fra kampene')).toBeNull();

    answer({ ok: true, view: room(awards, 'active', null) });
    await refocus();
    expect(screen.queryByText('Meldt inn fra kampene')).toBeNull();
  });

  it('et hull som ikke står i rapporten, får ingen boks', async () => {
    answer({ ok: true, view: room([ctp({ holeNumber: 3 })], 'active', { slots: [], gir: [] }) });
    await renderAwards();
    expect(screen.queryByTestId('side-reports-ctp')).toBeNull();
  });
});
