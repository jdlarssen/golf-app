// Native N6b (#1855): arrangørens roster-drift.
//
// Tyngdepunktet er det samme som i `playerActions.test.ts`: 0-rads-fella
// (#667/#704). PostgREST svarer `error == null` på en UPDATE eller DELETE som
// traff ingenting, og hver handling må skille «alt gjort» fra «nektet».
//
// Det andre tyngdepunktet er lag-skrivingen: `flight_number` MÅ følge med
// `team_number` (CHECK 0030/0095). Testen som låser det er den ene som fanger
// en regresjon ingen typer ser.
//
// Reglene selv — lagstørrelse, flight-tak, hvilke format som støtter WD — er
// testet i `lib/`. De asserteres ikke om igjen her; det som testes er at DENNE
// fila spør de delte helperne og handler på svaret.
//
// #2215: «legg til» og «åpne kortet igjen» går via ruter, og de fem andre
// arrangør-skrivingene tømmer web-cachen etter et vellykket utfall. Riggen er
// derfor `useWebRoute()` for hele fila, med et 200-svar som standard: da går
// refresh-kallet stille igjennom i testene som ikke handler om det.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { maxPlayersForMode } from '../lib/rosterLimits';
import {
  BASE_URL,
  GAME_ID,
  auth,
  mockFetch,
  mockNetwork,
  requestInit,
  respondWith,
  useWebRoute,
} from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

// Nett-bryteren bor i riggen og MÅ importeres statisk (se webRouteHarness.ts).
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

const GAME = GAME_ID;
const REFRESH_URL = `${BASE_URL}/api/games/${GAME}/refresh`;
const ME = 'user-me';
const MATE = 'user-mate';
const OTHER = 'user-other';

/** Kandidatraden `addPlayerToGame` tar (#2209); bare id-en brukes siden #2215. */
const MATE_PLAYER = { id: MATE, gender: 'mens', level: 'normal' };

type Mocks = typeof import('../test/supabaseMock');
type StubResult = import('../test/supabaseMock').StubResult;
type Actions = typeof import('./rosterActions');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function actions(): Actions {
  return require('./rosterActions') as Actions;
}

/** Spillets gate-rad, slik `loadGame` leser den. */
function gameRow(
  status: string,
  gameMode = 'stableford',
  modeConfig: { team_size?: number } | null = null,
  tournamentId: string | null = null,
) {
  return {
    data: {
      status,
      tournament_id: tournamentId,
      game_mode: gameMode,
      mode_config: modeConfig,
    },
    error: null,
  };
}

/** Et lag-format: best ball med to per lag. */
const TEAM_GAME = gameRow('scheduled', 'best_ball', { team_size: 2 });

/** Texas scramble med fire per lag: flighten er laget (#2290). */
const TEXAS_GAME = gameRow('scheduled', 'texas_scramble', { team_size: 4 });

const ONE_ROW = { data: [{ user_id: MATE }], error: null };
const ZERO_ROWS = { data: [], error: null };
/** PostgREST når RLS eller en vakt avviser skrivingen. */
const RLS_ERROR = { data: null, error: { message: 'permission denied', code: '42501' } };

/** Et roster med `count` rader — nok til å svare på plass-spørsmålet. */
function rosterOf(count: number) {
  return {
    data: Array.from({ length: count }, (_, i) => groupingRow(`p-${i}`, null, null)),
    error: null,
  };
}

function groupingRow(
  userId: string,
  team: number | null,
  flight: number | null,
  withdrawnAt: string | null = null,
) {
  return {
    user_id: userId,
    team_number: team,
    flight_number: flight,
    withdrawn_at: withdrawnAt,
  };
}

/** Filtrene som ble kjedet på, som «metode(arg, arg)»-strenger. */
function filtersOf(stub: ReturnType<Mocks['queryStub']>): string[] {
  return stub.steps
    .filter(
      (s) =>
        s.method !== 'update' &&
        s.method !== 'insert' &&
        s.method !== 'delete' &&
        s.method !== 'select' &&
        s.method !== 'returns',
    )
    // `String(null)` og ikke `join` direkte: join gjør null til tom streng, og
    // da ville et manglende null-filter sett identisk ut med et som står der.
    .map((s) => `${s.method}(${s.args.map((a) => String(a)).join(',')})`);
}

/** Patchen en `update` ble kalt med. */
function patchOf(stub: ReturnType<Mocks['queryStub']>, method: 'update') {
  const { stepArgs } = mocks();
  return stepArgs(stub, method)[0]![0] as Record<string, unknown>;
}

/** Refresh-kallene, altså de som gikk til `…/refresh`. */
function refreshCalls(): unknown[][] {
  return mockFetch.mock.calls.filter((call) => call[0] === REFRESH_URL);
}

describe('rosterActions', () => {
  useWebRoute();

  beforeEach(() => {
    mocks().currentDeviceUserId.mockResolvedValue(ME);
    respondWith(200, {});
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Forutsetningene alle seks arrangør-handlingene deler
  // ───────────────────────────────────────────────────────────────────────────

  describe('forutsetninger', () => {
    it('nekter uten sesjon, og rører ikke DB', async () => {
      const { supabase, currentDeviceUserId } = mocks();
      currentDeviceUserId.mockResolvedValue(null);

      expect(await actions().addPlayerToGame(GAME, MATE_PLAYER)).toEqual({
        ok: false,
        reason: 'no-session',
      });
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it.each<[string, unknown]>([
      // #2209: addPlayerToGame tar kandidatraden, de andre en bruker-id.
      ['addPlayerToGame', MATE_PLAYER],
      ['removePlayerFromGame', MATE],
      ['withdrawPlayer', MATE],
      ['undoWithdrawPlayer', MATE],
      ['reopenScorecard', MATE],
    ])('nekter %s uten nett — skrivingene går aldri i sync-køen', async (name, player) => {
      mockNetwork.online = false;
      const { supabase } = mocks();

      const fn = actions()[name as keyof Actions] as (
        gameId: string,
        player: unknown,
      ) => Promise<unknown>;
      expect(await fn(GAME, player)).toEqual({ ok: false, reason: 'offline' });
      expect(supabase.from).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('svarer not-found når spillet ikke er synlig', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({ games: [queryStub({ data: null, error: null })] });

      expect(await actions().addPlayerToGame(GAME, MATE_PLAYER)).toEqual({
        ok: false,
        reason: 'not-found',
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. confirmParticipation
  // ───────────────────────────────────────────────────────────────────────────

  describe('confirmParticipation', () => {
    it('setter accepted_at på egen rad, kun mens den er null', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const update = queryStub({ data: null, error: null });
      routeFrom({ game_players: [update] });

      await actions().confirmParticipation(GAME);

      const patch = stepArgs(update, 'update')[0]![0] as Record<string, unknown>;
      expect(typeof patch.accepted_at).toBe('string');
      expect(filtersOf(update)).toEqual([
        `eq(game_id,${GAME})`,
        `eq(user_id,${ME})`,
        // Uten dette filteret ville et nytt besøk overskrevet tidspunktet.
        'is(accepted_at,null)',
      ]);
    });

    it('svelger en DB-feil — den skal aldri nå spilleren', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        game_players: [
          queryStub({ data: null, error: { message: 'permission denied' } }),
        ],
      });
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(actions().confirmParticipation(GAME)).resolves.toBeUndefined();
      expect(logged).toHaveBeenCalled();
      logged.mockRestore();
    });

    it('gjør ingenting uten sesjon eller uten nett', async () => {
      const { supabase, currentDeviceUserId } = mocks();
      currentDeviceUserId.mockResolvedValue(null);
      await actions().confirmParticipation(GAME);

      currentDeviceUserId.mockResolvedValue(ME);
      mockNetwork.online = false;
      await actions().confirmParticipation(GAME);

      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. addPlayerToGame
  // ───────────────────────────────────────────────────────────────────────────

  describe('addPlayerToGame', () => {
    const ADD_URL = `${BASE_URL}/api/games/${GAME}/players/${MATE}`;

    it('legger til via POST …/players/<uid>, uten kropp og uten egen skriving (#2215)', async () => {
      const { queryStub, routeFrom, supabase } = mocks();
      // Bare de to lesingene portene trenger. En insert ville kastet i ruteren.
      routeFrom({
        games: [queryStub(gameRow('scheduled'))],
        game_players: [queryStub(rosterOf(3))],
      });
      respondWith(200, { alreadyOnRoster: false });

      expect(await actions().addPlayerToGame(GAME, MATE_PLAYER)).toEqual({
        ok: true,
        alreadyDone: false,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe(ADD_URL);
      const init = requestInit();
      expect(init.method).toBe('POST');
      // Spilleren står i STIEN, aldri i en kropp. Tee-settet leser kjernen selv.
      expect(init.body).toBeUndefined();
      expect(supabase.from).toHaveBeenCalledTimes(2);
    });

    it('leser alreadyOnRoster som suksess — spilleren er alt på rosteret', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('draft'))],
        game_players: [queryStub(rosterOf(2))],
      });
      respondWith(200, { alreadyOnRoster: true });

      expect(await actions().addPlayerToGame(GAME, MATE_PLAYER)).toEqual({
        ok: true,
        alreadyDone: true,
      });
    });

    it.each<[number, Record<string, unknown>, string]>([
      [409, { error: 'game_locked' }, 'roster-locked'],
      [409, { error: 'game_full' }, 'roster-full'],
      [409, { error: 'invite_not_allowed' }, 'rls-denied'],
      [403, { error: 'forbidden' }, 'rls-denied'],
      [401, { error: 'unauthorized' }, 'no-session'],
      [404, { error: 'not_found' }, 'not-found'],
      [500, { error: 'add_failed' }, 'db'],
      // En kode vi ikke kjenner på en 409: fail-closed, ikke en gjettet grunn.
      [409, { error: 'noe_nytt' }, 'db'],
    ])('oversetter %i %j til %s', async (status, body, reason) => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('scheduled'))],
        game_players: [queryStub(rosterOf(2))],
      });
      respondWith(status, body);

      expect(await actions().addPlayerToGame(GAME, MATE_PLAYER)).toEqual({
        ok: false,
        reason,
      });
    });

    it('sier ifra når server-adressen mangler i bygget', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('scheduled'))],
        game_players: [queryStub(rosterOf(2))],
      });
      delete process.env.EXPO_PUBLIC_WEB_BASE_URL;

      expect(await actions().addPlayerToGame(GAME, MATE_PLAYER)).toEqual({
        ok: false,
        reason: 'no-web-base-url',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('leser et manglende token som no-session, uten å sende noe', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('scheduled'))],
        game_players: [queryStub(rosterOf(2))],
      });
      auth().getSession.mockResolvedValue({ data: { session: null } });

      expect(await actions().addPlayerToGame(GAME, MATE_PLAYER)).toEqual({
        ok: false,
        reason: 'no-session',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('leser et kall som aldri kom fram som db', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('scheduled'))],
        game_players: [queryStub(rosterOf(2))],
      });
      mockFetch.mockRejectedValue(new Error('Network request failed'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(await actions().addPlayerToGame(GAME, MATE_PLAYER)).toEqual({
        ok: false,
        reason: 'db',
      });
    });

    it('nekter spiller nummer 41 i stableford — veiviserens tak, ikke et nytt tall', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('scheduled', 'stableford'))],
        // 40 rader = `maxPlayersForMode('stableford')` (#2148). Nummer 41 ville
        // blitt stille droppet av den delte byggeren ved start.
        game_players: [queryStub(rosterOf(maxPlayersForMode('stableford')))],
      });

      expect(await actions().addPlayerToGame(GAME, MATE_PLAYER)).toEqual({
        ok: false,
        reason: 'roster-full',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('har intet tak for et format appen ikke kjenner', async () => {
      const { queryStub, routeFrom } = mocks();
      // `foursomes_matchplay` finnes ikke i APP_SUPPORTED_MODES — da hoppes
      // rosterlesningen over helt, og bare status-gaten står igjen.
      routeFrom({
        games: [queryStub(gameRow('scheduled', 'foursomes_matchplay'))],
      });
      respondWith(200, { alreadyOnRoster: false });

      expect(await actions().addPlayerToGame(GAME, MATE_PLAYER)).toEqual({
        ok: true,
        alreadyDone: false,
      });
    });

    it.each([['active'], ['finished']])(
      'nekter å legge til i et %s spill, og spør ikke ruta',
      async (status: string) => {
        const { queryStub, routeFrom, supabase } = mocks();
        routeFrom({ games: [queryStub(gameRow(status))] });

        expect(await actions().addPlayerToGame(GAME, MATE_PLAYER)).toEqual({
          ok: false,
          reason: 'roster-locked',
        });
        expect(supabase.from).toHaveBeenCalledTimes(1);
        expect(mockFetch).not.toHaveBeenCalled();
      },
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. removePlayerFromGame
  // ───────────────────────────────────────────────────────────────────────────

  describe('removePlayerFromGame', () => {
    it('sletter raden før start', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const del = queryStub(ONE_ROW);
      routeFrom({ games: [queryStub(gameRow('scheduled'))], game_players: [del] });

      expect(await actions().removePlayerFromGame(GAME, MATE)).toEqual({
        ok: true,
        alreadyDone: false,
      });
      expect(filtersOf(del)).toEqual([`eq(game_id,${GAME})`, `eq(user_id,${MATE})`]);
      expect(stepArgs(del, 'select')).toEqual([['user_id']]);
    });

    it('leser 0 rader som suksess når raden ER borte', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('draft'))],
        game_players: [
          queryStub(ZERO_ROWS),
          // Oppfølgings-SELECT: ingen rad igjen — noen andre rakk det først.
          queryStub({ data: null, error: null }),
        ],
      });

      expect(await actions().removePlayerFromGame(GAME, MATE)).toEqual({
        ok: true,
        alreadyDone: true,
      });
    });

    it('leser 0 rader som FEIL når raden fortsatt står der', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('draft'))],
        game_players: [
          queryStub(ZERO_ROWS),
          queryStub({ data: { user_id: MATE }, error: null }),
        ],
      });

      expect(await actions().removePlayerFromGame(GAME, MATE)).toEqual({
        ok: false,
        reason: 'no-rows',
      });
    });

    it.each(['draft', 'scheduled'])(
      'nekter fjerning i en cupkamp (%s) uten å røre game_players (#1937)',
      async (status) => {
        const { queryStub, routeFrom, supabase } = mocks();
        routeFrom({ games: [queryStub(gameRow(status, 'singles_matchplay', null, 'cup-1'))] });

        expect(await actions().removePlayerFromGame(GAME, MATE)).toEqual({
          ok: false,
          reason: 'cup-roster-locked',
        });
        expect(supabase.from).toHaveBeenCalledTimes(1);
      },
    );

    it('nekter fjerning i en aktiv runde — der trekkes spilleren i stedet', async () => {
      const { queryStub, routeFrom, supabase } = mocks();
      routeFrom({ games: [queryStub(gameRow('active'))] });

      expect(await actions().removePlayerFromGame(GAME, MATE)).toEqual({
        ok: false,
        reason: 'roster-locked',
      });
      expect(supabase.from).toHaveBeenCalledTimes(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. setPlayerTeam
  // ───────────────────────────────────────────────────────────────────────────

  describe('setPlayerTeam', () => {
    it('skriver flight_number SAMMEN med team_number, og beholder flighten spilleren har', async () => {
      const { queryStub, routeFrom } = mocks();
      const update = queryStub(ONE_ROW);
      routeFrom({
        games: [queryStub(TEAM_GAME)],
        game_players: [
          queryStub({ data: [groupingRow(MATE, null, 3)], error: null }),
          update,
        ],
      });

      expect(await actions().setPlayerTeam(GAME, MATE, 2)).toEqual({
        ok: true,
        alreadyDone: false,
      });

      // CHECK `game_players_team_flight_consistency` (0030/0095): et lag uten
      // flight avvises av DB. Faller denne, er skrivingen ødelagt.
      expect(patchOf(update, 'update')).toEqual({
        team_number: 2,
        flight_number: 3,
      });
    });

    it('speiler lagnummeret som flight når spilleren ikke har en', async () => {
      const { queryStub, routeFrom } = mocks();
      const update = queryStub(ONE_ROW);
      routeFrom({
        games: [queryStub(TEAM_GAME)],
        game_players: [
          queryStub({ data: [groupingRow(MATE, null, null)], error: null }),
          update,
        ],
      });

      await actions().setPlayerTeam(GAME, MATE, 2);

      expect(patchOf(update, 'update')).toEqual({
        team_number: 2,
        flight_number: 2,
      });
    });

    it('Texas: flighten følger det nye laget, ikke den gamle flighten (#2290)', async () => {
      const { queryStub, routeFrom } = mocks();
      const update = queryStub(ONE_ROW);
      routeFrom({
        games: [queryStub(TEXAS_GAME)],
        game_players: [
          queryStub({
            data: [groupingRow(MATE, 1, 1), groupingRow(OTHER, 2, 2)],
            error: null,
          }),
          update,
        ],
      });

      expect(await actions().setPlayerTeam(GAME, MATE, 2)).toEqual({
        ok: true,
        alreadyDone: false,
      });
      expect(patchOf(update, 'update')).toEqual({
        team_number: 2,
        flight_number: 2,
      });
    });

    it('best ball: får flighten til partneren i det nye laget (#2290)', async () => {
      const { queryStub, routeFrom } = mocks();
      const update = queryStub(ONE_ROW);
      routeFrom({
        games: [queryStub(TEAM_GAME)],
        game_players: [
          queryStub({
            data: [groupingRow(MATE, 3, 3), groupingRow(OTHER, 2, 1)],
            error: null,
          }),
          update,
        ],
      });

      await actions().setPlayerTeam(GAME, MATE, 2);

      expect(patchOf(update, 'update')).toEqual({
        team_number: 2,
        flight_number: 1,
      });
    });

    it('avviser et fullt lag — og teller hverken trukne eller spilleren selv', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(TEAM_GAME)],
        game_players: [
          queryStub({
            data: [
              groupingRow(MATE, 1, 1),
              // De to aktive i lag 2 fyller det (team_size = 2).
              groupingRow(OTHER, 2, 2),
              groupingRow('user-c', 2, 2),
              // Trukket: teller ikke mot kapasiteten.
              groupingRow('user-d', 2, 2, '2026-08-30T08:00:00.000Z'),
            ],
            error: null,
          }),
        ],
      });

      expect(await actions().setPlayerTeam(GAME, MATE, 2)).toEqual({
        ok: false,
        reason: 'team-full',
      });
    });

    it('slipper spilleren inn på sin egen plass i et ellers fullt lag', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(TEAM_GAME)],
        game_players: [
          queryStub({
            data: [groupingRow(MATE, 2, 2), groupingRow(OTHER, 2, 2)],
            error: null,
          }),
          queryStub(ONE_ROW),
        ],
      });

      expect(await actions().setPlayerTeam(GAME, MATE, 2)).toEqual({
        ok: true,
        alreadyDone: false,
      });
    });

    it('nekter lag i wolf — der er team_number en rotasjons-slot', async () => {
      const { queryStub, routeFrom, supabase } = mocks();
      routeFrom({ games: [queryStub(gameRow('scheduled', 'wolf'))] });

      expect(await actions().setPlayerTeam(GAME, MATE, 1)).toEqual({
        ok: false,
        reason: 'no-team-mode',
      });
      expect(supabase.from).toHaveBeenCalledTimes(1);
    });

    it.each([[0], [-1], [1.5], [Number.NaN]])(
      'avviser lagnummer %p før den spør DB',
      async (team: number) => {
        const { supabase } = mocks();

        expect(await actions().setPlayerTeam(GAME, MATE, team)).toEqual({
          ok: false,
          reason: 'bad-team',
        });
        expect(supabase.from).not.toHaveBeenCalled();
      },
    );

    it.each([['draft'], ['finished']])(
      'nekter lag-endring i et %s spill',
      async (status: string) => {
        const { queryStub, routeFrom } = mocks();
        routeFrom({
          games: [queryStub(gameRow(status, 'best_ball', { team_size: 2 }))],
        });

        expect(await actions().setPlayerTeam(GAME, MATE, 1)).toEqual({
          ok: false,
          reason: 'not-active',
        });
      },
    );

    it('svarer not-found når spilleren ikke står på rosteret', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(TEAM_GAME)],
        game_players: [queryStub({ data: [groupingRow(OTHER, 1, 1)], error: null })],
      });

      expect(await actions().setPlayerTeam(GAME, MATE, 1)).toEqual({
        ok: false,
        reason: 'not-found',
      });
    });

    it('leser 0 rader som suksess når laget alt er satt', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(TEAM_GAME)],
        game_players: [
          queryStub({ data: [groupingRow(MATE, null, 1)], error: null }),
          queryStub(ZERO_ROWS),
          queryStub({ data: { team_number: 2 }, error: null }),
        ],
      });

      expect(await actions().setPlayerTeam(GAME, MATE, 2)).toEqual({
        ok: true,
        alreadyDone: true,
      });
    });

    it('leser 0 rader som FEIL når laget IKKE ble satt', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(TEAM_GAME)],
        game_players: [
          queryStub({ data: [groupingRow(MATE, null, 1)], error: null }),
          queryStub(ZERO_ROWS),
          queryStub({ data: { team_number: null }, error: null }),
        ],
      });

      expect(await actions().setPlayerTeam(GAME, MATE, 2)).toEqual({
        ok: false,
        reason: 'no-rows',
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. setPlayerFlight
  // ───────────────────────────────────────────────────────────────────────────

  describe('setPlayerFlight', () => {
    it('setter flight_number alene', async () => {
      const { queryStub, routeFrom } = mocks();
      const update = queryStub(ONE_ROW);
      routeFrom({
        games: [queryStub(gameRow('active'))],
        game_players: [
          queryStub({ data: [groupingRow(MATE, null, 1)], error: null }),
          update,
        ],
      });

      expect(await actions().setPlayerFlight(GAME, MATE, 2)).toEqual({
        ok: true,
        alreadyDone: false,
      });
      expect(patchOf(update, 'update')).toEqual({ flight_number: 2 });
      expect(filtersOf(update)).toEqual([
        `eq(game_id,${GAME})`,
        `eq(user_id,${MATE})`,
      ]);
    });

    it('avviser en full flight — fire baller er en fysisk grense', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('scheduled'))],
        game_players: [
          queryStub({
            data: [
              groupingRow(MATE, null, 1),
              groupingRow(OTHER, null, 2),
              groupingRow('user-c', null, 2),
              groupingRow('user-d', null, 2),
              groupingRow('user-e', null, 2),
            ],
            error: null,
          }),
        ],
      });

      expect(await actions().setPlayerFlight(GAME, MATE, 2)).toEqual({
        ok: false,
        reason: 'flight-full',
      });
    });

    it('nekter flight i Texas — laget er flighten, og ingenting skrives (#2290)', async () => {
      const { queryStub, routeFrom, supabase } = mocks();
      routeFrom({ games: [queryStub(TEXAS_GAME)] });

      expect(await actions().setPlayerFlight(GAME, MATE, 2)).toEqual({
        ok: false,
        reason: 'flight-bound-to-team',
      });
      // Bare spill-oppslaget: ingen roster-lesing, ingen skriving.
      expect(supabase.from).toHaveBeenCalledTimes(1);
    });

    it.each([[0], [2.5]])('avviser flight-nummer %p før den spør DB', async (n: number) => {
      const { supabase } = mocks();

      expect(await actions().setPlayerFlight(GAME, MATE, n)).toEqual({
        ok: false,
        reason: 'bad-flight',
      });
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6–7. withdrawPlayer / undoWithdrawPlayer
  // ───────────────────────────────────────────────────────────────────────────

  describe('withdrawPlayer', () => {
    it('setter withdrawn_at + withdrawn_by_user_id på en ikke-trukket spiller', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const update = queryStub(ONE_ROW);
      routeFrom({
        games: [queryStub(gameRow('active', 'stableford'))],
        game_players: [update],
      });

      expect(await actions().withdrawPlayer(GAME, MATE)).toEqual({
        ok: true,
        alreadyDone: false,
      });

      const patch = patchOf(update, 'update');
      expect(typeof patch.withdrawn_at).toBe('string');
      expect(patch.withdrawn_by_user_id).toBe(ME);
      expect(filtersOf(update)).toEqual([
        `eq(game_id,${GAME})`,
        `eq(user_id,${MATE})`,
        // Dobbelttrykk skal ikke skrive et nytt tidspunkt oppå det gamle.
        'is(withdrawn_at,null)',
      ]);
      expect(stepArgs(update, 'select')).toEqual([['user_id']]);
    });

    it('nekter WD i et format der et frafall betyr noe annet', async () => {
      const { queryStub, routeFrom, supabase } = mocks();
      routeFrom({ games: [queryStub(gameRow('active', 'skins'))] });

      expect(await actions().withdrawPlayer(GAME, MATE)).toEqual({
        ok: false,
        reason: 'withdrawal-unsupported',
      });
      expect(supabase.from).toHaveBeenCalledTimes(1);
    });

    it.each([['scheduled'], ['finished']])(
      'nekter WD i et %s spill — der fjernes spilleren i stedet',
      async (status: string) => {
        const { queryStub, routeFrom } = mocks();
        routeFrom({ games: [queryStub(gameRow(status, 'stableford'))] });

        expect(await actions().withdrawPlayer(GAME, MATE)).toEqual({
          ok: false,
          reason: 'not-active',
        });
      },
    );

    it('leser 0 rader som suksess når spilleren alt er trukket', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('active', 'best_ball'))],
        game_players: [
          queryStub(ZERO_ROWS),
          queryStub({ data: { withdrawn_at: '2026-08-30T08:00:00.000Z' }, error: null }),
        ],
      });

      expect(await actions().withdrawPlayer(GAME, MATE)).toEqual({
        ok: true,
        alreadyDone: true,
      });
    });

    it('leser 0 rader som FEIL når raden ikke er synlig i det hele tatt', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('active', 'best_ball'))],
        game_players: [queryStub(ZERO_ROWS), queryStub({ data: null, error: null })],
      });

      expect(await actions().withdrawPlayer(GAME, MATE)).toEqual({
        ok: false,
        reason: 'no-rows',
      });
    });

    // #1896 — opt-in. Avslutt-flyten ber om den, roster-flaten aldri: der er
    // det lov å trekke en spiller som har levert.
    it('legger submitted_at-filteret på selve skrivet med onlyIfUnsubmitted', async () => {
      const { queryStub, routeFrom } = mocks();
      const update = queryStub(ONE_ROW);
      routeFrom({
        games: [queryStub(gameRow('active', 'stableford'))],
        game_players: [update],
      });

      expect(
        await actions().withdrawPlayer(GAME, MATE, { onlyIfUnsubmitted: true }),
      ).toEqual({ ok: true, alreadyDone: false });

      expect(filtersOf(update)).toEqual([
        `eq(game_id,${GAME})`,
        `eq(user_id,${MATE})`,
        'is(withdrawn_at,null)',
        // Betingelsen ligger i UPDATE-en, ikke i en for-lesing: et kort som
        // lander i mellomtiden gir 0 rader i stedet for å bli overkjørt.
        'is(submitted_at,null)',
      ]);
    });

    it('leser 0 rader som already-submitted når kortet kom inn før skrivet', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const lookup = queryStub({
        data: { withdrawn_at: null, submitted_at: '2026-09-01T10:00:00.000Z' },
        error: null,
      });
      routeFrom({
        games: [queryStub(gameRow('active', 'best_ball'))],
        game_players: [queryStub(ZERO_ROWS), lookup],
      });

      expect(
        await actions().withdrawPlayer(GAME, MATE, { onlyIfUnsubmitted: true }),
      ).toEqual({ ok: false, reason: 'already-submitted' });

      // Uten BEGGE kolonnene kan oppfølgingen ikke skille «alt trukket» fra
      // «rakk å levere» — og da blir grunnen gjettet.
      expect(stepArgs(lookup, 'select')).toEqual([['withdrawn_at, submitted_at']]);
    });

    it('leser 0 rader som FEIL med opt-in når raden ikke er synlig', async () => {
      // Null-grenen bevares også med opt-in: en usynlig rad er nektet, ikke
      // «rakk å levere».
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('active', 'best_ball'))],
        game_players: [queryStub(ZERO_ROWS), queryStub({ data: null, error: null })],
      });

      expect(
        await actions().withdrawPlayer(GAME, MATE, { onlyIfUnsubmitted: true }),
      ).toEqual({ ok: false, reason: 'no-rows' });
    });

    it('bryr seg ikke om submitted_at uten opt-in — roster-flaten trekker leverte lovlig', async () => {
      // Uten opt-in har «rakk å levere» ingen egen grunn: oppfølgingen leser
      // bare withdrawn_at, og en levert, ikke-trukket rad er et vanlig avslag.
      const { queryStub, routeFrom, stepArgs } = mocks();
      const lookup = queryStub({
        data: { withdrawn_at: null, submitted_at: '2026-09-01T10:00:00.000Z' },
        error: null,
      });
      routeFrom({
        games: [queryStub(gameRow('active', 'best_ball'))],
        game_players: [queryStub(ZERO_ROWS), lookup],
      });

      expect(await actions().withdrawPlayer(GAME, MATE)).toEqual({
        ok: false,
        reason: 'no-rows',
      });
      expect(stepArgs(lookup, 'select')).toEqual([['withdrawn_at']]);
    });

    it('leser 0 rader som suksess med opt-in når spilleren alt er trukket', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('active', 'best_ball'))],
        game_players: [
          queryStub(ZERO_ROWS),
          queryStub({
            data: { withdrawn_at: '2026-08-30T08:00:00.000Z', submitted_at: null },
            error: null,
          }),
        ],
      });

      expect(
        await actions().withdrawPlayer(GAME, MATE, { onlyIfUnsubmitted: true }),
      ).toEqual({ ok: true, alreadyDone: true });
    });
  });

  describe('undoWithdrawPlayer', () => {
    it('nuller begge feltene, kun på en trukket spiller', async () => {
      const { queryStub, routeFrom } = mocks();
      const update = queryStub(ONE_ROW);
      routeFrom({
        games: [queryStub(gameRow('active', 'stableford'))],
        game_players: [update],
      });

      expect(await actions().undoWithdrawPlayer(GAME, MATE)).toEqual({
        ok: true,
        alreadyDone: false,
      });
      expect(patchOf(update, 'update')).toEqual({
        withdrawn_at: null,
        withdrawn_by_user_id: null,
      });
      expect(filtersOf(update)).toEqual([
        `eq(game_id,${GAME})`,
        `eq(user_id,${MATE})`,
        'not(withdrawn_at,is,null)',
      ]);
    });

    it('leser 0 rader som suksess når spilleren alt er inne igjen', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('active', 'stableford'))],
        game_players: [
          queryStub(ZERO_ROWS),
          queryStub({ data: { withdrawn_at: null }, error: null }),
        ],
      });

      expect(await actions().undoWithdrawPlayer(GAME, MATE)).toEqual({
        ok: true,
        alreadyDone: true,
      });
    });

    it('leser 0 rader som FEIL når raden ikke finnes', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('active', 'stableford'))],
        game_players: [queryStub(ZERO_ROWS), queryStub({ data: null, error: null })],
      });

      expect(await actions().undoWithdrawPlayer(GAME, MATE)).toEqual({
        ok: false,
        reason: 'no-rows',
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. reopenScorecard (#2220, via ruta siden #2215)
  // ───────────────────────────────────────────────────────────────────────────

  describe('reopenScorecard', () => {
    const REVIEW_URL = `${BASE_URL}/api/games/${GAME}/scorecards/${MATE}`;

    beforeEach(() => {
      // En tom plan kaster på enhver spørring: status, arrangør-porten og
      // lagkort-kaskaden (#2213) er rutas nå, og appen skal ikke lese eller
      // skrive noe selv.
      mocks().routeFrom({});
    });

    it('åpner via POST …/scorecards/<uid> med { decision: reopen }, og tømmer ikke cachen selv', async () => {
      respondWith(200, { alreadyDone: false });

      expect(await actions().reopenScorecard(GAME, MATE)).toEqual({
        ok: true,
        alreadyDone: false,
      });

      // Ett kall: ruta varsler og tømmer web-cachen selv, så et refresh-kall
      // etterpå ville bare vært en ekstra rundtur.
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe(REVIEW_URL);
      expect(requestInit().method).toBe('POST');
      expect(JSON.parse(String(requestInit().body))).toEqual({ decision: 'reopen' });
    });

    it('leser alreadyDone som suksess — kortet var alt åpent', async () => {
      respondWith(200, { alreadyDone: true });

      expect(await actions().reopenScorecard(GAME, MATE)).toEqual({
        ok: true,
        alreadyDone: true,
      });
    });

    it.each<[number, string]>([
      [401, 'no-session'],
      [403, 'rls-denied'],
      [404, 'not-found'],
      [409, 'not-active'],
      [400, 'db'],
      [422, 'db'],
      [500, 'db'],
    ])('oversetter %i til %s', async (status, reason) => {
      respondWith(status, { error: 'whatever' });

      expect(await actions().reopenScorecard(GAME, MATE)).toEqual({ ok: false, reason });
    });

    it('sier ifra når server-adressen mangler i bygget', async () => {
      delete process.env.EXPO_PUBLIC_WEB_BASE_URL;

      expect(await actions().reopenScorecard(GAME, MATE)).toEqual({
        ok: false,
        reason: 'no-web-base-url',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('leser et manglende token som no-session, uten å sende noe', async () => {
      auth().getSession.mockResolvedValue({ data: { session: null } });

      expect(await actions().reopenScorecard(GAME, MATE)).toEqual({
        ok: false,
        reason: 'no-session',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('leser et kall som aldri kom fram som db', async () => {
      mockFetch.mockRejectedValue(new Error('Network request failed'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(await actions().reopenScorecard(GAME, MATE)).toEqual({
        ok: false,
        reason: 'db',
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Web-cachen etter de fem direkte skrivingene (#2215)
  // ───────────────────────────────────────────────────────────────────────────

  describe('web-cachen (#2215)', () => {
    const WITHDRAWN_AT = '2026-09-01T10:00:00.000Z';
    const GROUPING = { data: [groupingRow(MATE, null, 1)], error: null };

    /**
     * Én rad per skriving: handlingen, og tre riggede utfall av selve
     * skrivingen — én rad truffet, 0 rader løst som «alt i mål», og nektet.
     * Begge ok-grenene er med fordi hver funksjon har to steder den kan
     * lykkes, og en glemt tømming på det ene ville gått under radaren.
     */
    interface WriteCase {
      act: () => Promise<unknown>;
      hit: () => void;
      alreadyThere: () => void;
      denied: () => void;
    }

    function rig(games: StubResult, gamePlayers: StubResult[]): void {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(games)],
        game_players: gamePlayers.map((result) => queryStub(result)),
      });
    }

    const CASES: [string, WriteCase][] = [
      [
        'removePlayerFromGame',
        {
          act: () => actions().removePlayerFromGame(GAME, MATE),
          hit: () => rig(gameRow('scheduled'), [ONE_ROW]),
          alreadyThere: () =>
            rig(gameRow('draft'), [ZERO_ROWS, { data: null, error: null }]),
          denied: () => rig(gameRow('scheduled'), [RLS_ERROR]),
        },
      ],
      [
        'setPlayerTeam',
        {
          act: () => actions().setPlayerTeam(GAME, MATE, 2),
          hit: () => rig(TEAM_GAME, [GROUPING, ONE_ROW]),
          alreadyThere: () =>
            rig(TEAM_GAME, [GROUPING, ZERO_ROWS, { data: { team_number: 2 }, error: null }]),
          denied: () => rig(TEAM_GAME, [GROUPING, RLS_ERROR]),
        },
      ],
      [
        'setPlayerFlight',
        {
          act: () => actions().setPlayerFlight(GAME, MATE, 2),
          hit: () => rig(gameRow('active'), [GROUPING, ONE_ROW]),
          alreadyThere: () =>
            rig(gameRow('active'), [
              GROUPING,
              ZERO_ROWS,
              { data: { flight_number: 2 }, error: null },
            ]),
          denied: () => rig(gameRow('active'), [GROUPING, RLS_ERROR]),
        },
      ],
      [
        'withdrawPlayer',
        {
          act: () => actions().withdrawPlayer(GAME, MATE),
          hit: () => rig(gameRow('active', 'stableford'), [ONE_ROW]),
          alreadyThere: () =>
            rig(gameRow('active', 'stableford'), [
              ZERO_ROWS,
              { data: { withdrawn_at: WITHDRAWN_AT }, error: null },
            ]),
          denied: () => rig(gameRow('active', 'stableford'), [RLS_ERROR]),
        },
      ],
      [
        'undoWithdrawPlayer',
        {
          act: () => actions().undoWithdrawPlayer(GAME, MATE),
          hit: () => rig(gameRow('active', 'stableford'), [ONE_ROW]),
          alreadyThere: () =>
            rig(gameRow('active', 'stableford'), [
              ZERO_ROWS,
              { data: { withdrawn_at: null }, error: null },
            ]),
          denied: () => rig(gameRow('active', 'stableford'), [RLS_ERROR]),
        },
      ],
    ];

    it.each(CASES)('%s kaller POST …/refresh én gang etter ok', async (_name, write) => {
      write.hit();

      expect(await write.act()).toEqual({ ok: true, alreadyDone: false });

      expect(mockFetch).toHaveBeenCalledWith(
        REFRESH_URL,
        expect.objectContaining({ method: 'POST' }),
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it.each(CASES)(
      '%s tømmer også når 0 rader ble løst som «alt i mål»',
      async (_name, write) => {
        write.alreadyThere();

        expect(await write.act()).toEqual({ ok: true, alreadyDone: true });
        expect(refreshCalls()).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledTimes(1);
      },
    );

    it.each(CASES)('%s tømmer aldri etter en nektet skriving', async (_name, write) => {
      write.denied();

      expect(await write.act()).toMatchObject({ ok: false, reason: 'rls-denied' });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it.each(CASES)(
      '%s: en feilende refresh endrer ikke resultatet',
      async (_name, write) => {
        write.hit();
        respondWith(500, { error: 'refresh_failed' });
        const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

        expect(await write.act()).toEqual({ ok: true, alreadyDone: false });
        // Skrivingen har skjedd; feilen logges og ingenting annet.
        expect(logged).toHaveBeenCalled();
      },
    );

    it('et refresh-kall som aldri kom fram endrer heller ikke resultatet', async () => {
      rig(gameRow('active'), [GROUPING, ONE_ROW]);
      mockFetch.mockRejectedValue(new Error('Network request failed'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(await actions().setPlayerFlight(GAME, MATE, 2)).toEqual({
        ok: true,
        alreadyDone: false,
      });
    });

    it('confirmParticipation tømmer ikke — «Ikke bekreftet» leser game_players direkte', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({ game_players: [queryStub({ data: null, error: null })] });

      await actions().confirmParticipation(GAME);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
