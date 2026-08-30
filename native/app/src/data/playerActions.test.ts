// Native N3 (#1825): lever/godkjenn/avvis.
//
// Tyngdepunktet er 0-rads-fella (#667/#704): PostgREST svarer `error == null`
// på en UPDATE som traff ingenting, og webben har alt blødd på nettopp det.
// Hver handling må skille «alt gjort» fra «nektet» — aldri melde suksess for en
// skriving som ikke skjedde.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { NO_REJECTION_REASON } from '../../../../lib/games/rejectionReason';
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const GAME = 'game-1';
const ME = 'user-me';
const MATE = 'user-mate';

type Mocks = typeof import('../test/supabaseMock');
type Actions = typeof import('./playerActions');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function actions(): Actions {
  return require('./playerActions') as Actions;
}

const ACTIVE_GAME = { data: { status: 'active' }, error: null };
const ONE_ROW = { data: [{ user_id: ME }], error: null };
const ZERO_ROWS = { data: [], error: null };

/** Filtrene som ble kjedet på, som «metode(arg, arg)»-strenger. */
function filtersOf(stub: ReturnType<Mocks['queryStub']>): string[] {
  return stub.steps
    .filter((s) => s.method !== 'update' && s.method !== 'select')
    // `String(null)` og ikke `join` direkte: join gjør null til tom streng, og
    // da ville et manglende null-filter sett identisk ut med et som står der.
    .map((s) => `${s.method}(${s.args.map((a) => String(a)).join(',')})`);
}

describe('playerActions', () => {
  useFreshModules();

  beforeEach(() => {
    mocks().currentDeviceUserId.mockResolvedValue(ME);
  });

  describe('submitScorecard', () => {
    it('setter submitted_at og nuller en tidligere avvisningsgrunn', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const update = queryStub(ONE_ROW);
      routeFrom({
        games: [queryStub(ACTIVE_GAME)],
        game_players: [
          queryStub({ data: { withdrawn_at: null, submitted_at: null }, error: null }),
          update,
        ],
      });

      expect(await actions().submitScorecard(GAME)).toEqual({
        ok: true,
        alreadyDone: false,
      });

      const patch = stepArgs(update, 'update')[0]![0] as Record<string, unknown>;
      expect(typeof patch.submitted_at).toBe('string');
      expect(patch.rejection_reason).toBeNull();
      expect(filtersOf(update)).toEqual([
        `eq(game_id,${GAME})`,
        `eq(user_id,${ME})`,
        'is(submitted_at,null)',
      ]);
      // Uten `.select()` finnes det ikke noe radantall å asserte på (trap 2).
      expect(stepArgs(update, 'select')).toEqual([['user_id']]);
    });

    it('er et no-op når kortet alt er levert', async () => {
      const { queryStub, routeFrom, supabase } = mocks();
      routeFrom({
        games: [queryStub(ACTIVE_GAME)],
        game_players: [
          queryStub({
            data: { withdrawn_at: null, submitted_at: '2026-08-30T09:00:00.000Z' },
            error: null,
          }),
        ],
      });

      expect(await actions().submitScorecard(GAME)).toEqual({
        ok: true,
        alreadyDone: true,
      });
      // Ingen tredje spørring: skrivingen hoppes over helt.
      expect(supabase.from).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['draft', 'not-active'],
      ['finished', 'not-active'],
      ['scheduled', 'not-active'],
    ])('nekter å levere i et %s spill', async (status: string, reason: string) => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({ games: [queryStub({ data: { status }, error: null })] });

      expect(await actions().submitScorecard(GAME)).toEqual({ ok: false, reason });
    });

    it('nekter en trukket spiller å levere', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(ACTIVE_GAME)],
        game_players: [
          queryStub({
            data: { withdrawn_at: '2026-08-30T08:00:00.000Z', submitted_at: null },
            error: null,
          }),
        ],
      });

      expect(await actions().submitScorecard(GAME)).toEqual({
        ok: false,
        reason: 'withdrawn',
      });
    });

    it('gjør ingenting uten sesjon', async () => {
      const { supabase, currentDeviceUserId } = mocks();
      currentDeviceUserId.mockResolvedValue(null);

      expect(await actions().submitScorecard(GAME)).toEqual({
        ok: false,
        reason: 'no-session',
      });
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('leser 0 rader som suksess når raden faktisk ER levert', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(ACTIVE_GAME)],
        game_players: [
          queryStub({ data: { withdrawn_at: null, submitted_at: null }, error: null }),
          queryStub(ZERO_ROWS),
          // Oppfølgings-SELECT: et parallelt trykk vant kappløpet.
          queryStub({
            data: { submitted_at: '2026-08-30T09:00:00.000Z' },
            error: null,
          }),
        ],
      });

      expect(await actions().submitScorecard(GAME)).toEqual({
        ok: true,
        alreadyDone: true,
      });
    });

    it('leser 0 rader som FEIL når raden fortsatt ikke er levert', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(ACTIVE_GAME)],
        game_players: [
          queryStub({ data: { withdrawn_at: null, submitted_at: null }, error: null }),
          queryStub(ZERO_ROWS),
          queryStub({ data: { submitted_at: null }, error: null }),
        ],
      });

      expect(await actions().submitScorecard(GAME)).toEqual({
        ok: false,
        reason: 'no-rows',
      });
    });

    it('rapporterer en DB-feil som feil', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(ACTIVE_GAME)],
        game_players: [
          queryStub({ data: { withdrawn_at: null, submitted_at: null }, error: null }),
          queryStub({ data: null, error: { message: 'permission denied' } }),
        ],
      });

      expect(await actions().submitScorecard(GAME)).toMatchObject({
        ok: false,
        reason: 'db',
      });
    });
  });

  describe('approveScorecard', () => {
    it('setter approved_at + approved_by_user_id og filtrerer bort alt annet enn et levert, ikke-godkjent kort', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const update = queryStub(ONE_ROW);
      routeFrom({ games: [queryStub(ACTIVE_GAME)], game_players: [update] });

      expect(await actions().approveScorecard(GAME, MATE)).toEqual({
        ok: true,
        alreadyDone: false,
      });

      const patch = stepArgs(update, 'update')[0]![0] as Record<string, unknown>;
      expect(typeof patch.approved_at).toBe('string');
      expect(patch.approved_by_user_id).toBe(ME);
      expect(patch.rejection_reason).toBeNull();
      expect(filtersOf(update)).toEqual([
        `eq(game_id,${GAME})`,
        `eq(user_id,${MATE})`,
        'not(submitted_at,is,null)',
        'is(approved_at,null)',
      ]);
      expect(stepArgs(update, 'select')).toEqual([['user_id']]);
    });

    it('leser 0 rader som suksess når kortet alt er godkjent', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(ACTIVE_GAME)],
        game_players: [
          queryStub(ZERO_ROWS),
          queryStub({ data: { approved_at: '2026-08-30T09:30:00.000Z' }, error: null }),
        ],
      });

      expect(await actions().approveScorecard(GAME, MATE)).toEqual({
        ok: true,
        alreadyDone: true,
      });
    });

    it('leser 0 rader som FEIL når kortet ikke er godkjent (RLS nektet)', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(ACTIVE_GAME)],
        game_players: [
          queryStub(ZERO_ROWS),
          queryStub({ data: { approved_at: null }, error: null }),
        ],
      });

      expect(await actions().approveScorecard(GAME, MATE)).toEqual({
        ok: false,
        reason: 'no-rows',
      });
    });

    it('leser 0 rader som FEIL når raden ikke er synlig i det hele tatt', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(ACTIVE_GAME)],
        game_players: [queryStub(ZERO_ROWS), queryStub({ data: null, error: null })],
      });

      expect(await actions().approveScorecard(GAME, MATE)).toEqual({
        ok: false,
        reason: 'no-rows',
      });
    });

    it.each([['draft'], ['scheduled'], ['finished']])(
      'nekter å godkjenne i et %s spill, og skriver ingenting',
      async (status: string) => {
        const { queryStub, routeFrom, supabase } = mocks();
        // Ingen `game_players`-plan: prøver handlingen å skrive likevel, kaster
        // ruteren og testen faller. Porten skal svare før noen UPDATE finnes.
        routeFrom({ games: [queryStub({ data: { status }, error: null })] });

        expect(await actions().approveScorecard(GAME, MATE)).toEqual({
          ok: false,
          reason: 'not-active',
        });
        expect(supabase.from).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('rejectScorecard', () => {
    it('nuller leverings- og godkjenningssporet og lagrer grunnen', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const update = queryStub(ONE_ROW);
      routeFrom({ games: [queryStub(ACTIVE_GAME)], game_players: [update] });

      expect(await actions().rejectScorecard(GAME, MATE, '  Hull 7 mangler  ')).toEqual(
        { ok: true, alreadyDone: false },
      );

      expect(stepArgs(update, 'update')[0]![0]).toEqual({
        submitted_at: null,
        approved_at: null,
        approved_by_user_id: null,
        rejection_reason: 'Hull 7 mangler',
      });
      expect(filtersOf(update)).toEqual([
        `eq(game_id,${GAME})`,
        `eq(user_id,${MATE})`,
        'not(submitted_at,is,null)',
      ]);
    });

    it.each([
      ['ingen grunn oppgitt', undefined],
      ['bare mellomrom', '   '],
      ['tom streng', ''],
    ])('lagrer maskinsentinelen ved %s', async (_label: string, reason?: string) => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const update = queryStub(ONE_ROW);
      routeFrom({ games: [queryStub(ACTIVE_GAME)], game_players: [update] });

      await actions().rejectScorecard(GAME, MATE, reason);

      const patch = stepArgs(update, 'update')[0]![0] as Record<string, unknown>;
      // Sentinelen kommer fra den DELTE kilden — banneret på spill-hjem er gated
      // på at feltet er truthy, så `null` ville vært usynlig for spilleren.
      expect(patch.rejection_reason).toBe(NO_REJECTION_REASON);
    });

    it('kutter en overlang grunn på 500 tegn', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const update = queryStub(ONE_ROW);
      routeFrom({ games: [queryStub(ACTIVE_GAME)], game_players: [update] });

      await actions().rejectScorecard(GAME, MATE, 'x'.repeat(900));

      const patch = stepArgs(update, 'update')[0]![0] as Record<string, unknown>;
      expect(patch.rejection_reason).toHaveLength(500);
    });

    it('leser 0 rader som suksess når kortet alt er avvist', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(ACTIVE_GAME)],
        game_players: [
          queryStub(ZERO_ROWS),
          queryStub({ data: { submitted_at: null }, error: null }),
        ],
      });

      expect(await actions().rejectScorecard(GAME, MATE)).toEqual({
        ok: true,
        alreadyDone: true,
      });
    });

    it('leser 0 rader som FEIL når kortet fortsatt står som levert', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(ACTIVE_GAME)],
        game_players: [
          queryStub(ZERO_ROWS),
          queryStub({
            data: { submitted_at: '2026-08-30T09:00:00.000Z' },
            error: null,
          }),
        ],
      });

      expect(await actions().rejectScorecard(GAME, MATE)).toEqual({
        ok: false,
        reason: 'no-rows',
      });
    });

    it.each([['draft'], ['scheduled'], ['finished']])(
      'nekter å avvise i et %s spill, og skriver ingenting',
      async (status: string) => {
        const { queryStub, routeFrom, supabase } = mocks();
        routeFrom({ games: [queryStub({ data: { status }, error: null })] });

        expect(await actions().rejectScorecard(GAME, MATE, 'for sent')).toEqual({
          ok: false,
          reason: 'not-active',
        });
        expect(supabase.from).toHaveBeenCalledTimes(1);
      },
    );
  });
});
