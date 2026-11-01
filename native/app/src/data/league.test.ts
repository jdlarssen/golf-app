// native/app/src/data/league.test.ts
// #2638 Del 2: ligaen sett fra appen (Type A).
//
// Reglene — vinduet, markørregelen med én spiller i en simulatorliga, én
// tellende flight, fastfrysingen av innstillingene — er testet i
// `lib/league/startLeagueRoundFlightCore.test.ts` og rutetestene. Her testes
// OVERSETTELSEN: hva appen gjør med hvert svar rutene kan gi, og at ingenting
// sendes uten nett.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import {
  BASE_URL,
  TOKEN,
  auth,
  mockFetch,
  mockNetwork,
  requestInit,
  respondWith,
  respondWithHtml,
  useWebRoute,
} from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

// Nett-bryteren bor i riggen og MÅ importeres statisk (se webRouteHarness.ts).
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

const LEAGUE_ID = 'liga-1';
const ROUND_ID = 'runde-3';

function league(): typeof import('./league') {
  return require('./league') as typeof import('./league');
}

const VIEW = {
  league: { id: LEAGUE_ID, name: 'Vinterliga på Trackman' },
  rounds: [],
  participants: [],
  standings: [],
  me: { userId: 'me', isParticipant: true },
};

describe('fetchMyLeagues', () => {
  useWebRoute();

  it('leser ligaene med GET og token', async () => {
    const leagues = [{ id: LEAGUE_ID, name: 'Vinterliga', status: 'active', openRound: null, delivered: false, inProgress: false }];
    respondWith(200, { leagues });

    expect(await league().fetchMyLeagues()).toEqual({ ok: true, leagues });
    expect(mockFetch).toHaveBeenCalledWith(`${BASE_URL}/api/liga`, expect.objectContaining({ method: 'GET' }));
    expect((requestInit().headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(requestInit().body).toBeUndefined();
  });

  it.each([
    [401, 'unauthorized'],
    [500, 'load_failed'],
  ])('oversetter %i til %s', async (status, reason) => {
    respondWith(status, { error: 'whatever' });
    expect(await league().fetchMyLeagues()).toEqual({ ok: false, reason });
  });

  it('en 200 uten liste er en feil, ikke en tom liste', async () => {
    respondWith(200, { leagues: 'tull' });
    expect(await league().fetchMyLeagues()).toEqual({ ok: false, reason: 'load_failed' });
  });

  it('nekter uten nett, og sender ingenting', async () => {
    mockNetwork.online = false;
    expect(await league().fetchMyLeagues()).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('fetchLeague', () => {
  useWebRoute();

  it('leser ligasiden med id-en i stien', async () => {
    respondWith(200, VIEW);
    expect(await league().fetchLeague(LEAGUE_ID)).toEqual({ ok: true, view: VIEW });
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/liga/${LEAGUE_ID}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it.each([
    [401, 'unauthorized'],
    [404, 'not_found'],
    [500, 'load_failed'],
    [502, 'load_failed'],
  ])('oversetter %i til %s', async (status, reason) => {
    respondWith(status, { error: 'whatever' });
    expect(await league().fetchLeague(LEAGUE_ID)).toEqual({ ok: false, reason });
  });

  it('en HTML-feilside foran appen er load_failed, ikke en krasj', async () => {
    respondWithHtml(502);
    expect(await league().fetchLeague(LEAGUE_ID)).toEqual({ ok: false, reason: 'load_failed' });
  });

  it('en 200 uten liga er load_failed', async () => {
    respondWith(200, { rounds: [] });
    expect(await league().fetchLeague(LEAGUE_ID)).toEqual({ ok: false, reason: 'load_failed' });
  });

  it('uten nett: offline, og ingen kall (skjermen viser tegning 6)', async () => {
    mockNetwork.online = false;
    expect(await league().fetchLeague(LEAGUE_ID)).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('svarer network når kallet aldri kom fram', async () => {
    mockFetch.mockRejectedValue(new Error('Network request failed'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await league().fetchLeague(LEAGUE_ID)).toEqual({ ok: false, reason: 'network' });
  });

  it('sender ikke et kall uten sesjon', async () => {
    auth().getSession.mockResolvedValue({ data: { session: null } });
    expect(await league().fetchLeague(LEAGUE_ID)).toEqual({ ok: false, reason: 'unauthorized' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('startLeagueRound', () => {
  useWebRoute();

  it('starter med POST og medspillerne i kroppen, aldri en egen id', async () => {
    respondWith(200, { gameId: 'game-9' });

    expect(await league().startLeagueRound(ROUND_ID, ['p2'])).toEqual({ ok: true, gameId: 'game-9' });
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/liga/rounds/${ROUND_ID}/start`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(String(requestInit().body))).toEqual({ coPlayerIds: ['p2'] });
  });

  it('alene: en tom liste', async () => {
    respondWith(200, { gameId: 'game-9' });
    await league().startLeagueRound(ROUND_ID, []);
    expect(JSON.parse(String(requestInit().body))).toEqual({ coPlayerIds: [] });
  });

  it.each(['already_played', 'need_marker', 'outside_window', 'round_not_ready', 'flight_in_progress', 'start_tee_missing_rating'])(
    'sender kjernens avslag %s videre fra en 409',
    async (code) => {
      respondWith(409, { error: code });
      expect(await league().startLeagueRound(ROUND_ID, [])).toEqual({ ok: false, reason: code });
    },
  );

  it('en 409 med en kode vi ikke kjenner blir start_failed', async () => {
    respondWith(409, { error: 'noe_nytt' });
    expect(await league().startLeagueRound(ROUND_ID, [])).toEqual({ ok: false, reason: 'start_failed' });
  });

  it.each([
    [400, 'start_failed'],
    [401, 'unauthorized'],
    [404, 'not_found'],
    [500, 'start_failed'],
  ])('oversetter %i til %s', async (status, reason) => {
    respondWith(status, { error: 'whatever' });
    expect(await league().startLeagueRound(ROUND_ID, [])).toEqual({ ok: false, reason });
  });

  it('en 200 uten spill-id er start_failed', async () => {
    respondWith(200, {});
    expect(await league().startLeagueRound(ROUND_ID, [])).toEqual({ ok: false, reason: 'start_failed' });
  });

  it('nekter uten nett, og sender ingenting', async () => {
    mockNetwork.online = false;
    expect(await league().startLeagueRound(ROUND_ID, [])).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('fetchLeagueJoin (#2748)', () => {
  useWebRoute();

  const JOIN_VIEW = {
    decision: 'can_join',
    league: { id: LEAGUE_ID, name: 'Vinterliga', format: 'stableford', isSimulator: true, courseName: null },
    rounds: [],
    participantCount: 3,
    lateJoin: { kind: 'none' },
  };

  it('leser ligaen bak lenka med GET og token, og koden står bare i stien', async () => {
    respondWith(200, JOIN_VIEW);

    expect(await league().fetchLeagueJoin('abcd2345')).toEqual({ ok: true, view: JOIN_VIEW });
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/liga/bli-med/abcd2345`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect((requestInit().headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(requestInit().body).toBeUndefined();
  });

  it.each([
    [401, 'unauthorized'],
    [404, 'not_found'],
    [500, 'load_failed'],
  ])('oversetter %i til %s', async (status, reason) => {
    respondWith(status, { error: 'x' });
    expect(await league().fetchLeagueJoin('abcd2345')).toEqual({ ok: false, reason });
  });

  it('en 200 med et utfall vi ikke kjenner, er ikke en liga å tegne', async () => {
    respondWith(200, { ...JOIN_VIEW, decision: 'sign_in' });
    expect(await league().fetchLeagueJoin('abcd2345')).toEqual({ ok: false, reason: 'load_failed' });
    respondWith(200, { decision: 'can_join' });
    expect(await league().fetchLeagueJoin('abcd2345')).toEqual({ ok: false, reason: 'load_failed' });
  });

  it('sender ingenting uten nett', async () => {
    mockNetwork.online = false;
    expect(await league().fetchLeagueJoin('abcd2345')).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('joinLeague (#2748)', () => {
  useWebRoute();

  it('poster til lenka uten kropp: kalleren er tokenet og koden står i stien', async () => {
    respondWith(200, { leagueId: LEAGUE_ID });

    expect(await league().joinLeague('abcd2345')).toEqual({ ok: true, leagueId: LEAGUE_ID });
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/liga/bli-med/abcd2345`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect((requestInit().headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(requestInit().body).toBeUndefined();
  });

  it.each([
    [401, { error: 'unauthorized' }, 'unauthorized'],
    [404, { error: 'not_found' }, 'not_found'],
    [409, { error: 'closed' }, 'closed'],
    [409, { error: 'profile_incomplete' }, 'profile_incomplete'],
    [409, { error: 'noe_nytt' }, 'save_failed'],
    [500, { error: 'read_failed' }, 'read_failed'],
    [500, { error: 'save_failed' }, 'save_failed'],
    [500, {}, 'save_failed'],
  ])('oversetter %i %j til %s', async (status, body, reason) => {
    respondWith(status, body);
    expect(await league().joinLeague('abcd2345')).toEqual({ ok: false, reason });
  });

  it('en 200 uten liga er ikke en påmelding', async () => {
    respondWith(200, {});
    expect(await league().joinLeague('abcd2345')).toEqual({ ok: false, reason: 'save_failed' });
  });

  it('sender ingenting uten nett, og sier det', async () => {
    mockNetwork.online = false;
    expect(await league().joinLeague('abcd2345')).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
