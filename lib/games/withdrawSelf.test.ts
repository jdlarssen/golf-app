import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type A: selv-frafalls-kjernen (#199 chunk 11, #386 chunk 3, cup-sperren #1814).
 *
 * Casene sto i `app/[locale]/games/[id]/withdrawActions.test.ts` til #1917 og er
 * FLYTTET hit sammen med regelen — ikke kopiert. Wrapperen har igjen sin ene
 * jobb (porten), og den testes der.
 *
 * Kjernen har ingen egen authz: den tar `userId` som argument og spør aldri hvem
 * som ringer. Derfor finnes ingen redirect-case her — den bor hos wrapperen.
 *
 * withdrawSelf:
 *   - Ugyldig gameId → game_not_found uten DB-call
 *   - Spill ikke funnet → game_not_found
 *   - Spill aktivt + in-scope-modus → UPDATE withdrawn_at (ikke DELETE)
 *   - Spill aktivt + out-of-scope-modus → game_locked
 *   - Bruker ikke påmeldt → not_registered
 *   - Suksess solo (team_number=null) → DELETE + revalidateTag (ingen notify)
 *   - Suksess team-medlem → DELETE + notify kaptein
 *   - DB-feil ved DELETE → db_error
 *   - 0-rads-UPDATE → db_error (felle 2: PostgREST melder ingen feil)
 *
 * undoSelfWithdraw:
 *   - Aktivt spill + egen WD-rad → nullstiller withdrawn_at
 *   - Bruker ikke trukket → not_registered
 *   - Spill finished → game_locked
 *
 * #2358 — kjernen speiler databasens regler for de samme radene:
 *   - angre går bare når kalleren trakk seg selv (vakt (c), 0108)
 *   - «trekk meg» på en rad som alt er trukket skriver ingenting
 *   - en kaptein med lagkamerater som har takket ja kan ikke trekke seg før
 *     start; ubesvarte invitasjoner trekkes sammen med kapteinen
 *   - ingen kapteinsrad slettes, så kaskaden i 0042 når aldri laget
 */

// Kjernen revaliderer selv (`expireGameCache`), og `revalidateTag` kaster
// utenfor en Next-request. Samme grunn som `endGameCore.test.ts` mocker den.
const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

const notifyMock = vi.fn<
  (...args: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>
>(async () => ({ shouldAlsoSendMail: false }));
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

// #2203: the last missing player withdrawing can make the round ready; that
// has its own suite, here only that the withdrawal asks.
const notifyOrganizerIfAllDeliveredMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/notifications/organizerNotices', () => ({
  notifyOrganizerIfAllDelivered: (...args: unknown[]) =>
    notifyOrganizerIfAllDeliveredMock(...args),
}));

let adminMock: ReturnType<typeof buildSupabaseMock>;

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';
const GAME_ID = '22222222-2222-2222-2222-222222222222';
const CAPTAIN_ID = '33333333-3333-3333-3333-333333333333';
const TEAMMATE_ID = '44444444-4444-4444-4444-444444444444';
const CAPTAIN_REQ_ID = '55555555-5555-5555-5555-555555555555';
const MY_REQ_ID = '66666666-6666-6666-6666-666666666666';
const CHILD_REQ_ID = '77777777-7777-7777-7777-777777777777';
const OTHER_CHILD_REQ_ID = '88888888-8888-8888-8888-888888888888';
const SECOND_MATE_ID = '99999999-9999-9999-9999-999999999999';

beforeEach(() => {
  vi.clearAllMocks();
  adminMock = buildSupabaseMock([]);
});

describe('withdrawSelf', () => {
  it('ugyldig gameId-format → game_not_found uten DB-call', async () => {
    const { withdrawSelf } = await import('./withdrawSelf');

    const result = await withdrawSelf('not-a-uuid', USER_ID);
    expect(result).toEqual({ ok: false, error: 'game_not_found' });
    expect(adminMock.__fromCalls).toHaveLength(0);
  });

  it('spill ikke funnet → game_not_found', async () => {
    adminMock = buildSupabaseMock([
      // 1) games lookup
      { data: null, error: null },
      // 2) game_players lookup (parallel)
      { data: null, error: null },
    ]);
    const { withdrawSelf } = await import('./withdrawSelf');

    const result = await withdrawSelf(GAME_ID, USER_ID);
    expect(result).toEqual({ ok: false, error: 'game_not_found' });
  });

  it('spill er aktivt + in-scope modus (best_ball) → UPDATE withdrawn_at, ikke DELETE', async () => {
    adminMock = buildSupabaseMock([
      // 1) games — active, best_ball (in-scope)
      {
        data: {
          id: GAME_ID,
          name: 'X',
          short_id: 'abc12345',
          status: 'active',
          game_mode: 'best_ball',
        },
        error: null,
      },
      // 2) game_players — bruker er påmeldt
      { data: { user_id: USER_ID, team_number: null }, error: null },
      // 3) UPDATE game_players (set withdrawn_at) — #712: .select() returns affected rows
      { data: [{ user_id: USER_ID }], error: null },
    ]);
    const { withdrawSelf } = await import('./withdrawSelf');

    const result = await withdrawSelf(GAME_ID, USER_ID);
    expect(result).toEqual({ ok: true, kept: true });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
    expect(notifyOrganizerIfAllDeliveredMock.mock.calls).toEqual([
      [GAME_ID, USER_ID, 'withdrawSelf'],
    ]);
    // Skal ikke slette raden
    const deleteCalls = adminMock.__fromCalls.filter(
      (c) => c.method === 'delete',
    );
    expect(deleteCalls).toHaveLength(0);
    // Skal UPDATE game_players
    const updateCalls = adminMock.__fromCalls.filter(
      (c) => c.method === 'update',
    );
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('spill er aktivt + out-of-scope modus (wolf) → game_locked', async () => {
    adminMock = buildSupabaseMock([
      // 1) games — active, wolf (out-of-scope)
      {
        data: {
          id: GAME_ID,
          name: 'X',
          short_id: 'abc12345',
          status: 'active',
          game_mode: 'wolf',
        },
        error: null,
      },
      // 2) game_players — bruker er påmeldt
      { data: { user_id: USER_ID, team_number: null }, error: null },
    ]);
    const { withdrawSelf } = await import('./withdrawSelf');

    const result = await withdrawSelf(GAME_ID, USER_ID);
    expect(result).toEqual({ ok: false, error: 'game_locked' });
  });

  it('bruker ikke påmeldt → not_registered', async () => {
    adminMock = buildSupabaseMock([
      // 1) games — scheduled
      {
        data: {
          id: GAME_ID,
          name: 'X',
          short_id: 'abc12345',
          status: 'scheduled',
          game_mode: 'best_ball',
        },
        error: null,
      },
      // 2) game_players — ingen rad for brukeren
      { data: null, error: null },
    ]);
    const { withdrawSelf } = await import('./withdrawSelf');

    const result = await withdrawSelf(GAME_ID, USER_ID);
    expect(result).toEqual({ ok: false, error: 'not_registered' });
  });

  it('suksess solo (team_number=null) → DELETE + revalidate, ingen notify', async () => {
    adminMock = buildSupabaseMock([
      // 1) games — draft
      {
        data: {
          id: GAME_ID,
          name: 'Sommercup',
          short_id: 'abc12345',
          status: 'draft',
          game_mode: 'best_ball',
          // #2445: the caller's own draft, the organiser's path.
          created_by: USER_ID,
        },
        error: null,
      },
      // 2) game_players — solo (team_number=null)
      { data: { user_id: USER_ID, team_number: null }, error: null },
      // 3) egen påmeldingsrad (#2358: kaptein-sjekken) — ingen
      { data: null, error: null },
      // 4) DELETE game_players
      { data: null, error: null },
      // 5) DELETE game_registration_requests
      { data: null, error: null },
    ]);
    const { withdrawSelf } = await import('./withdrawSelf');

    const result = await withdrawSelf(GAME_ID, USER_ID);

    expect(result).toEqual({ ok: true, kept: false });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('#2445: spiller på andres utkast → game_not_found, ingen DELETE og ingen notify', async () => {
    const ORGANISER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    // The team-member queue from the case below: without the draft gate the
    // row is deleted and the captain is told the hidden game's name.
    adminMock = buildSupabaseMock([
      {
        data: {
          id: GAME_ID,
          name: 'Hemmelig utkast',
          short_id: 'abc12345',
          status: 'draft',
          game_mode: 'best_ball',
          created_by: ORGANISER_ID,
        },
        error: null,
      },
      { data: { user_id: USER_ID, team_number: 1 }, error: null },
      {
        data: {
          id: MY_REQ_ID,
          status: 'approved',
          team_name: 'Bjørka',
          team_request_id: CAPTAIN_REQ_ID,
          is_team_captain: false,
        },
        error: null,
      },
      { data: [{ user_id: TEAMMATE_ID }], error: null },
      { data: { user_id: CAPTAIN_ID }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      {
        data: { name: 'Per Spiller', nickname: null, email: 'per@example.test' },
        error: null,
      },
    ]);
    const { withdrawSelf } = await import('./withdrawSelf');

    const result = await withdrawSelf(GAME_ID, USER_ID);

    expect(result).toEqual({ ok: false, error: 'game_not_found' });
    expect(
      adminMock.__fromCalls.filter(
        (c) => c.method === 'delete' || c.method === 'update',
      ),
    ).toHaveLength(0);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('suksess team-medlem → DELETE + notify kaptein med team_member_withdrew', async () => {
    adminMock = buildSupabaseMock([
      // 1) games
      {
        data: {
          id: GAME_ID,
          name: 'Sommercup',
          short_id: 'abc12345',
          status: 'scheduled',
          game_mode: 'best_ball',
        },
        error: null,
      },
      // 2) game_players — team_number=1
      { data: { user_id: USER_ID, team_number: 1 }, error: null },
      // 3) min request-rad (team_name + team_request_id). #2358: leses først,
      // fordi den avgjør om kalleren er kaptein.
      {
        data: {
          id: MY_REQ_ID,
          status: 'approved',
          team_name: 'Bjørka',
          team_request_id: CAPTAIN_REQ_ID,
          is_team_captain: false,
        },
        error: null,
      },
      // 4) mates lookup (samme team_number) → finnes en til
      { data: [{ user_id: TEAMMATE_ID }], error: null },
      // 5) captain request lookup
      { data: { user_id: CAPTAIN_ID }, error: null },
      // 6) DELETE game_players
      { data: null, error: null },
      // 7) DELETE game_registration_requests
      { data: null, error: null },
      // 8) users lookup for navnet i payload
      {
        data: { name: 'Per Spiller', nickname: null, email: 'per@example.test' },
        error: null,
      },
    ]);
    const { withdrawSelf } = await import('./withdrawSelf');

    const result = await withdrawSelf(GAME_ID, USER_ID);

    expect(result).toEqual({ ok: true, kept: false });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: CAPTAIN_ID,
        kind: 'team_member_withdrew',
        payload: expect.objectContaining({
          game_id: GAME_ID,
          game_short_id: 'abc12345',
          game_name: 'Sommercup',
          withdrawn_player_name: 'Per Spiller',
          team_name: 'Bjørka',
        }),
      }),
    );
  });

  it('DB-feil ved DELETE → db_error', async () => {
    adminMock = buildSupabaseMock([
      // 1) games
      {
        data: {
          id: GAME_ID,
          name: 'X',
          short_id: 'abc12345',
          status: 'scheduled',
          game_mode: 'best_ball',
        },
        error: null,
      },
      // 2) game_players (solo)
      { data: { user_id: USER_ID, team_number: null }, error: null },
      // 3) egen påmeldingsrad — ingen
      { data: null, error: null },
      // 4) DELETE feiler
      { data: null, error: { code: '12345', message: 'sql crashed' } },
    ]);
    const { withdrawSelf } = await import('./withdrawSelf');

    const result = await withdrawSelf(GAME_ID, USER_ID);
    expect(result).toEqual({ ok: false, error: 'db_error' });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('0-rads-UPDATE i aktiv runde → db_error, ikke stille suksess', async () => {
    // AGENTS-felle 2: PostgREST svarer `error == null` på en UPDATE som traff
    // ingenting. Raden kan ha forsvunnet mellom lesingen over og skrivingen —
    // en samtidig fjerning fra Sekretariatet. `expectAffected` er vakta.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([
      {
        data: {
          id: GAME_ID,
          name: 'X',
          short_id: 'abc12345',
          status: 'active',
          game_mode: 'best_ball',
        },
        error: null,
      },
      { data: { user_id: USER_ID, team_number: null }, error: null },
      // UPDATE traff ingen rader — og meldte ingen feil.
      { data: [], error: null },
    ]);
    const { withdrawSelf } = await import('./withdrawSelf');

    expect(await withdrawSelf(GAME_ID, USER_ID)).toEqual({
      ok: false,
      error: 'db_error',
    });
    expect(revalidateTagMock).not.toHaveBeenCalled();
    expect(notifyOrganizerIfAllDeliveredMock).not.toHaveBeenCalled();
  });
});

describe('undoSelfWithdraw', () => {
  it('aktivt spill + spilleren er trukket → nullstiller withdrawn_at', async () => {
    adminMock = buildSupabaseMock([
      // 1) games — active, in-scope
      {
        data: {
          id: GAME_ID,
          status: 'active',
          game_mode: 'best_ball',
        },
        error: null,
      },
      // 2) game_players — trukket av spilleren selv (#2358: bare da kan
      // spilleren angre)
      {
        data: {
          user_id: USER_ID,
          withdrawn_at: '2026-06-01T10:00:00.000Z',
          withdrawn_by_user_id: USER_ID,
        },
        error: null,
      },
      // 3) UPDATE game_players (clear withdrawn_at) — #712: .select() returns affected rows
      { data: [{ user_id: USER_ID }], error: null },
    ]);
    const { undoSelfWithdraw } = await import('./withdrawSelf');

    // `kept: true` og ikke bare `{ ok: true }`: feltet er påkrevd i
    // `SelfWithdrawResult`, fordi webbens form-wrapper navigerer på det. Angre
    // sletter ingen rad, så den er alltid sann her.
    const result = await undoSelfWithdraw(GAME_ID, USER_ID);
    expect(result).toEqual({ ok: true, kept: true });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
    const updateCalls = adminMock.__fromCalls.filter(
      (c) => c.method === 'update',
    );
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('spilleren er ikke trukket (withdrawn_at=null) → not_registered', async () => {
    adminMock = buildSupabaseMock([
      // 1) games — active
      {
        data: {
          id: GAME_ID,
          status: 'active',
          game_mode: 'best_ball',
        },
        error: null,
      },
      // 2) game_players — ikke trukket
      { data: { user_id: USER_ID, withdrawn_at: null }, error: null },
    ]);
    const { undoSelfWithdraw } = await import('./withdrawSelf');

    const result = await undoSelfWithdraw(GAME_ID, USER_ID);
    expect(result).toEqual({ ok: false, error: 'not_registered' });
  });

  it('spill er finished → game_locked', async () => {
    adminMock = buildSupabaseMock([
      // 1) games — finished
      {
        data: {
          id: GAME_ID,
          status: 'finished',
          game_mode: 'best_ball',
        },
        error: null,
      },
      // 2) game_players (not needed, gate fires first)
      { data: { user_id: USER_ID, withdrawn_at: '2026-06-01T10:00:00.000Z' }, error: null },
    ]);
    const { undoSelfWithdraw } = await import('./withdrawSelf');

    const result = await undoSelfWithdraw(GAME_ID, USER_ID);
    expect(result).toEqual({ ok: false, error: 'game_locked' });
  });
});

/**
 * #1814: en cup-kamp som ennå ikke har startet trekker man seg fra via
 * `/cup/[id]/trekk`, ikke herfra. Pre-start-grenen SLETTER `game_players`-raden
 * — på en cup-kamp etterlot det en ufullstendig side som auto-start aldri kunne
 * starte, stille. Venterommets lenke ruter til cup-siden; dette er vakta bak den.
 *
 * Gaten er SMAL med vilje: en cup-kamp som alt er i gang har ingen rad å slette,
 * og det myke trekket (#386) er fortsatt riktig vei ut der.
 *
 * #1917: gaten bor i kjernen og ikke i webbens wrapper, nettopp fordi
 * `/api/games/[id]/withdraw-self` ellers ville gått utenom den — og appen kunne
 * slettet en cup-rad før start.
 */
describe('withdrawSelf — cup-kamper er låst før start (#1814)', () => {
  const TOURNAMENT_ID = '66666666-6666-6666-6666-666666666666';

  function cupGame(
    status: 'draft' | 'scheduled' | 'active' | 'finished',
    gameMode = 'singles_matchplay',
  ) {
    return {
      data: {
        id: GAME_ID,
        name: 'Kamp 3',
        short_id: 'abc12345',
        status,
        game_mode: gameMode,
        tournament_id: TOURNAMENT_ID,
        // #2445: the caller's own game, so a draft still reaches the cup gate.
        created_by: USER_ID,
      },
      error: null,
    };
  }

  it.each(['draft', 'scheduled'] as const)(
    '%s cup-kamp → game_locked, ingen sletting og ingen flagging',
    async (status) => {
      adminMock = buildSupabaseMock([
        cupGame(status),
        { data: { user_id: USER_ID, team_number: 1 }, error: null },
      ]);
      const { withdrawSelf } = await import('./withdrawSelf');

      expect(await withdrawSelf(GAME_ID, USER_ID)).toEqual({
        ok: false,
        error: 'game_locked',
      });
      const writes = adminMock.__fromCalls.filter(
        (c) => c.method === 'delete' || c.method === 'update',
      );
      expect(writes).toHaveLength(0);
    },
  );

  it('aktiv cup-kamp i en WD-støttet modus → mykt trekk som før, ikke låst', async () => {
    adminMock = buildSupabaseMock([
      cupGame('active', 'best_ball'),
      { data: { user_id: USER_ID, team_number: 1 }, error: null },
      { data: [{ user_id: USER_ID }], error: null }, // UPDATE withdrawn_at
    ]);
    const { withdrawSelf } = await import('./withdrawSelf');

    expect(await withdrawSelf(GAME_ID, USER_ID)).toEqual({
      ok: true,
      kept: true,
    });
    expect(
      adminMock.__fromCalls.filter((c) => c.method === 'delete'),
    ).toHaveLength(0);
  });

  it.each(['active', 'finished'] as const)(
    '%s cup-kamp uten WD-støtte (matchplay) → game_locked, ingen skriving',
    async (status) => {
      adminMock = buildSupabaseMock([
        cupGame(status),
        { data: { user_id: USER_ID, team_number: 1 }, error: null },
      ]);
      const { withdrawSelf } = await import('./withdrawSelf');

      expect(await withdrawSelf(GAME_ID, USER_ID)).toEqual({
        ok: false,
        error: 'game_locked',
      });
      const writes = adminMock.__fromCalls.filter(
        (c) => c.method === 'delete' || c.method === 'update',
      );
      expect(writes).toHaveLength(0);
    },
  );

  it('rører ikke et frittstående spill (tournament_id null)', async () => {
    adminMock = buildSupabaseMock([
      {
        data: {
          id: GAME_ID,
          name: 'X',
          short_id: 'abc12345',
          status: 'scheduled',
          game_mode: 'stableford',
          tournament_id: null,
        },
        error: null,
      },
      { data: { user_id: USER_ID, team_number: null }, error: null },
      { data: null, error: null }, // egen påmeldingsrad — ingen
      { data: null, error: null }, // DELETE game_players
      { data: null, error: null }, // DELETE registration requests
    ]);
    const { withdrawSelf } = await import('./withdrawSelf');

    expect(await withdrawSelf(GAME_ID, USER_ID)).toEqual({
      ok: true,
      kept: false,
    });
  });
});

/**
 * #2358: kjernen skriver med tjenestenøkkelen, så databasens regler for de
 * samme radene slår ikke inn av seg selv. Casene under er de reglene, speilet:
 *
 *   - vakt (c) i `guard_game_players_self_update` (0108 → 0191): en spiller
 *     rører ikke `withdrawn_at`/`withdrawn_by_user_id` på egen rad. Kjernen
 *     slipper bare gjennom sitt eget trekk og sin egen angring.
 *   - `game_registration_requests` har ingen DELETE-policy, og en spiller kan
 *     bare flytte egen ventende rad til `withdrawn` (0042/0092). Kjernen
 *     sletter derfor aldri en kapteinsrad — kaskaden i 0042 ville tatt laget.
 */
describe('withdrawSelf — mykt trekk skriver ikke over et trekk som finnes (#2358)', () => {
  function activeGame() {
    return {
      data: {
        id: GAME_ID,
        name: 'X',
        short_id: 'abc12345',
        status: 'active',
        game_mode: 'best_ball',
        tournament_id: null,
      },
      error: null,
    };
  }

  it('alt trukket av arrangøren → ok uten skriving, hvem som trakk står', async () => {
    adminMock = buildSupabaseMock([
      activeGame(),
      {
        data: {
          user_id: USER_ID,
          team_number: null,
          withdrawn_at: '2026-06-01T10:00:00.000Z',
        },
        error: null,
      },
    ]);
    const { withdrawSelf } = await import('./withdrawSelf');

    expect(await withdrawSelf(GAME_ID, USER_ID)).toEqual({ ok: true, kept: true });
    expect(
      adminMock.__fromCalls.filter((c) => c.method === 'update' || c.method === 'delete'),
    ).toHaveLength(0);
    expect(notifyOrganizerIfAllDeliveredMock).not.toHaveBeenCalled();
  });

  it('skrivingen krever at raden fortsatt ikke er trukket', async () => {
    adminMock = buildSupabaseMock([
      activeGame(),
      { data: { user_id: USER_ID, team_number: null, withdrawn_at: null }, error: null },
      { data: [{ user_id: USER_ID }], error: null },
    ]);
    const { withdrawSelf } = await import('./withdrawSelf');

    expect(await withdrawSelf(GAME_ID, USER_ID)).toEqual({ ok: true, kept: true });
    expect(adminMock.__fromCalls).toContainEqual({
      table: 'game_players',
      method: 'is',
      args: ['withdrawn_at', null],
    });
  });
});

describe('undoSelfWithdraw — bare eget trekk kan angres (#2358)', () => {
  function activeGame() {
    return {
      data: { id: GAME_ID, status: 'active', game_mode: 'best_ball' },
      error: null,
    };
  }

  it.each([
    ['arrangøren', CAPTAIN_ID],
    ['ukjent (null)', null],
  ])('trukket av %s → withdrawn_by_other, ingen UPDATE', async (_who, by) => {
    adminMock = buildSupabaseMock([
      activeGame(),
      {
        data: {
          user_id: USER_ID,
          withdrawn_at: '2026-06-01T10:00:00.000Z',
          withdrawn_by_user_id: by,
        },
        error: null,
      },
    ]);
    const { undoSelfWithdraw } = await import('./withdrawSelf');

    expect(await undoSelfWithdraw(GAME_ID, USER_ID)).toEqual({
      ok: false,
      error: 'withdrawn_by_other',
    });
    expect(adminMock.__fromCalls.filter((c) => c.method === 'update')).toHaveLength(0);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('egen angring filtrerer skrivingen på kalleren som den som trakk', async () => {
    adminMock = buildSupabaseMock([
      activeGame(),
      {
        data: {
          user_id: USER_ID,
          withdrawn_at: '2026-06-01T10:00:00.000Z',
          withdrawn_by_user_id: USER_ID,
        },
        error: null,
      },
      { data: [{ user_id: USER_ID }], error: null },
    ]);
    const { undoSelfWithdraw } = await import('./withdrawSelf');

    expect(await undoSelfWithdraw(GAME_ID, USER_ID)).toEqual({ ok: true, kept: true });
    // Et samtidig trekk fra arrangøren mellom lesing og skriving treffer 0
    // rader i stedet for å bli nullet.
    expect(adminMock.__fromCalls).toContainEqual({
      table: 'game_players',
      method: 'eq',
      args: ['withdrawn_by_user_id', USER_ID],
    });
  });
});

describe('withdrawSelf — kapteinen og laget før start (#2358)', () => {
  const scheduledGame = {
    data: {
      id: GAME_ID,
      name: 'Sommercup',
      short_id: 'abc12345',
      status: 'scheduled',
      game_mode: 'texas_scramble',
      tournament_id: null,
    },
    error: null,
  };
  const captainReq = {
    data: {
      id: MY_REQ_ID,
      status: 'approved',
      team_name: 'Bjørka',
      team_request_id: null,
      is_team_captain: true,
    },
    error: null,
  };
  const onRoster = { data: { user_id: USER_ID, team_number: 1 }, error: null };
  const ok = { data: null, error: null };

  function writes(table: string) {
    return adminMock.__fromCalls.filter(
      (c) => c.table === table && (c.method === 'update' || c.method === 'delete' || c.method === 'insert'),
    );
  }

  it.each([
    [
      'bekreftet på spillerlista',
      { id: CHILD_REQ_ID, user_id: TEAMMATE_ID, status: 'approved', decided_by_user_id: USER_ID },
      [{ user_id: TEAMMATE_ID, accepted_at: '2026-09-29T10:00:00.000Z' }],
    ],
    [
      'sa ja selv før arrangøren godkjente',
      { id: CHILD_REQ_ID, user_id: TEAMMATE_ID, status: 'approved', decided_by_user_id: TEAMMATE_ID },
      [],
    ],
  ])('lagkamerat som har takket ja (%s) → captain_has_team, ingen skriving', async (_label, child, roster) => {
    adminMock = buildSupabaseMock([], {}, {
      byTable: {
        games: [scheduledGame],
        game_players: [onRoster, { data: roster, error: null }],
        game_registration_requests: [captainReq, { data: [child], error: null }],
      },
    });
    const { withdrawSelf } = await import('./withdrawSelf');

    expect(await withdrawSelf(GAME_ID, USER_ID)).toEqual({
      ok: false,
      error: 'captain_has_team',
    });
    expect(writes('game_players')).toHaveLength(0);
    expect(writes('game_registration_requests')).toHaveLength(0);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('bare ubesvarte → kapteinen og invitasjonene trekkes, ubekreftede plasser fjernes, ingen sletting av påmeldinger', async () => {
    adminMock = buildSupabaseMock([], {}, {
      byTable: {
        games: [scheduledGame],
        game_players: [
          onRoster,
          // lagkameratenes plasser: én ubekreftet (åpen påmelding), én uten rad
          { data: [{ user_id: TEAMMATE_ID, accepted_at: null }], error: null },
          ok, // DELETE ubekreftede plasser
          ok, // DELETE egen rad
        ],
        game_registration_requests: [
          captainReq,
          {
            data: [
              { id: CHILD_REQ_ID, user_id: TEAMMATE_ID, status: 'approved', decided_by_user_id: USER_ID },
              { id: OTHER_CHILD_REQ_ID, user_id: SECOND_MATE_ID, status: 'pending', decided_by_user_id: null },
            ],
            error: null,
          },
          { data: [{ id: MY_REQ_ID }], error: null }, // egen rad → withdrawn
          { data: [{ id: CHILD_REQ_ID }, { id: OTHER_CHILD_REQ_ID }], error: null }, // invitasjonene → withdrawn
        ],
      },
    });
    const { withdrawSelf } = await import('./withdrawSelf');

    expect(await withdrawSelf(GAME_ID, USER_ID)).toEqual({ ok: true, kept: false });

    const requestWrites = writes('game_registration_requests');
    expect(requestWrites.map((c) => c.method)).toEqual(['update', 'update']);
    for (const w of requestWrites) {
      expect(w.args[0]).toEqual(expect.objectContaining({ status: 'withdrawn' }));
    }

    // Bare plasser som fortsatt er ubekreftet, fjernes.
    expect(adminMock.__fromCalls).toContainEqual({
      table: 'game_players',
      method: 'is',
      args: ['accepted_at', null],
    });
    expect(adminMock.__fromCalls).toContainEqual({
      table: 'game_players',
      method: 'in',
      args: ['user_id', [TEAMMATE_ID, SECOND_MATE_ID]],
    });

    // Begge får beskjed med det eksisterende varselet (eierens valg A).
    for (const recipient of [TEAMMATE_ID, SECOND_MATE_ID]) {
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: recipient,
          kind: 'registration_rejected',
          payload: expect.objectContaining({
            game_id: GAME_ID,
            reason_code: 'team_removed',
          }),
        }),
      );
    }
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('kaptein alene → egen påmelding merkes trukket FØR spillerraden slettes, ingen DELETE av påmeldingen', async () => {
    adminMock = buildSupabaseMock([], {}, {
      byTable: {
        games: [scheduledGame],
        game_players: [onRoster, ok],
        game_registration_requests: [
          captainReq,
          { data: [], error: null },
          { data: [{ id: MY_REQ_ID }], error: null },
        ],
      },
    });
    const { withdrawSelf } = await import('./withdrawSelf');

    expect(await withdrawSelf(GAME_ID, USER_ID)).toEqual({ ok: true, kept: false });

    const requestWrites = writes('game_registration_requests');
    expect(requestWrites).toHaveLength(1);
    expect(requestWrites[0]!.method).toBe('update');
    expect(requestWrites[0]!.args[0]).toEqual(expect.objectContaining({ status: 'withdrawn' }));

    const calls = adminMock.__fromCalls;
    const markIdx = calls.findIndex((c) => c.table === 'game_registration_requests' && c.method === 'update');
    const deleteIdx = calls.findIndex((c) => c.table === 'game_players' && c.method === 'delete');
    expect(markIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeGreaterThan(markIdx);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('markeringen treffer 0 rader → db_error, og ingenting er slettet', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([], {}, {
      byTable: {
        games: [scheduledGame],
        game_players: [onRoster],
        game_registration_requests: [captainReq, { data: [], error: null }, { data: [], error: null }],
      },
    });
    const { withdrawSelf } = await import('./withdrawSelf');

    expect(await withdrawSelf(GAME_ID, USER_ID)).toEqual({ ok: false, error: 'db_error' });
    expect(writes('game_players')).toHaveLength(0);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('avvist kaptein som arrangøren la til for hånd → trekker seg, påmeldingen står som avvist', async () => {
    // Evaluator runde 1, funn 2: arrangøren avviste laget og la så kapteinen
    // til fra spillerlista. Markeringen gjelder bare ventende og godkjente
    // påmeldinger; en avvist rad skal ikke stoppe trekket med db_error.
    adminMock = buildSupabaseMock([], {}, {
      byTable: {
        games: [scheduledGame],
        game_players: [onRoster, ok],
        game_registration_requests: [
          { data: { ...captainReq.data, status: 'rejected' }, error: null },
          { data: [], error: null },
        ],
      },
    });
    const { withdrawSelf } = await import('./withdrawSelf');

    expect(await withdrawSelf(GAME_ID, USER_ID)).toEqual({ ok: true, kept: false });
    expect(writes('game_registration_requests')).toHaveLength(0);
    expect(writes('game_players').map((c) => c.method)).toEqual(['delete']);
  });

  it('feil etter at noe er skrevet → db_error, og cachen tømmes likevel', async () => {
    // Evaluator runde 1, funn 3: de ubekreftede plassene er alt fjernet når
    // markeringen av invitasjonene feiler. Spillerlista i cachen skal ikke
    // vise dem i et kvarter til.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([], {}, {
      byTable: {
        games: [scheduledGame],
        game_players: [
          onRoster,
          { data: [{ user_id: TEAMMATE_ID, accepted_at: null }], error: null },
          ok, // DELETE ubekreftede plasser — går gjennom
        ],
        game_registration_requests: [
          captainReq,
          {
            data: [{ id: CHILD_REQ_ID, user_id: TEAMMATE_ID, status: 'approved', decided_by_user_id: USER_ID }],
            error: null,
          },
          { data: [{ id: MY_REQ_ID }], error: null }, // egen rad → withdrawn
          { data: null, error: { code: '08006', message: 'reset' } }, // invitasjonene feiler
        ],
      },
    });
    const { withdrawSelf } = await import('./withdrawSelf');

    expect(await withdrawSelf(GAME_ID, USER_ID)).toEqual({ ok: false, error: 'db_error' });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('feil når påmeldingen leses → db_error, ikke «ingen påmelding»', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([], {}, {
      byTable: {
        games: [scheduledGame],
        game_players: [onRoster],
        game_registration_requests: [{ data: null, error: { code: '08006', message: 'reset' } }],
      },
    });
    const { withdrawSelf } = await import('./withdrawSelf');

    expect(await withdrawSelf(GAME_ID, USER_ID)).toEqual({ ok: false, error: 'db_error' });
    expect(writes('game_players')).toHaveLength(0);
  });

  it.each([
    ['vanlig lagmedlem', CAPTAIN_REQ_ID],
    ['gammel kaptein etter overføring', CHILD_REQ_ID],
  ])('%s → bare egen rad slettes, filtrert på is_team_captain = false', async (_label, parentReq) => {
    adminMock = buildSupabaseMock([], {}, {
      byTable: {
        games: [scheduledGame],
        game_players: [
          onRoster,
          { data: [{ user_id: TEAMMATE_ID }], error: null }, // makker på samme lag
          ok, // DELETE egen rad
        ],
        game_registration_requests: [
          {
            data: {
              id: MY_REQ_ID,
              status: 'approved',
              team_name: 'Bjørka',
              team_request_id: parentReq,
              is_team_captain: false,
            },
            error: null,
          },
          { data: { user_id: CAPTAIN_ID }, error: null }, // kapteinen i dag
          ok, // DELETE egen påmelding
        ],
        users: [{ data: { name: 'Per Spiller', nickname: null, email: 'per@example.test' }, error: null }],
      },
    });
    const { withdrawSelf } = await import('./withdrawSelf');

    expect(await withdrawSelf(GAME_ID, USER_ID)).toEqual({ ok: true, kept: false });

    const requestWrites = writes('game_registration_requests');
    expect(requestWrites.map((c) => c.method)).toEqual(['delete']);
    expect(adminMock.__fromCalls).toContainEqual({
      table: 'game_registration_requests',
      method: 'eq',
      args: ['is_team_captain', false],
    });
    // Ingen andre påmeldinger røres: kaskaden i 0042 kan ikke nå laget.
    expect(
      adminMock.__fromCalls.filter(
        (c) => c.table === 'game_registration_requests' && c.method === 'eq' && c.args[0] === 'team_request_id',
      ),
    ).toHaveLength(0);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: CAPTAIN_ID, kind: 'team_member_withdrew' }),
    );
  });
});
