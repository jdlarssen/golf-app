// #2638 Del 2: «Start runden» i en ligarunde som skjerm (Type C).
//
// Reglene sjekkes på serveren (`startLeagueRoundFlightCore`); her låses det
// skjermen svarer for: grensen fra `minFlightPlayers` (alene i en
// simulatorliga, minst én medspiller i en vanlig), de låste medspillerne og
// den fulle flighten, at et avslag vises med nettsidens ord, og at spillet
// erstatter skjermen etter start.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { LeagueResult, LeagueStartResult } from '../data/league';
import { startLeagueRound } from '../data/league';
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

function isDisabled(testID: string): boolean {
  return screen.getByTestId(testID).props.accessibilityState?.disabled === true;
}

beforeEach(() => {
  (startLeagueRound as jest.Mock).mockClear();
  mockView = { ok: true, view: leagueView() };
  mockStart = { ok: true, gameId: 'game-9' };
});

describe('tegning 5: simulatorliga', () => {
  it('innstillingene står åpne, og du kan starte alene', async () => {
    const { replace } = await renderStart();

    expect(screen.getByText('Runde 3')).toBeTruthy();
    expect(screen.getByText('Vinterliga på Trackman')).toBeTruthy();
    expect(screen.getByTestId('sim-settings-values')).toBeTruthy();
    expect(screen.getByTestId('sim-setting-wind')).toHaveTextContent('VindCalm');
    expect(screen.getByTestId('round-start-rule')).toHaveTextContent(
      'Du kan spille alene. Tast scoren fra Trackman-skjermen når du er ferdig.',
    );
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

    await fireEvent.press(screen.getByTestId('round-start-submit'));
    expect(screen.getByTestId('round-start-refusal')).toHaveTextContent('Du har allerede spilt denne runden.');
    expect(replace).not.toHaveBeenCalled();
    expect(isDisabled('round-start-submit')).toBe(false);
  });

  it('uten nett sier boksen det', async () => {
    mockStart = { ok: false, reason: 'offline' };
    await renderStart();
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
    expect(screen.queryByTestId('sim-settings-card')).toBeNull();
  });

  it('vinduet er stengt', async () => {
    await renderStart('r1');
    expect(screen.getByTestId('round-start-refusal')).toHaveTextContent('Runden er ikke åpen for spill nå.');
  });
});

describe('knownRefusal', () => {
  const now = new Date();
  it('vinduet først, så levert, i gang og banen', () => {
    expect([
      knownRefusal(leagueRound(1, 3, { delivered: ['me'] }), 'me', now),
      knownRefusal(leagueRound(1, -1, { delivered: ['me'], ready: false }), 'me', now),
      knownRefusal(leagueRound(1, -1, { inProgress: ['me'] }), 'me', now),
      knownRefusal(leagueRound(1, -1, { ready: false }), 'me', now),
      knownRefusal(leagueRound(1, -1), 'me', now),
    ]).toEqual(['outside_window', 'already_played', 'flight_in_progress', 'round_not_ready', null]);
  });
});
