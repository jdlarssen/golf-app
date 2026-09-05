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
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

// Nett-status styres per test. `mock`-prefikset er jests egen regel for
// variabler en `jest.mock`-fabrikk får lov å lukke over.
const mockNetwork = { online: true };
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

const GAME = 'game-1';
const ME = 'user-me';
const MATE = 'user-mate';
const OTHER = 'user-other';

type Mocks = typeof import('../test/supabaseMock');
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
) {
  return {
    data: { status, game_mode: gameMode, mode_config: modeConfig },
    error: null,
  };
}

/** Et lag-format: best ball med to per lag. */
const TEAM_GAME = gameRow('scheduled', 'best_ball', { team_size: 2 });

const ONE_ROW = { data: [{ user_id: MATE }], error: null };
const ZERO_ROWS = { data: [], error: null };

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

/** Patchen en `update`/`insert` ble kalt med. */
function patchOf(stub: ReturnType<Mocks['queryStub']>, method: 'update' | 'insert') {
  const { stepArgs } = mocks();
  return stepArgs(stub, method)[0]![0] as Record<string, unknown>;
}

describe('rosterActions', () => {
  useFreshModules();

  beforeEach(() => {
    mockNetwork.online = true;
    mocks().currentDeviceUserId.mockResolvedValue(ME);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Forutsetningene alle seks arrangør-handlingene deler
  // ───────────────────────────────────────────────────────────────────────────

  describe('forutsetninger', () => {
    it('nekter uten sesjon, og rører ikke DB', async () => {
      const { supabase, currentDeviceUserId } = mocks();
      currentDeviceUserId.mockResolvedValue(null);

      expect(await actions().addPlayerToGame(GAME, MATE)).toEqual({
        ok: false,
        reason: 'no-session',
      });
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it.each([
      ['addPlayerToGame'],
      ['removePlayerFromGame'],
      ['withdrawPlayer'],
      ['undoWithdrawPlayer'],
    ])('nekter %s uten nett — skrivingene går aldri i sync-køen', async (name) => {
      mockNetwork.online = false;
      const { supabase } = mocks();

      const fn = actions()[name as 'addPlayerToGame'];
      expect(await fn(GAME, MATE)).toEqual({ ok: false, reason: 'offline' });
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('svarer not-found når spillet ikke er synlig', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({ games: [queryStub({ data: null, error: null })] });

      expect(await actions().addPlayerToGame(GAME, MATE)).toEqual({
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
    it('inserter med webbens eksakte kolonnesett', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const insert = queryStub(ONE_ROW);
      routeFrom({
        games: [queryStub(gameRow('scheduled'))],
        game_players: [queryStub(rosterOf(3)), insert],
      });

      expect(await actions().addPlayerToGame(GAME, MATE)).toEqual({
        ok: true,
        alreadyDone: false,
      });

      expect(patchOf(insert, 'insert')).toEqual({
        game_id: GAME,
        user_id: MATE,
        team_number: null,
        flight_number: null,
        course_handicap: null,
        // Arrangøren legger til en ANNEN — hen bekrefter selv (#463).
        accepted_at: null,
      });
      // Uten `.select()` finnes det ikke noe radantall å asserte på (trap 2).
      expect(stepArgs(insert, 'select')).toEqual([['user_id']]);
    });

    it('svelger en UNIQUE-violation — spilleren er alt på rosteret', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('draft'))],
        game_players: [
          queryStub(rosterOf(2)),
          queryStub({
            data: null,
            error: { message: 'duplicate key value', code: '23505' },
          }),
        ],
      });

      expect(await actions().addPlayerToGame(GAME, MATE)).toEqual({
        ok: true,
        alreadyDone: true,
      });
    });

    it('melder rls-denied når 0115-vakta avviser raden', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('scheduled'))],
        game_players: [
          queryStub(rosterOf(2)),
          queryStub({
            data: null,
            error: { message: 'insufficient_privilege', code: '42501' },
          }),
        ],
      });

      expect(await actions().addPlayerToGame(GAME, MATE)).toMatchObject({
        ok: false,
        reason: 'rls-denied',
      });
    });

    it('nekter en niende spiller i stableford — veiviserens tak, ikke et nytt tall', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow('scheduled', 'stableford'))],
        // Åtte rader = `maxPlayersForMode('stableford')`. Den niende ville blitt
        // stille droppet av den delte byggeren ved start.
        game_players: [queryStub(rosterOf(8))],
      });

      expect(await actions().addPlayerToGame(GAME, MATE)).toEqual({
        ok: false,
        reason: 'roster-full',
      });
    });

    it('har intet tak for et format appen ikke kjenner', async () => {
      const { queryStub, routeFrom } = mocks();
      // `foursomes_matchplay` finnes ikke i APP_SUPPORTED_MODES — da hoppes
      // rosterlesningen over helt, og bare status-gaten står igjen.
      routeFrom({
        games: [queryStub(gameRow('scheduled', 'foursomes_matchplay'))],
        game_players: [queryStub(ONE_ROW)],
      });

      expect(await actions().addPlayerToGame(GAME, MATE)).toEqual({
        ok: true,
        alreadyDone: false,
      });
    });

    it.each([['active'], ['finished']])(
      'nekter å legge til i et %s spill, og skriver ingenting',
      async (status: string) => {
        const { queryStub, routeFrom, supabase } = mocks();
        // Ingen `game_players`-plan: prøver handlingen å skrive likevel, kaster
        // ruteren og testen faller.
        routeFrom({ games: [queryStub(gameRow(status))] });

        expect(await actions().addPlayerToGame(GAME, MATE)).toEqual({
          ok: false,
          reason: 'roster-locked',
        });
        expect(supabase.from).toHaveBeenCalledTimes(1);
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
});
