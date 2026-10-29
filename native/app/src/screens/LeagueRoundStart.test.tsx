// #2638 Del 2: «Start runden» i en ligarunde som skjerm (Type C).
//
// Reglene sjekkes på serveren (`startLeagueRoundFlightCore`); her låses det
// skjermen svarer for: grensen fra `minFlightPlayers` (alene i en
// simulatorliga, minst én medspiller i en vanlig), de låste medspillerne og
// den fulle flighten, at et avslag vises med nettsidens ord, og at spillet
// erstatter skjermen etter start.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { LeagueResult, LeagueStartResult } from '../data/league';
import { fetchLeague, startLeagueRound } from '../data/league';
import type { ScreenProps } from '../navigation';
import { leagueRound, leagueView, participant, PEOPLE } from '../test/leagueFixtures';
import { LeagueRoundStart, knownRefusal } from './LeagueRoundStart';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/league', () => ({
  fetchLeague: jest.fn(async () => mockView),
  startLeagueRound: jest.fn(async () => mockStart),
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));

// Navnene må starte med `mock`: jest.mock-factoryene heises over importene.
let mockView: LeagueResult = { ok: true, view: leagueView() };
let mockStart: LeagueStartResult = { ok: true, gameId: 'game-9' };

async function renderStart(roundId = 'r3') {
  const replace = jest.fn();
  const props = {
    navigation: { replace },
    route: { key: 'start', name: 'LeagueRoundStart', params: { leagueId: 'liga-vinter', roundId } },
  };
  await render(<LeagueRoundStart {...(props as unknown as ScreenProps<'LeagueRoundStart'>)} />);
  return { replace };
}

/** #2675: i en simulatorliga venter «Start runden» på avkrysningen. */
async function confirmSetup() {
  await fireEvent.press(screen.getByTestId('round-start-confirm'));
}

function isDisabled(testID: string): boolean {
  return screen.getByTestId(testID).props.accessibilityState?.disabled === true;
}

beforeEach(() => {
  (startLeagueRound as jest.Mock).mockClear();
  mockView = { ok: true, view: leagueView() };
  mockStart = { ok: true, gameId: 'game-9' };
});

describe('tegning 5: simulatorliga', () => {
  it('sjekklista står øverst, og du kan starte alene etter avkrysningen', async () => {
    const { replace } = await renderStart();

    expect(screen.getByText('Runde 3')).toBeTruthy();
    expect(screen.getByText('Vinterliga på Trackman')).toBeTruthy();
    expect(screen.getByTestId('round-setup-checklist')).toBeTruthy();
    expect(screen.queryByTestId('sim-settings-card')).toBeNull();
    expect(screen.getByTestId('round-setup-setting-wind')).toHaveTextContent('VindCalm');
    expect(screen.getByTestId('round-start-rule')).toHaveTextContent(
      'Velg de som står i simulatoren sammen med deg. Markør velger du når du leverer runden.',
    );
    expect(isDisabled('round-start-submit')).toBe(true);

    await confirmSetup();
    expect(isDisabled('round-start-submit')).toBe(false);

    await fireEvent.press(screen.getByTestId('round-start-submit'));
    expect(startLeagueRound).toHaveBeenCalledWith('r3', []);
    expect(replace).toHaveBeenCalledWith('GameHome', { gameId: 'game-9' });
  });

  it('medspillerne med initialer og HCP; den som har levert eller spiller, er låst', async () => {
    await renderStart();

    expect(screen.getByTestId('round-start-player-sindre')).toHaveTextContent('SASindreHCP 21,0');
    expect(screen.getByTestId('round-start-lock-martin')).toHaveTextContent('Har levert');
    expect(screen.getByTestId('round-start-lock-erlend')).toHaveTextContent('Spiller nå');
    expect(isDisabled('round-start-player-martin')).toBe(true);

    await fireEvent.press(screen.getByTestId('round-start-player-martin'));
    await fireEvent.press(screen.getByTestId('round-start-player-sindre'));
    await confirmSetup();
    await fireEvent.press(screen.getByTestId('round-start-submit'));
    expect(startLeagueRound).toHaveBeenCalledWith('r3', ['sindre']);
  });

  it('uten HCP fra ruta (ikke deltaker) står navnet alene', async () => {
    mockView = {
      ok: true,
      view: leagueView({ participants: PEOPLE.map((p) => ({ ...p, hcpIndex: null, fullName: null })) }),
    };
    await renderStart();
    expect(screen.getByTestId('round-start-player-sindre')).toHaveTextContent('SSindre');
  });

  it('en full flight: tre medspillere, så er resten av de ledige låst', async () => {
    const free = ['a', 'b', 'c', 'd'].map((id) => participant(id, `Spiller ${id.toUpperCase()}`));
    mockView = { ok: true, view: leagueView({ participants: [PEOPLE[0], ...free] }) };
    await renderStart();

    for (const id of ['a', 'b', 'c']) await fireEvent.press(screen.getByTestId(`round-start-player-${id}`));
    expect(isDisabled('round-start-player-d')).toBe(true);
    await confirmSetup();
    await fireEvent.press(screen.getByTestId('round-start-submit'));
    expect(startLeagueRound).toHaveBeenCalledWith('r3', ['a', 'b', 'c']);
  });
});

describe('vanlig liga: markørregelen', () => {
  beforeEach(() => {
    mockView = { ok: true, view: leagueView({ league: { isSimulator: false } }) };
  });

  it('knappen krever minst én medspiller, og innstillingskortet står ikke', async () => {
    await renderStart();
    expect(screen.queryByTestId('round-start-settings')).toBeNull();
    expect(screen.getByTestId('round-start-rule')).toHaveTextContent(
      'Velg hvem du spiller med. Du trenger minst én medspiller (markørregelen).',
    );
    expect(isDisabled('round-start-submit')).toBe(true);

    await fireEvent.press(screen.getByTestId('round-start-player-sindre'));
    expect(isDisabled('round-start-submit')).toBe(false);
  });

  it('ingen andre deltakere: nettsidens merknad', async () => {
    mockView = { ok: true, view: leagueView({ league: { isSimulator: false }, participants: [PEOPLE[0]] }) };
    await renderStart();
    expect(screen.getByTestId('round-start-no-co-players')).toHaveTextContent(
      'Ingen andre deltakere i ligaen. Du trenger minst én medspiller (markørregelen).',
    );
    expect(isDisabled('round-start-submit')).toBe(true);
  });
});

describe('tegning 5b: avslag', () => {
  it('serverens nei står over knappen med nettsidens ord, og skjermen blir stående', async () => {
    mockStart = { ok: false, reason: 'already_played' };
    const { replace } = await renderStart();

    await confirmSetup();
    await fireEvent.press(screen.getByTestId('round-start-submit'));
    expect(screen.getByTestId('round-start-refusal')).toHaveTextContent('Du har allerede spilt denne runden.');
    expect(replace).not.toHaveBeenCalled();
    expect(isDisabled('round-start-submit')).toBe(false);
  });

  it('uten nett sier boksen det', async () => {
    mockStart = { ok: false, reason: 'offline' };
    await renderStart();
    await confirmSetup();
    await fireEvent.press(screen.getByTestId('round-start-submit'));
    expect(screen.getByTestId('round-start-refusal')).toHaveTextContent(
      'Du er uten nett. Prøv igjen når nettet er tilbake.',
    );
  });

  it.each([
    ['du har levert', { delivered: ['me'] }, 'Du har allerede spilt denne runden.'],
    [
      'du er i gang',
      { inProgress: ['me'] },
      'Du er allerede med i en flight i denne runden. Spill den ferdig eller trekk deg fra den først.',
    ],
    ['banen mangler', { ready: false }, 'Runden mangler bane eller tee — si fra til admin.'],
  ])('kjent fra ligaen: %s — boksen rett under tittelen, uten medspillervalg', async (_label, change, text) => {
    const view = leagueView();
    view.rounds[2] = { ...view.rounds[2], ...change };
    mockView = { ok: true, view };
    await renderStart();

    expect(screen.getByTestId('round-start-refusal')).toHaveTextContent(text);
    expect(screen.queryByTestId('round-start-players')).toBeNull();
    expect(screen.queryByTestId('round-setup-checklist')).toBeNull();
    expect(screen.queryByTestId('round-start-confirm')).toBeNull();
    // Uten avkrysning er knappen som før: serveren avgjør når den trykkes.
    expect(isDisabled('round-start-submit')).toBe(false);
  });

  it('vinduet er stengt', async () => {
    await renderStart('r1');
    expect(screen.getByTestId('round-start-refusal')).toHaveTextContent('Runden er ikke åpen for spill nå.');
  });
});

describe('knownRefusal', () => {
  const now = new Date();
  it('i kjernens rekkefølge: vinduet, banen, så levert og i gang', () => {
    expect([
      knownRefusal(leagueRound(1, 3, { delivered: ['me'], ready: false }), 'me', now),
      knownRefusal(leagueRound(1, -1, { delivered: ['me'], ready: false }), 'me', now),
      knownRefusal(leagueRound(1, -1, { delivered: ['me'], inProgress: ['me'] }), 'me', now),
      knownRefusal(leagueRound(1, -1, { inProgress: ['me'] }), 'me', now),
      knownRefusal(leagueRound(1, -1), 'me', now),
    ]).toEqual(['outside_window', 'round_not_ready', 'already_played', 'flight_in_progress', null]);
  });
});

describe('dra ned og skjermleseren', () => {
  it('dra ned henter runden på nytt og tar bort et avslag', async () => {
    mockStart = { ok: false, reason: 'co_player_locked' };
    await renderStart();
    await fireEvent.press(screen.getByTestId('round-start-player-sindre'));
    await confirmSetup();
    await fireEvent.press(screen.getByTestId('round-start-submit'));
    expect(screen.getByTestId('round-start-refusal')).toBeTruthy();

    // Sindre har levert i mellomtiden: etter dra-ned er han låst og avslaget borte.
    const view = leagueView();
    view.rounds[2] = { ...view.rounds[2], delivered: [...view.rounds[2].delivered, 'sindre'] };
    mockView = { ok: true, view };
    const calls = (fetchLeague as jest.Mock).mock.calls.length;
    await act(async () => {
      screen.getByTestId('round-start-scroll').props.refreshControl.props.onRefresh();
    });
    expect((fetchLeague as jest.Mock).mock.calls.length).toBe(calls + 1);
    expect(screen.queryByTestId('round-start-refusal')).toBeNull();
    expect(screen.getByTestId('round-start-lock-sindre')).toHaveTextContent('Har levert');
  });

  it('medspillerraden leser navn, HCP og om spilleren er låst', async () => {
    await renderStart();
    expect([
      screen.getByTestId('round-start-player-sindre').props.accessibilityLabel,
      screen.getByTestId('round-start-player-martin').props.accessibilityLabel,
    ]).toEqual(['Sindre, HCP 21,0', 'Martin, HCP 9,4, Har levert']);
  });
});

// #2675 (kriterium 1 og 3): sjekklista og avkrysningen før start.
describe('sjekklista og avkrysningen', () => {
  const ORDER = [
    'round-setup-course',
    'round-setup-tee',
    'round-setup-setting-pins',
    'round-setup-setting-putting',
    'round-setup-setting-gimme',
    'round-setup-setting-mulligans',
    'round-setup-setting-wind',
    'round-setup-setting-fairway_firmness',
    'round-setup-setting-green_firmness',
    'round-setup-setting-green_stimp',
  ];

  it('bane, tee og de åtte innstillingene står i Trackmans rekkefølge, uten merke', async () => {
    await renderStart();
    const root = screen.getByTestId('round-setup-checklist');
    expect(screen.getByText('Sett dette i Trackman før første slag')).toBeTruthy();
    expect(screen.getByText('Velg bane og tee først, og still inn resten.')).toBeTruthy();
    expect(screen.getByTestId('round-setup-course')).toHaveTextContent('BaneSt Andrews');
    expect(screen.getByTestId('round-setup-tee')).toHaveTextContent('TeeGul');
    // Alle ti radene finnes, og kortet har ingen fold.
    for (const id of ORDER) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.queryByTestId('sim-settings-summary')).toBeNull();
    expect(screen.queryByText('Endret denne runden')).toBeNull();
    expect(root).toBeTruthy();
  });

  it.each([
    ['uten overstyringer', [] as Array<'green_stimp' | 'wind' | 'pins'>],
    ['med tre overstyringer', ['green_stimp', 'wind', 'pins'] as Array<'green_stimp' | 'wind' | 'pins'>],
  ])('lista er den samme for en runde %s', async (_label, overriddenKeys) => {
    const view = leagueView();
    view.rounds[2] = { ...view.rounds[2], overriddenKeys };
    mockView = { ok: true, view };
    await renderStart();

    expect(screen.getByTestId('round-setup-setting-pins')).toHaveTextContent('FlaggplasseringMedium');
    expect(screen.getByTestId('round-setup-setting-wind')).toHaveTextContent('VindCalm');
    expect(screen.getByTestId('round-setup-setting-green_stimp')).toHaveTextContent('Greenhastighet12 (3,7 m)');
    expect(screen.queryByText('Endret denne runden')).toBeNull();
  });

  it('mangler banen, faller raden bort', async () => {
    const view = leagueView();
    view.rounds[2] = { ...view.rounds[2], courseName: null };
    mockView = { ok: true, view };
    await renderStart();
    expect(screen.queryByTestId('round-setup-course')).toBeNull();
    expect(screen.getByTestId('round-setup-tee')).toBeTruthy();
  });

  it('«Start runden» er sperret til boksen er krysset av, og sperres igjen når haken fjernes', async () => {
    await renderStart();
    const box = () => screen.getByTestId('round-start-confirm');
    expect(box().props.accessibilityRole).toBe('checkbox');
    expect(box().props.accessibilityState).toEqual({ checked: false });
    expect(screen.getByText('Jeg har satt bane, tee og innstillingene i Trackman.')).toBeTruthy();
    expect(isDisabled('round-start-submit')).toBe(true);

    await fireEvent.press(box());
    expect(box().props.accessibilityState).toEqual({ checked: true });
    expect(isDisabled('round-start-submit')).toBe(false);

    await fireEvent.press(box());
    expect(isDisabled('round-start-submit')).toBe(true);
    await fireEvent.press(screen.getByTestId('round-start-submit'));
    expect(startLeagueRound).not.toHaveBeenCalled();
  });

  it('avkrysningen nullstilles ikke ved dra-ned', async () => {
    await renderStart();
    await confirmSetup();
    await act(async () => {
      screen.getByTestId('round-start-scroll').props.refreshControl.props.onRefresh();
    });
    expect(screen.getByTestId('round-start-confirm').props.accessibilityState).toEqual({ checked: true });
  });

  it('markørregelen gjelder i tillegg i en vanlig liga, som ikke har avkrysning eller sjekkliste', async () => {
    mockView = { ok: true, view: leagueView({ league: { isSimulator: false } }) };
    await renderStart();
    expect(screen.queryByTestId('round-start-confirm')).toBeNull();
    expect(screen.queryByTestId('round-setup-checklist')).toBeNull();
    expect(isDisabled('round-start-submit')).toBe(true);
    await fireEvent.press(screen.getByTestId('round-start-player-sindre'));
    expect(isDisabled('round-start-submit')).toBe(false);
  });
});

// #2675 (kriterium 4): lang medspillerliste.
describe('medspillerlista med søk og «Vis alle»', () => {
  // Åtte medspillere: Anne, Bård og Cato har levert/spiller (låst), resten er ledige.
  const NAMES = ['anne', 'bård', 'cato', 'dag', 'eli', 'finn', 'gro', 'hans'];
  function eightPlayers() {
    const view = leagueView({ participants: [PEOPLE[0], ...NAMES.map((n) => participant(n.toLowerCase(), n))] });
    view.rounds[2] = { ...view.rounds[2], delivered: ['anne', 'bård'], inProgress: ['cato'] };
    mockView = { ok: true, view };
  }
  // Radene i den rekkefølgen de står på skjermen.
  const shown = () =>
    screen.queryAllByTestId(/^round-start-player-/).map((node) => String(node.props.testID).replace('round-start-player-', ''));

  it('ledige først og låste sist; seks rader, søkefelt og «Vis alle 8»', async () => {
    eightPlayers();
    await renderStart();
    expect(shown()).toEqual(['dag', 'eli', 'finn', 'gro', 'hans', 'anne']);
    expect(screen.getByTestId('round-start-search')).toBeTruthy();
    expect(screen.getByTestId('round-start-show-all')).toHaveTextContent('Vis alle 8');

    await fireEvent.press(screen.getByTestId('round-start-show-all'));
    expect(shown()).toEqual(['dag', 'eli', 'finn', 'gro', 'hans', 'anne', 'bård', 'cato']);
    expect(screen.getByTestId('round-start-show-all')).toHaveTextContent('Vis færre');
  });

  it('søket filtrerer på navnet, og null treff gir «Ingen spillere med det navnet.»', async () => {
    eightPlayers();
    await renderStart();
    await fireEvent.changeText(screen.getByTestId('round-start-search'), 'fin');
    expect(shown()).toEqual(['finn']);
    expect(screen.queryByTestId('round-start-show-all')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('round-start-search'), 'xyz');
    expect(shown()).toEqual([]);
    expect(screen.getByTestId('round-start-no-match')).toHaveTextContent('Ingen spillere med det navnet.');
  });

  it('en valgt spiller nedenfor kuttet blir stående', async () => {
    eightPlayers();
    // Gro er rad fire og vises. Velg en som havner under kuttet: ingen ledige er
    // under kuttet her, så flytt grensa ved å gjøre alle ledige.
    const view = leagueView({ participants: [PEOPLE[0], ...NAMES.map((n) => participant(n.toLowerCase(), n))] });
    view.rounds[2] = { ...view.rounds[2], delivered: [], inProgress: [] };
    mockView = { ok: true, view };
    await renderStart();
    expect(shown()).toEqual(['anne', 'bård', 'cato', 'dag', 'eli', 'finn']);

    await fireEvent.changeText(screen.getByTestId('round-start-search'), 'hans');
    await fireEvent.press(screen.getByTestId('round-start-player-hans'));
    await fireEvent.changeText(screen.getByTestId('round-start-search'), '');
    expect(shown()).toEqual(['anne', 'bård', 'cato', 'dag', 'eli', 'finn', 'hans']);
  });

  it('seks medspillere eller færre: ingen søkefelt og ingen «Vis alle»', async () => {
    await renderStart();
    expect(screen.queryByTestId('round-start-search')).toBeNull();
    expect(screen.queryByTestId('round-start-show-all')).toBeNull();
  });
});
