// #2638 Del 2: ligasiden som skjerm (Type C).
//
// Ruta (`GET /api/liga/[id]`) regner tabellen og innstillingene; her låses det
// bare skjermen svarer for: når «Spill runden» vises, hva «hvem har spilt»
// sier, at innstillingskortet er foldet og bare står i en simulatorliga, og
// tilstandene fra tegning 6 uten nett.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { LeagueResult } from '../data/league';
import type { ScreenProps } from '../navigation';
import { leagueRound, leagueView } from '../test/leagueFixtures';
import { useMarkVisitRead } from '../lib/useMarkVisitRead';
import { League } from './League';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../lib/useMarkVisitRead');
jest.mock('../data/league', () => ({
  fetchLeague: jest.fn(async () => mockResults.shift() ?? mockLast),
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// Fokuset kjøres som en effekt, og testen kan fokusere skjermen igjen.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
    require('react').useEffect(callback, [callback]);
  },
}));

// Navnene må starte med `mock`: jest.mock-factoryene heises over importene.
let mockFocus: () => void = () => {};
let mockResults: LeagueResult[] = [];
let mockLast: LeagueResult = { ok: false, reason: 'offline' };

function answer(...results: LeagueResult[]) {
  mockResults = [...results];
  mockLast = results[results.length - 1];
}

async function renderLeague() {
  const navigate = jest.fn();
  const props = {
    navigation: { navigate },
    route: { key: 'league', name: 'League', params: { leagueId: 'liga-vinter' } },
  };
  await render(<League {...(props as unknown as ScreenProps<'League'>)} />);
  return { navigate };
}

beforeEach(() => {
  answer({ ok: true, view: leagueView() });
});

describe('tegning 2: øvre del', () => {
  it('navnet, status, sesong og formatlinja', async () => {
    await renderLeague();
    expect(screen.getByTestId('league-name')).toHaveTextContent('Vinterliga på Trackman');
    expect(screen.getByTestId('league-status')).toHaveTextContent('Pågår');
    expect(screen.getByText('Sesong 2. nov – 4. feb')).toBeTruthy();
    expect(screen.getByTestId('league-format')).toHaveTextContent('Stableford netto · beste 5 av 4');
  });

  it('innstillingene er foldet til én linje med merket, og åpnes med et trykk', async () => {
    await renderLeague();
    expect(screen.getByText('Innstillinger · Runde 3')).toBeTruthy();
    expect(screen.getByTestId('sim-settings-changed')).toHaveTextContent('Endret denne runden');
    expect(screen.queryByTestId('sim-settings-values')).toBeNull();

    await fireEvent.press(screen.getByTestId('sim-settings-summary'));
    expect(screen.getByTestId('sim-setting-green_stimp')).toHaveTextContent(
      'GreenhastighetEndret denne runden12 (3,7 m)',
    );
    expect(screen.getByTestId('sim-setting-overridden')).toBeTruthy();
    expect(screen.getByTestId('sim-setting-tee')).toHaveTextContent('TeeGul');
  });

  it('#2638: åpner du ligaen, er varslene om rundene i den lest', async () => {
    await renderLeague();
    expect(useMarkVisitRead).toHaveBeenCalledWith('league', 'liga-vinter');
  });

  it('en vanlig liga har ikke innstillingskortet', async () => {
    answer({ ok: true, view: leagueView({ league: { isSimulator: false } }) });
    await renderLeague();
    expect(screen.queryByTestId('sim-settings-card')).toBeNull();
    expect(screen.getByTestId('league-open-round')).toBeTruthy();
  });

  it('«hvem har spilt» med «Deg» under «Mangler», og «Spill runden» åpner startskjermen', async () => {
    const { navigate } = await renderLeague();
    expect(screen.getByTestId('league-who-delivered-names')).toHaveTextContent('Martin, Kristian');
    expect(screen.getByTestId('league-who-inProgress-names')).toHaveTextContent('Erlend');
    expect(screen.getByTestId('league-who-missing-names')).toHaveTextContent('Deg, Sindre');

    await fireEvent.press(screen.getByTestId('league-play-round'));
    expect(navigate).toHaveBeenCalledWith('LeagueRoundStart', { leagueId: 'liga-vinter', roundId: 'r3' });
  });
});

describe('når «Spill runden» ikke vises', () => {
  it('2b: du har levert — kvitteringen og når neste runde åpner', async () => {
    const view = leagueView();
    view.rounds[2] = { ...view.rounds[2], delivered: ['me', 'martin', 'kristian'] };
    answer({ ok: true, view });
    await renderLeague();

    expect(screen.queryByTestId('league-play-round')).toBeNull();
    expect(screen.getByTestId('league-delivered')).toHaveTextContent(/Du har levert.*Neste runde åpner/);
    expect(screen.getByTestId('league-who-delivered-names')).toHaveTextContent('Deg, Martin, Kristian');
  });

  it.each([
    ['du er i gang', (v: ReturnType<typeof leagueView>) => ({ ...v, rounds: v.rounds.map((r) => (r.id === 'r3' ? { ...r, inProgress: ['me'] } : r)) })],
    ['du ikke er deltaker', (v: ReturnType<typeof leagueView>) => ({ ...v, me: { userId: 'me', isParticipant: false } })],
    ['ligaen ikke er startet', (v: ReturnType<typeof leagueView>) => ({ ...v, league: { ...v.league, status: 'draft' as const } })],
  ])('%s', async (_label, change) => {
    answer({ ok: true, view: change(leagueView()) });
    await renderLeague();
    expect(screen.getByTestId('league-open-round')).toBeTruthy();
    expect(screen.queryByTestId('league-play-round')).toBeNull();
  });

  it('runden mangler bane eller tee: nettsidens merknad i stedet for knappen', async () => {
    const view = leagueView();
    view.rounds[2] = { ...view.rounds[2], ready: false };
    answer({ ok: true, view });
    await renderLeague();
    expect(screen.queryByTestId('league-play-round')).toBeNull();
    expect(screen.getByTestId('league-round-note')).toHaveTextContent(
      'Runden mangler bane eller tee — admin fullfører oppsettet snart.',
    );
  });

  it('ingen åpen runde: intet rundekort', async () => {
    answer({ ok: true, view: leagueView({ rounds: [leagueRound(1, -30), leagueRound(2, 3)] }) });
    await renderLeague();
    expect(screen.queryByTestId('league-open-round')).toBeNull();
  });
});

describe('tegning 3 og 4: tabellen og rundelista', () => {
  it('tabellen sier hva tallet betyr, merker deg, og viser «–» for en runde du ikke har spilt', async () => {
    await renderLeague();
    expect(screen.getByTestId('league-standings-caption')).toHaveTextContent('Poeng med handicapslag');
    expect(screen.getByText('Beste 5')).toBeTruthy();
    expect(screen.getByTestId('league-standings-value-martin')).toHaveTextContent('74');
    expect(screen.getByTestId('league-standings-you')).toHaveTextContent(/Jørgen.*69.*36.*33.*–/);
    // Runde 4 har ikke åpnet: ingen kolonne for den.
    expect(screen.queryByText('R4')).toBeNull();
  });

  describe('#1378: den åpne runden og de som ikke er rangert', () => {
    const row = (userId: string, rank: number | null, ranked: boolean, roundsPlayed: number, value: number) => ({
      userId,
      rank,
      value,
      ranked,
      roundsPlayed,
      perRound: roundsPlayed > 0 ? [{ roundId: 'r1', value, points: null, penalised: false }] : [],
    });
    const withGroups = () =>
      leagueView({
        standings: [
          row('martin', 1, true, 2, 74),
          row('me', 2, true, 2, 69),
          // Har spilt, men stått over en stengt runde i en «må spille alle»-liga.
          row('kristian', null, false, 1, 31),
          // Har ikke spilt en runde.
          row('sindre', null, false, 0, 0),
        ],
      });

    it('den åpne runden er markert bare med prikken, uten farge i kolonnen', async () => {
      answer({ ok: true, view: withGroups() });
      await renderLeague();
      const openCol = screen.getByTestId('league-standings-open-col');
      expect(openCol).toHaveTextContent('R3');
      expect(StyleSheet.flatten(openCol.props.style).backgroundColor).toBeUndefined();
      expect(screen.queryByTestId(/league-standings-open-cell/)).toBeNull();
    });

    it('skillelinje mellom vanlige rader, ingen under siste rad eller over din egen rad', async () => {
      answer({
        ok: true,
        view: leagueView({
          standings: [
            row('martin', 1, true, 2, 74),
            row('kristian', 2, true, 2, 70),
            row('me', 3, true, 2, 69),
            row('sindre', null, false, 0, 0),
          ],
        }),
      });
      await renderLeague();
      const line = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style).borderBottomWidth;
      expect(line('league-standings-row-martin')).toBe(1);
      expect(line('league-standings-row-kristian')).toBeUndefined(); // «me» følger: den grønne rammen er streken
      expect(line('league-standings-row-sindre')).toBeUndefined(); // siste rad
    });

    it('ingen åpen runde: ingen prikk', async () => {
      answer({ ok: true, view: leagueView({ rounds: [leagueRound(1, -30), leagueRound(2, 3)] }) });
      await renderLeague();
      expect(screen.queryByTestId('league-standings-open-col')).toBeNull();
    });

    it('de som ikke er rangert står under to overskrifter, uten plass, uten forklaring', async () => {
      answer({ ok: true, view: withGroups() });
      await renderLeague();
      expect(screen.getByTestId('league-standings-group-notRanked')).toHaveTextContent(/^Ikke rangert$/);
      expect(screen.getByTestId('league-standings-group-notRankedYet')).toHaveTextContent(/^Ikke rangert ennå$/);
      expect(screen.getByTestId('league-standings-row-sindre')).toHaveTextContent(/^Sindre0/);
      expect(screen.queryByText(/har ikke spilt en runde/i)).toBeNull();
    });

    it('alle rangert: ingen gruppeoverskrift', async () => {
      await renderLeague();
      expect(screen.queryByTestId('league-standings-group-notRanked')).toBeNull();
      expect(screen.queryByTestId('league-standings-group-notRankedYet')).toBeNull();
    });
  });

  it('fra fire åpnede runder ruller rundekolonnene', async () => {
    answer({
      ok: true,
      view: leagueView({
        rounds: [leagueRound(1, -60), leagueRound(2, -46), leagueRound(3, -32), leagueRound(4, -18), leagueRound(5, -4)],
      }),
    });
    await renderLeague();
    expect(screen.getByTestId('league-standings-scroll')).toBeTruthy();
  });

  it('rundelista: vinduet og om du har spilt', async () => {
    await renderLeague();
    expect(screen.getByTestId('league-round-1-chip')).toHaveTextContent('Lukket');
    expect(screen.getByTestId('league-round-1-played')).toHaveTextContent('Har spilt');
    expect(screen.getByTestId('league-round-3-chip')).toHaveTextContent('Åpen');
    expect(screen.getByTestId('league-round-3-played')).toHaveTextContent('Ikke spilt');
    expect(screen.getByTestId('league-round-4-chip')).toHaveTextContent('Kommer');
    expect(screen.queryByTestId('league-round-4-played')).toBeNull();
  });
});

describe('tegning 6: feil og uten nett', () => {
  it('ingen liga og ingen nett: feilen, og «Prøv igjen» henter på nytt', async () => {
    answer({ ok: false, reason: 'offline' }, { ok: true, view: leagueView() });
    await renderLeague();
    expect(screen.getByTestId('league-error')).toHaveTextContent('Fikk ikke tak i ligaen. Sjekk nettet og prøv igjen.');

    await fireEvent.press(screen.getByTestId('league-retry'));
    expect(screen.getByTestId('league-name')).toHaveTextContent('Vinterliga på Trackman');
  });

  it('ligaen finnes ikke for deg', async () => {
    answer({ ok: false, reason: 'not_found' });
    await renderLeague();
    expect(screen.getByTestId('league-not-found')).toHaveTextContent(
      'Fant ikke ligaen. Den kan ha blitt slettet, eller du er ikke med i den.',
    );
    expect(screen.queryByTestId('league-retry')).toBeNull();
  });

  it('hentet liga som så er borte for deg (404): «Fant ikke ligaen», ikke den lagrede', async () => {
    answer({ ok: true, view: leagueView() }, { ok: false, reason: 'not_found' });
    await renderLeague();
    await act(async () => {
      mockFocus();
    });
    expect(screen.getByTestId('league-not-found')).toBeTruthy();
    expect(screen.queryByTestId('league-stale')).toBeNull();
  });

  it('hentet liga, men nettet er borte: merknaden, og «Spill runden» er dempet', async () => {
    answer({ ok: true, view: leagueView() }, { ok: false, reason: 'offline' });
    const { navigate } = await renderLeague();
    await act(async () => {
      mockFocus();
    });

    expect(screen.getByTestId('league-stale')).toHaveTextContent(
      'Viser lagret liga — fikk ikke kontakt med serveren.',
    );
    expect(screen.queryByTestId('league-play-round')).toBeNull();
    expect(screen.getByTestId('league-play-offline')).toHaveTextContent(/Du trenger nett for å starte runden\./);
    // Den dempede knappen er en knapp for skjermleseren også, og sier at den er av.
    const dimmed = screen.getByRole('button', { name: 'Spill runden' });
    expect(dimmed.props.accessibilityState).toEqual({ disabled: true });
    expect(navigate).not.toHaveBeenCalled();
  });
});
