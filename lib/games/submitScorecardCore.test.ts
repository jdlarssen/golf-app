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

// #2200: the flight rule has its own tests (flightDelivery.test.ts); here the
// loader is the boundary, and the core is tested for what it does with it.
const loadCardsMock = vi.fn<
  (...args: unknown[]) => Promise<{ userId: string; name: string | null; isGuest: boolean }[]>
>(async () => []);
vi.mock('@/lib/games/loadFlightDelivery', () => ({
  loadFlightDeliveryCards: (...args: unknown[]) => loadCardsMock(...args),
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
        // #2207: the admin set the caller's client sees — no e-post column.
        data: [
          { id: 'admin-1', name: 'Jørgen', locale: 'no' },
          { id: USER_ID, name: 'Ola Nordmann', locale: 'no' },
        ],
        error: null,
      },
    ]);
    // The addresses for that set come from the admin client
    // (getPrivateUserFields); the submitter is already filtered out.
    adminMock = buildSupabaseMock([
      { data: [{ id: 'admin-1', email: 'arrangoren@example.test', friend_code: 'k0de' }], error: null },
    ]);

    const result = await submitScorecardCore(
      asClient(supabase),
      GAME_ID,
      USER_ID,
    );

    expect(result).toEqual({ ok: true, alreadySubmitted: false, submitted: 1, alsoDelivered: 0 });

    // Egen-rads-formen: kallerens klient skriver; admin-klienten leser bare
    // admin-enes adresser (#2207) og skriver ingenting.
    expect(updateCalls(supabase)).toHaveLength(1);
    expect(adminMock.__fromCalls.map((c) => `${c.table}.${c.method}`)).toEqual([
      'users.select',
      'users.in',
      'users.returns',
    ]);
    expect(adminMock.__fromCalls.find((c) => c.method === 'in')?.args).toEqual(['id', ['admin-1']]);
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

    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', { expire: 0 });
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

    expect(result).toEqual({ ok: true, alreadySubmitted: false, submitted: 2, alsoDelivered: 0 });

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

    expect(result).toEqual({ ok: true, alreadySubmitted: true, submitted: 0, alsoDelivered: 0 });
    expect(updateCalls(supabase)).toEqual([]);
    expect(adminMock.__fromCalls).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(sendScorecardSubmittedNotificationMock).not.toHaveBeenCalled();
    // Cachen bustes likevel, så kortet ikke står stale hos kalleren.
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', { expire: 0 });
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

    expect(result).toEqual({ ok: true, alreadySubmitted: true, submitted: 0, alsoDelivered: 0 });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(sendScorecardSubmittedNotificationMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', { expire: 0 });
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

describe('submitScorecardCore — levering for flighten (#2200)', () => {
  const OLA = 'ola';
  const PER = 'per';
  const cards = [
    { userId: OLA, name: 'Ola Nordmann', isGuest: false },
    { userId: PER, name: 'Per Gjest', isGuest: true },
  ];

  /** Caller's client for a flight delivery with no admins to notify. */
  function flightClient(updated: { user_id: string }[], meOverrides = {}) {
    return buildSupabaseMock([
      { data: activeGame(), error: null },
      { data: membership(meOverrides), error: null },
      { data: updated, error: null }, // the one flight UPDATE
      { data: { name: 'Kari Fører' }, error: null }, // caller's name
      { data: [], error: null }, // admins (none)
    ]);
  }

  function flightUpdate(mock: ReturnType<typeof buildSupabaseMock>) {
    const calls = mock.__fromCalls;
    const at = calls.findIndex((c) => c.method === 'update');
    return {
      patch: calls[at]?.args[0] as Record<string, unknown>,
      userIds: calls.slice(at).find((c) => c.method === 'in' && c.args[0] === 'user_id')
        ?.args[1],
    };
  }

  it('eget kort pluss makkere: én UPDATE, levert av meg', async () => {
    loadCardsMock.mockResolvedValueOnce(cards);
    const supabase = flightClient([{ user_id: USER_ID }, { user_id: OLA }, { user_id: PER }]);

    const result = await submitScorecardCore(asClient(supabase), GAME_ID, USER_ID, {
      alsoFor: [OLA, PER],
    });

    expect(result).toEqual({ ok: true, alreadySubmitted: false, submitted: 3, alsoDelivered: 2 });
    expect(updateCalls(supabase)).toHaveLength(1);
    const { patch, userIds } = flightUpdate(supabase);
    expect(userIds).toEqual([USER_ID, OLA, PER]);
    expect(patch).toMatchObject({ submitted_by_user_id: USER_ID, rejection_reason: null });
    expect(
      supabase.__fromCalls.some((c) => c.method === 'is' && c.args[0] === 'withdrawn_at'),
    ).toBe(true);
    expect(loadCardsMock).toHaveBeenCalledWith(GAME_ID, USER_ID, {
      game_mode: 'stableford',
      hole_segment: 'full',
      source_game_id: null,
    });
  });

  it('submitted_by_user_id står i patchen også for eget kort alene', async () => {
    const supabase = flightClient([{ user_id: USER_ID }]);

    await submitScorecardCore(asClient(supabase), GAME_ID, USER_ID);

    expect(flightUpdate(supabase).patch).toMatchObject({ submitted_by_user_id: USER_ID });
    expect(loadCardsMock).not.toHaveBeenCalled();
  });

  it('eget kort alt levert: bare makkerne leveres', async () => {
    loadCardsMock.mockResolvedValueOnce(cards);
    const supabase = flightClient([{ user_id: OLA }], { submitted_at: '2026-09-27T10:00:00Z' });

    const result = await submitScorecardCore(asClient(supabase), GAME_ID, USER_ID, {
      alsoFor: [OLA],
    });

    expect(result).toEqual({ ok: true, alreadySubmitted: false, submitted: 1, alsoDelivered: 1 });
    expect(flightUpdate(supabase).userIds).toEqual([OLA]);
  });

  it('forfalskede id-er ignoreres og utvider aldri settet', async () => {
    loadCardsMock.mockResolvedValueOnce([cards[0]]);
    const supabase = flightClient([{ user_id: USER_ID }, { user_id: OLA }]);

    const result = await submitScorecardCore(asClient(supabase), GAME_ID, USER_ID, {
      alsoFor: [OLA, 'annen-flight', USER_ID],
    });

    expect(result).toEqual({ ok: true, alreadySubmitted: false, submitted: 2, alsoDelivered: 1 });
    expect(flightUpdate(supabase).userIds).toEqual([USER_ID, OLA]);
  });

  it('bare forfalskede id-er: vanlig egen levering', async () => {
    loadCardsMock.mockResolvedValueOnce(cards);
    const supabase = flightClient([{ user_id: USER_ID }]);

    const result = await submitScorecardCore(asClient(supabase), GAME_ID, USER_ID, {
      alsoFor: ['en-fremmed'],
    });

    expect(result).toEqual({ ok: true, alreadySubmitted: false, submitted: 1, alsoDelivered: 0 });
    expect(
      supabase.__fromCalls.some((c) => c.method === 'in' && c.args[0] === 'user_id'),
    ).toBe(false);
  });

  it('kappløp: makkeren leverte selv i mellomtiden → tåles', async () => {
    loadCardsMock.mockResolvedValueOnce([cards[0]]);
    const supabase = flightClient([{ user_id: USER_ID }]);
    adminMock = buildSupabaseMock([], {}, {
      byTable: {
        game_players: [
          { data: [{ user_id: OLA, submitted_at: '2026-09-27T10:01:00Z', withdrawn_at: null }], error: null },
        ],
      },
    });

    const result = await submitScorecardCore(asClient(supabase), GAME_ID, USER_ID, {
      alsoFor: [OLA],
    });

    expect(result).toEqual({ ok: true, alreadySubmitted: false, submitted: 1, alsoDelivered: 0 });
    expect(updateCalls(adminMock)).toEqual([]);
  });

  it('drift: RLS nektet en makker → tilbakestill det som ble satt, svar db, ingen varsler', async () => {
    loadCardsMock.mockResolvedValueOnce([cards[0]]);
    const supabase = flightClient([{ user_id: USER_ID }]);
    adminMock = buildSupabaseMock([], {}, {
      byTable: {
        game_players: [
          { data: [{ user_id: OLA, submitted_at: null, withdrawn_at: null }], error: null },
          { data: [{ user_id: USER_ID }], error: null }, // the revert
        ],
      },
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await submitScorecardCore(asClient(supabase), GAME_ID, USER_ID, {
      alsoFor: [OLA],
    });

    expect(result).toEqual({ ok: false, reason: 'db' });
    const revert = updateCalls(adminMock);
    expect(revert).toHaveLength(1);
    expect(revert[0].args[0]).toEqual({ submitted_at: null });
    expect(
      adminMock.__fromCalls.find((c) => c.method === 'in' && c.args[1] !== undefined && (c.args[1] as string[]).includes(USER_ID))?.args,
    ).toEqual(['user_id', [USER_ID]]);
    expect(errorSpy).toHaveBeenCalledWith(
      '[submitScorecard] flight rule drift — reverting',
      expect.anything(),
    );
    expect(notifyMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('lesefeil i kandidat-oppslaget → db, ingenting skrives', async () => {
    loadCardsMock.mockRejectedValueOnce(new Error('boom'));
    const supabase = flightClient([]);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await submitScorecardCore(asClient(supabase), GAME_ID, USER_ID, {
      alsoFor: [OLA],
    });

    expect(result).toEqual({ ok: false, reason: 'db' });
    expect(updateCalls(supabase)).toEqual([]);
    errorSpy.mockRestore();
  });

  it('varsler per levert kort; den som leverte er ikke attestant på makkerens kort', async () => {
    loadCardsMock.mockResolvedValueOnce([cards[0]]);
    const supabase = buildSupabaseMock([
      { data: activeGame({ require_peer_approval: true }), error: null },
      { data: membership(), error: null },
      { data: [{ user_id: USER_ID }, { user_id: OLA }], error: null },
      // The peers query is built before the Promise.all, so it resolves first.
      {
        data: [
          { user_id: USER_ID, flight_number: 1, withdrawn_at: null },
          { user_id: OLA, flight_number: 1, withdrawn_at: null },
          { user_id: 'lise', flight_number: 1, withdrawn_at: null },
        ],
        error: null,
      },
      { data: { name: 'Kari Fører' }, error: null },
      { data: [{ id: 'admin-1', name: 'Jørgen', locale: 'no' }], error: null },
    ]);
    adminMock = buildSupabaseMock([
      { data: [{ id: 'admin-1', email: 'arrangoren@example.test', friend_code: 'k0de' }], error: null },
    ]);

    const result = await submitScorecardCore(asClient(supabase), GAME_ID, USER_ID, {
      alsoFor: [OLA],
    });

    expect(result).toEqual({ ok: true, alreadySubmitted: false, submitted: 2, alsoDelivered: 1 });

    const peerCalls = notifyMock.mock.calls
      .map((c) => c[0] as { userId: string; kind: string; payload: Record<string, unknown> })
      .filter((c) => c.kind === 'peer_approval_request');
    // My card: Ola and Lise approve. Ola's card: only Lise — not me, who delivered it.
    expect(peerCalls.filter((c) => c.payload.submitter_name === 'Kari Fører').map((c) => c.userId).sort()).toEqual(['lise', OLA]);
    expect(peerCalls.filter((c) => c.payload.submitter_name === 'Ola Nordmann').map((c) => c.userId)).toEqual(['lise']);

    const adminCalls = notifyMock.mock.calls
      .map((c) => c[0] as { userId: string; kind: string; payload: Record<string, unknown> })
      .filter((c) => c.kind === 'scorecard_submitted');
    expect(adminCalls.map((c) => c.payload.player_name)).toEqual(['Kari Fører', 'Ola Nordmann']);
    expect(sendScorecardSubmittedNotificationMock).toHaveBeenCalledTimes(2);
    expect(sendScorecardSubmittedNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ playerName: 'Ola Nordmann' }),
    );
  });
});
