// #2638 Del 2: ligasiden som skjerm (Type C).
//
// Ruta (`GET /api/liga/[id]`) regner tabellen og innstillingene; her låses det
// bare skjermen svarer for: når «Spill runden» vises, hva «hvem har spilt»
// sier, at innstillingskortet er foldet og bare står i en simulatorliga, og
// tilstandene fra tegning 6 uten nett.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { Share, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ClubLeagueJoinResult, LeagueResult } from '../data/league';
import type { ScreenProps } from '../navigation';
import { leagueRound, leagueView } from '../test/leagueFixtures';
import { useMarkVisitRead } from '../lib/useMarkVisitRead';
import { League } from './League';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../lib/useMarkVisitRead');
jest.mock('../data/league', () => ({
  fetchLeague: jest.fn(async () => mockResults.shift() ?? mockLast),
  joinClubLeague: jest.fn(async () => mockSelfJoin()),
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
let mockSelfJoin: () => Promise<ClubLeagueJoinResult> | ClubLeagueJoinResult = () => ({ ok: true, leagueId: 'liga-vinter' });

const { fetchLeague, joinClubLeague } = jest.requireMock('../data/league') as {
  fetchLeague: jest.Mock;
  joinClubLeague: jest.Mock;
};

function answer(...results: LeagueResult[]) {
  mockResults = [...results];
  mockLast = results[results.length - 1];
}

type StackRoute = { name: string; params?: object };
const LEAGUE_ROUTE: StackRoute = { name: 'League', params: { leagueId: 'liga-vinter' } };

async function renderLeague(params: { joined?: boolean } = {}, below: StackRoute[] = []) {
  const navigate = jest.fn();
  const popTo = jest.fn();
  const setParams = jest.fn();
  const listeners: Record<string, () => void> = {};
  // `openOrReturn` (#2746) leser stakken: ligaen ligger øverst, alene om
  // ikke testen legger skjermer under den.
  const routes = [...below, LEAGUE_ROUTE];
  const props = {
    navigation: {
      navigate,
      popTo,
      setParams,
      getState: () => ({ index: routes.length - 1, routes }),
      addListener: (name: string, listener: () => void) => {
        listeners[name] = listener;
        return () => {};
      },
    },
    route: { key: 'league', name: 'League', params: { leagueId: 'liga-vinter', ...params } },
  };
  await render(<League {...(props as unknown as ScreenProps<'League'>)} />);
  return { navigate, popTo, setParams, listeners };
}

beforeEach(() => {
  jest.clearAllMocks();
  answer({ ok: true, view: leagueView() });
  mockSelfJoin = () => ({ ok: true, leagueId: 'liga-vinter' });
});

describe('tegning 2: øvre del', () => {
  it('navnet, status, sesong og formatlinja', async () => {
    await renderLeague();
    expect(screen.getByTestId('league-name')).toHaveTextContent('Vinterliga på Trackman');
    expect(screen.getByTestId('league-status')).toHaveTextContent('Pågår');
    expect(screen.getByText('Sesong 2. nov – 4. feb')).toBeTruthy();
    expect(screen.getByTestId('league-format')).toHaveTextContent('Stableford netto 75\u00A0% · maks 32 slag · beste 5 av 4');
  });

  // #2675: spilleren har ingen «standard», så en runde med overstyrt verdi
  // (fixturen overstyrer greenhastigheten) viser verdien uten merke.
  it('innstillingene er foldet til én linje uten merke, og åpnes med et trykk', async () => {
    await renderLeague();
    expect(screen.getByText('Innstillinger · Runde 3')).toBeTruthy();
    expect(screen.queryByText('Endret denne runden')).toBeNull();
    expect(screen.queryByTestId('sim-settings-values')).toBeNull();

    await fireEvent.press(screen.getByTestId('sim-settings-summary'));
    expect(screen.getByTestId('sim-setting-green_stimp')).toHaveTextContent('Greenhastighet12 (3,7 m)');
    expect(screen.queryByText('Endret denne runden')).toBeNull();
    expect(screen.queryByTestId('sim-settings-changed')).toBeNull();
    expect(screen.queryByTestId('sim-setting-overridden')).toBeNull();
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
    ['du ikke er deltaker', (v: ReturnType<typeof leagueView>) => ({ ...v, me: { userId: 'me', isParticipant: false, isOrganizer: false, canJoin: false, canLeave: false } })],
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
      perRound: roundsPlayed > 0 ? [{ roundId: 'r1', value, points: null, penalised: false, gameId: `g-${userId}` }] : [],
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
      const style = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
      expect(style('league-standings-row-martin').borderBottomWidth).toBe(1);
      // Artboardets farge (`border`), ikke den svakere `divider`.
      expect(style('league-standings-row-martin').borderBottomColor).toBe('#E5E0D3');
      expect(style('league-standings-row-kristian').borderBottomWidth).toBeUndefined(); // «me» følger: den grønne rammen er streken
      expect(style('league-standings-row-sindre').borderBottomWidth).toBeUndefined(); // siste rad
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

  // #2688: banen står på kortet for den åpne runden og på hver rad.
  it('banen står på den åpne runden og på hver rad i rundelista', async () => {
    await renderLeague();
    expect(screen.getByTestId('league-open-round-course')).toHaveTextContent('St Andrews · Gul tee');
    expect(screen.getByTestId('league-round-1-course')).toHaveTextContent('St Andrews · Gul tee');
    expect(screen.getByTestId('league-round-4-course')).toHaveTextContent('St Andrews · Gul tee');
  });

  it('en runde uten bane har ingen banelinje', async () => {
    answer({
      ok: true,
      view: leagueView({ rounds: [leagueRound(1, -2, { courseName: null, teeName: null, ready: false })] }),
    });
    await renderLeague();
    expect(screen.queryByTestId('league-open-round-course')).toBeNull();
    expect(screen.queryByTestId('league-round-1-course')).toBeNull();
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

  it('borte for deg (404), så uten nett: den gamle ligaen kommer ikke tilbake (#2752)', async () => {
    answer({ ok: true, view: leagueView() }, { ok: false, reason: 'not_found' }, { ok: false, reason: 'offline' });
    await renderLeague();
    await act(async () => {
      mockFocus();
    });
    expect(screen.getByTestId('league-not-found')).toBeTruthy();
    await act(async () => {
      mockFocus();
    });
    expect(screen.queryByTestId('league-stale')).toBeNull();
    expect(screen.getByTestId('league-load-failed')).toBeTruthy();
  });

  it('et varsel om en annen liga uten nett viser ikke den forrige under den nye id-en (#2752)', async () => {
    answer({ ok: true, view: leagueView() }, { ok: false, reason: 'offline' });
    const navigation = { navigate: jest.fn(), setParams: jest.fn(), addListener: () => () => {} };
    const props = (leagueId: string) =>
      ({ navigation, route: { key: 'league', name: 'League', params: { leagueId } } }) as unknown as ScreenProps<'League'>;
    const view = await render(<League {...props('liga-vinter')} />);
    expect(screen.getByTestId('league-name')).toBeTruthy();

    await view.rerender(<League {...props('liga-sommer')} />);
    expect(screen.queryByTestId('league-name')).toBeNull();
    expect(screen.getByTestId('league-load-failed')).toBeTruthy();
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

describe('#2661: markøren i en simulatorliga', () => {
  it('spilleren ser hvem kortet venter på, og markøren får kortet øverst', async () => {
    const view = leagueView();
    const other = view.participants.find((p) => p.userId !== 'me')!;
    answer({
      ok: true,
      view: {
        ...view,
        rounds: view.rounds.map((r) =>
          r.id === 'r3'
            ? {
                ...r,
                inProgress: ['me', other.userId],
                awaitingMarker: [
                  { gameId: 'g-me', userId: 'me', markerUserId: other.userId, submittedBy: 'me' },
                  { gameId: 'g-other', userId: other.userId, markerUserId: 'me', submittedBy: other.userId },
                ],
              }
            : r,
        ),
      },
    });
    const { navigate } = await renderLeague();
    expect(screen.getByText(`Venter på godkjenning fra ${other.name}`)).toBeTruthy();
    expect(screen.getByTestId('league-marker-queue')).toHaveTextContent(/Venter på deg som markør/i);
    await fireEvent.press(screen.getByTestId(`marker-queue-g-other-${other.userId}`));
    expect(navigate).toHaveBeenCalledWith('MarkerApprove', {
      leagueId: 'liga-vinter',
      gameId: 'g-other',
      userId: other.userId,
    });
    // Arrangøren ser ingen egen liste når hen ikke er arrangør.
    expect(screen.queryByTestId('league-organizer-marker-queue')).toBeNull();
  });

  it('arrangøren ser de andres ventende kort, men ikke sitt eget eller et hen leverte', async () => {
    const view = leagueView({ me: { isOrganizer: true } });
    const [a, b] = view.participants.filter((p) => p.userId !== 'me');
    answer({
      ok: true,
      view: {
        ...view,
        rounds: view.rounds.map((r) =>
          r.id === 'r3'
            ? {
                ...r,
                awaitingMarker: [
                  { gameId: 'g-me', userId: 'me', markerUserId: a.userId, submittedBy: 'me' },
                  { gameId: 'g-a', userId: a.userId, markerUserId: b.userId, submittedBy: a.userId },
                  // Arrangøren leverte b sitt kort i samme flight: bare markøren svarer.
                  { gameId: 'g-a', userId: b.userId, markerUserId: a.userId, submittedBy: 'me' },
                ],
              }
            : r,
        ),
      },
    });
    await renderLeague();
    expect(screen.getByTestId(`marker-queue-g-a-${a.userId}`)).toBeTruthy();
    expect(screen.queryByTestId('marker-queue-g-me-me')).toBeNull();
    expect(screen.queryByTestId(`marker-queue-g-a-${b.userId}`)).toBeNull();
  });
});

// #2829: ligaskjermen åpner markørkortet og rundestarten med `openOrReturn`
// (#2746). Ligger skjermen alt under ligaen i stakken, går appen tilbake til
// den i stedet for å legge en skjerm til.
describe('#2829: markørkortet og rundestarten åpnes uten en skjerm til', () => {
  it('markørkortet som ligger under ligaen, åpnes med popTo, ikke som en ny skjerm', async () => {
    const view = leagueView();
    const other = view.participants.find((p) => p.userId !== 'me')!;
    answer({
      ok: true,
      view: {
        ...view,
        rounds: view.rounds.map((r) =>
          r.id === 'r3'
            ? {
                ...r,
                awaitingMarker: [
                  { gameId: 'g-other', userId: other.userId, markerUserId: 'me', submittedBy: other.userId },
                ],
              }
            : r,
        ),
      },
    });
    const card = { leagueId: 'liga-vinter', gameId: 'g-other', userId: other.userId };
    const { navigate, popTo } = await renderLeague({}, [LEAGUE_ROUTE, { name: 'MarkerApprove', params: card }]);
    await fireEvent.press(screen.getByTestId(`marker-queue-g-other-${other.userId}`));
    expect(popTo).toHaveBeenCalledWith('MarkerApprove', card);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('rundestarten som ligger under ligaen, åpnes med popTo, ikke som en ny skjerm', async () => {
    answer({ ok: true, view: leagueView() });
    const start = { leagueId: 'liga-vinter', roundId: 'r3' };
    const { navigate, popTo } = await renderLeague({}, [LEAGUE_ROUTE, { name: 'LeagueRoundStart', params: start }]);
    await fireEvent.press(screen.getByTestId('league-play-round'));
    expect(popTo).toHaveBeenCalledWith('LeagueRoundStart', start);
    expect(navigate).not.toHaveBeenCalled();
  });
});

// #2748: regelen for lenka er serverens (`participantShareUrl`).
describe('#2815: kortet bak et resultat i tabellen', () => {
  it('et resultat med kort bak seg åpner kortet; et uspilt resultat kan ikke trykkes på', async () => {
    const { navigate } = await renderLeague();
    const cell = screen.getByTestId('league-standings-card-martin-r1');
    expect(cell.props.accessibilityLabel).toMatch(/^Se kortet til .+, Runde 1$/);
    await fireEvent.press(cell);
    expect(navigate).toHaveBeenCalledWith('LeagueCard', {
      leagueId: 'liga-vinter',
      gameId: 'g-martin-r1',
      userId: 'martin',
    });
    expect(screen.queryByTestId('league-standings-card-martin-r2')).toBeNull();
  });

  it('en server fra før #2815 sender ikke kortet: ingen celle kan trykkes på', async () => {
    const view = leagueView();
    answer({
      ok: true,
      view: {
        ...view,
        standings: view.standings.map((row) => ({
          ...row,
          perRound: row.perRound.map(({ gameId: _gameId, ...cell }) => cell as typeof row.perRound[number]),
        })),
      },
    });
    await renderLeague();
    expect(screen.getByTestId('league-standings')).toBeTruthy();
    expect(screen.queryByTestId(/^league-standings-card-/)).toBeNull();
  });
});

describe('«Del lenka»', () => {
  const URL = 'https://tornygolf.no/liga/bli-med/abcd2345';

  it('står ikke uten lenke fra serveren', async () => {
    await renderLeague();
    expect(screen.queryByTestId('league-share-link')).toBeNull();
  });

  it('åpner delingsarket med adressen fra serveren', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    answer({ ok: true, view: leagueView({ league: { shareUrl: URL } }) });
    await renderLeague();
    await fireEvent.press(screen.getByTestId('league-share-link'));
    expect(share).toHaveBeenCalledWith({ message: URL });
    share.mockRestore();
  });

  it('et delingsark som feiler, velter ikke siden', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const share = jest.spyOn(Share, 'share').mockRejectedValue(new Error('nei'));
    answer({ ok: true, view: leagueView({ league: { shareUrl: URL } }) });
    await renderLeague();
    await fireEvent.press(screen.getByTestId('league-share-link'));
    await act(async () => {});
    expect(screen.getByTestId('league-screen')).toBeTruthy();
    share.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('kvitteringen etter «Bli med»', () => {
  it('står når skjermen kommer med den, og nullstilles når siden mister fokus', async () => {
    const { listeners, setParams } = await renderLeague({ joined: true });
    expect(screen.getByTestId('league-joined-banner')).toHaveTextContent('Du er med i ligaen.');
    await act(async () => listeners.blur());
    expect(setParams).toHaveBeenCalledWith({ joined: false });
  });

  it('står ikke ellers', async () => {
    await renderLeague();
    expect(screen.queryByTestId('league-joined-banner')).toBeNull();
  });
});

// #2839: klubbmedlemmet melder seg på og av. Hvilke knapper som vises, avgjør
// serveren (`me.canJoin` / `me.canLeave`); skjermen regner ingen regel selv.
describe('meld deg på og av en klubbliga (#2839)', () => {
  const notIn = { isParticipant: false, canJoin: true, canLeave: false };

  it('«Bli med»-kortet vises bare når serveren sier canJoin, og lenka bare ved canLeave', async () => {
    answer({ ok: true, view: leagueView({ me: notIn }) });
    await renderLeague();
    expect(screen.getByText('Du er medlem i klubben. Meld deg på før ligaen starter.')).toBeTruthy();
    expect(screen.getByTestId('league-signup-button')).toHaveTextContent('Bli med i ligaen');
    expect(screen.queryByTestId('league-leave-link')).toBeNull();
  });

  it('en deltaker som kan melde seg av, får lenka og ikke kortet', async () => {
    answer({ ok: true, view: leagueView({ me: { canLeave: true } }) });
    await renderLeague();
    expect(screen.getByTestId('league-leave-link')).toHaveTextContent('Meld deg av ligaen');
    expect(screen.queryByTestId('league-signup')).toBeNull();
  });

  it('ingen av dem når serveren sier nei (spilt, avsluttet, frittstående)', async () => {
    await renderLeague();
    expect(screen.queryByTestId('league-signup')).toBeNull();
    expect(screen.queryByTestId('league-leave-link')).toBeNull();
  });

  it('lenka åpner bekreftelsesskjermen for denne ligaen', async () => {
    answer({ ok: true, view: leagueView({ me: { canLeave: true } }) });
    const { navigate } = await renderLeague();
    await fireEvent.press(screen.getByTestId('league-leave-link'));
    expect(navigate).toHaveBeenCalledWith('LeagueLeave', { leagueId: 'liga-vinter' });
  });

  it('ett trykk er ett kall, knappen er av mens det går, og ligaen hentes på nytt med kvitteringen', async () => {
    let finish: (result: ClubLeagueJoinResult) => void = () => {};
    mockSelfJoin = () =>
      new Promise<ClubLeagueJoinResult>((resolve) => {
        finish = resolve;
      });
    answer({ ok: true, view: leagueView({ me: notIn }) }, { ok: true, view: leagueView({ me: { canLeave: true } }) });
    const { setParams } = await renderLeague();
    const button = screen.getByTestId('league-signup-button');
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(joinClubLeague).toHaveBeenCalledTimes(1);
    expect(joinClubLeague).toHaveBeenCalledWith('liga-vinter');
    expect(screen.getByTestId('league-signup-button')).toBeDisabled();
    expect(screen.getByTestId('league-signup-button')).toHaveTextContent('Melder deg på …');

    await act(async () => finish({ ok: true, leagueId: 'liga-vinter' }));
    expect(setParams).toHaveBeenCalledWith({ joined: true });
    expect(fetchLeague).toHaveBeenCalledTimes(2);
    // Etter ny henting er kortet borte og lenka er der.
    expect(screen.queryByTestId('league-signup')).toBeNull();
    expect(screen.getByTestId('league-leave-link')).toBeTruthy();
  });

  it.each([
    ['not_draft', 'Ligaen har allerede startet. Be klubb-admin om å legge deg til.'],
    ['not_member', 'Du er ikke medlem av klubben.'],
    ['not_club_league', 'Denne ligaen kan du ikke bli med i selv.'],
    ['offline', 'Du er uten nett. Prøv igjen når nettet er tilbake.'],
    ['save_failed', 'Noe gikk galt. Prøv igjen.'],
  ] as const)('feilen %s står med riktig tekst, og knappen står igjen', async (reason, text) => {
    mockSelfJoin = () => ({ ok: false, reason });
    answer({ ok: true, view: leagueView({ me: notIn }) });
    const { setParams } = await renderLeague();
    await fireEvent.press(screen.getByTestId('league-signup-button'));
    expect(screen.getByTestId('league-self-error')).toHaveTextContent(text);
    expect(screen.getByTestId('league-signup-button')).not.toBeDisabled();
    expect(setParams).not.toHaveBeenCalledWith({ joined: true });
  });
});
