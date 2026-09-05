import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type A (#1918): leverings-regelen, uten transport rundt.
 *
 * Kjernen ble trukket ut av server-action-en så native-appen kan levere lagkort
 * gjennom `app/api/games/[id]/submit-team` uten å kopiere regelen. Her testes
 * utfallene den svarer med — portene, idempotensen og hvem som varsles.
 *
 * Det fila bevisst IKKE re-asserterer: søsken-kaskaden (#1466), som har sin
 * egen dekning gjennom action-en i
 * `app/[locale]/games/[id]/submit/actions.test.ts`, og hvem som er attestant
 * (#543), som bor i `lib/games/flightScope.test.ts`.
 *
 * Klienten er et argument, så testen sender inn to FIFO-mocker: kallerens
 * klient (webbens RLS-klient / rutas admin-klient) og admin-klienten kjernen
 * selv henter for lag-bredden.
 */

const revalidatePathMock = vi.fn();
const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

const sendScorecardSubmittedNotificationMock =
  vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ ok: true }));
vi.mock('@/lib/mail/scorecardSubmittedNotification', () => ({
  sendScorecardSubmittedNotification: (...args: unknown[]) =>
    sendScorecardSubmittedNotificationMock(...args),
}));

const notifyMock = vi.fn<
  (...args: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>
>(async () => ({ shouldAlsoSendMail: true }));
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

import { submitScorecardCore } from './submitScorecardCore';

type CoreClient = Parameters<typeof submitScorecardCore>[0];
const asClient = (mock: ReturnType<typeof buildSupabaseMock>) =>
  mock as unknown as CoreClient;

const GAME_ID = 'game-1';
const USER_ID = 'user-1';

function activeGame(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Vinter-cup',
    status: 'active',
    require_peer_approval: false,
    game_mode: 'stableford',
    hole_segment: 'full',
    tournament_id: null,
    source_game_id: null,
    ...overrides,
  };
}

function membership(overrides: Record<string, unknown> = {}) {
  return {
    withdrawn_at: null,
    submitted_at: null,
    team_number: null,
    ...overrides,
  };
}

/** Hver UPDATE som ble sendt, uansett klient. Tom = ingenting ble skrevet. */
function updateCalls(mock: ReturnType<typeof buildSupabaseMock>) {
  return mock.__fromCalls.filter((c) => c.method === 'update');
}

beforeEach(() => {
  vi.clearAllMocks();
  adminMock = buildSupabaseMock([]);
});

describe('submitScorecardCore — portene', () => {
  it.each([
    {
      navn: 'spillet finnes ikke',
      queue: [{ data: null, error: null }],
      reason: 'not_found',
    },
    {
      navn: 'runden er ferdig',
      queue: [{ data: activeGame({ status: 'finished' }), error: null }],
      reason: 'not_active',
    },
    {
      navn: 'kalleren er ikke med i spillet',
      queue: [
        { data: activeGame(), error: null },
        { data: null, error: null },
      ],
      reason: 'not_player',
    },
    {
      navn: 'spilleren har trukket seg (#387)',
      queue: [
        { data: activeGame(), error: null },
        {
          data: membership({ withdrawn_at: '2026-06-05T10:00:00Z' }),
          error: null,
        },
      ],
      reason: 'withdrawn',
    },
  ])('$navn → $reason, ingenting skrives', async ({ queue, reason }) => {
    const supabase = buildSupabaseMock(queue);

    const result = await submitScorecardCore(
      asClient(supabase),
      GAME_ID,
      USER_ID,
    );

    expect(result).toEqual({ ok: false, reason });
    expect(updateCalls(supabase)).toEqual([]);
    expect(adminMock.__fromCalls).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(sendScorecardSubmittedNotificationMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('#1918: en fremmed får `not_player`, ikke en 0-rads «alt levert»', async () => {
    // Bevisst avvik fra dagens web-oppførsel: før falt `meRow == null` gjennom
    // til UPDATE-en, traff 0 rader og svarte som suksess. På en offentlig rute
    // ville det gitt en fremmed 200 «alt levert».
    const supabase = buildSupabaseMock([
      { data: activeGame(), error: null },
      { data: null, error: null },
    ]);

    const result = await submitScorecardCore(
      asClient(supabase),
      GAME_ID,
      'en-fremmed',
    );

    expect(result).toEqual({ ok: false, reason: 'not_player' });
    // Oppslaget gjaldt den som ringte, og stoppet der.
    expect(
      supabase.__fromCalls.some(
        (c) => c.method === 'eq' && c.args[0] === 'user_id' && c.args[1] === 'en-fremmed',
      ),
    ).toBe(true);
    expect(updateCalls(supabase)).toEqual([]);
  });
});

describe('submitScorecardCore — levering', () => {
  it('solo: markerer egen rad, varsler admin-ene (filtrerer seg selv bort)', async () => {
    const supabase = buildSupabaseMock([
      { data: activeGame(), error: null },
      { data: membership(), error: null },
      // UPDATE returnerer den treffede raden via .select('user_id').
      { data: [{ user_id: USER_ID }], error: null },
      { data: { name: 'Ola Nordmann' }, error: null }, // innsenderens navn
      {
        data: [
          { id: 'admin-1', email: 'arrangoren@example.test', name: 'Jørgen', locale: 'no' },
          { id: USER_ID, email: 'spilleren@example.test', name: 'Ola Nordmann', locale: 'no' },
        ],
        error: null,
      },
    ]);

    const result = await submitScorecardCore(
      asClient(supabase),
      GAME_ID,
      USER_ID,
    );

    expect(result).toEqual({ ok: true, alreadySubmitted: false, submitted: 1 });

    // Egen-rads-formen: kallerens klient skriver, admin-klienten er urørt.
    expect(updateCalls(supabase)).toHaveLength(1);
    expect(adminMock.__fromCalls).toEqual([]);
    expect(
      supabase.__fromCalls.some(
        (c) => c.method === 'is' && c.args[0] === 'submitted_at' && c.args[1] === null,
      ),
    ).toBe(true);

    // Innsenderen (user-1) er filtrert bort — kun Jørgen varsles og mailes.
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'admin-1', kind: 'scorecard_submitted' }),
    );
    expect(sendScorecardSubmittedNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendScorecardSubmittedNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'arrangoren@example.test',
        playerName: 'Ola Nordmann',
        gameName: 'Vinter-cup',
        gameId: GAME_ID,
      }),
    );

    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
    expect(revalidatePathMock).toHaveBeenCalledWith('/games/game-1');
  });

  it('lag (#1453): greensome markerer hele lagets aktive, uleverte rader via admin-klienten', async () => {
    const supabase = buildSupabaseMock([
      { data: activeGame({ game_mode: 'greensome_matchplay' }), error: null },
      { data: membership({ team_number: 1 }), error: null },
      { data: { name: 'Anders Berg' }, error: null }, // innsenderens navn
      { data: [], error: null }, // admin-liste (tom — ingen varsler)
    ]);
    adminMock = buildSupabaseMock([
      { data: [{ user_id: USER_ID }, { user_id: 'mate-2' }], error: null },
    ]);

    const result = await submitScorecardCore(
      asClient(supabase),
      GAME_ID,
      USER_ID,
    );

    expect(result).toEqual({ ok: true, alreadySubmitted: false, submitted: 2 });

    // Lag-bredden går via admin-klienten; kallerens klient skriver ingenting.
    expect(updateCalls(supabase)).toEqual([]);
    const admin = adminMock.__fromCalls;
    expect(
      admin.some((c) => c.table === 'game_players' && c.method === 'update'),
    ).toBe(true);
    expect(
      admin.some(
        (c) => c.method === 'eq' && c.args[0] === 'game_id' && c.args[1] === GAME_ID,
      ),
    ).toBe(true);
    expect(
      admin.some(
        (c) => c.method === 'eq' && c.args[0] === 'team_number' && c.args[1] === 1,
      ),
    ).toBe(true);
    // Trukne og alt-leverte lagkamerater skal ikke røres.
    expect(
      admin.some((c) => c.method === 'is' && c.args[0] === 'withdrawn_at'),
    ).toBe(true);
    expect(
      admin.some((c) => c.method === 'is' && c.args[0] === 'submitted_at'),
    ).toBe(true);
  });

  it('idempotens (#1453): innsenderen står alt som levert → ingen skriving, ingen varsler', async () => {
    const supabase = buildSupabaseMock([
      { data: activeGame({ game_mode: 'greensome_matchplay' }), error: null },
      {
        data: membership({ submitted_at: '2026-08-06T10:00:00Z', team_number: 1 }),
        error: null,
      },
    ]);

    const result = await submitScorecardCore(
      asClient(supabase),
      GAME_ID,
      USER_ID,
    );

    expect(result).toEqual({ ok: true, alreadySubmitted: true, submitted: 0 });
    expect(updateCalls(supabase)).toEqual([]);
    expect(adminMock.__fromCalls).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(sendScorecardSubmittedNotificationMock).not.toHaveBeenCalled();
    // Cachen bustes likevel, så kortet ikke står stale hos kalleren.
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
    expect(revalidatePathMock).toHaveBeenCalledWith('/games/game-1');
  });

  it('0 rader oppdatert (dobbelttrykk / to telefoner) → suksess uten varsler', async () => {
    // AGENTS felle 2: PostgREST svarer `error == null` også når UPDATE-en ikke
    // traff noe. Uten rad-tellingen ville hvert re-klikk fyrt varsler på nytt.
    const supabase = buildSupabaseMock([
      { data: activeGame(), error: null },
      { data: membership(), error: null },
      { data: [], error: null }, // UPDATE traff 0 rader
    ]);

    const result = await submitScorecardCore(
      asClient(supabase),
      GAME_ID,
      USER_ID,
    );

    expect(result).toEqual({ ok: true, alreadySubmitted: true, submitted: 0 });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(sendScorecardSubmittedNotificationMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
  });

  it('DB-feil på oppdateringen → `db`, ingen varsler, ingen cache-busting', async () => {
    const supabase = buildSupabaseMock([
      { data: activeGame(), error: null },
      { data: membership(), error: null },
      { data: null, error: { message: 'permission denied' } },
    ]);

    const result = await submitScorecardCore(
      asClient(supabase),
      GAME_ID,
      USER_ID,
    );

    expect(result).toEqual({ ok: false, reason: 'db' });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(sendScorecardSubmittedNotificationMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
