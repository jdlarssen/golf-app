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

let adminMock: ReturnType<typeof buildSupabaseMock>;

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';
const GAME_ID = '22222222-2222-2222-2222-222222222222';
const CAPTAIN_ID = '33333333-3333-3333-3333-333333333333';
const TEAMMATE_ID = '44444444-4444-4444-4444-444444444444';
const CAPTAIN_REQ_ID = '55555555-5555-5555-5555-555555555555';

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
        },
        error: null,
      },
      // 2) game_players — solo (team_number=null)
      { data: { user_id: USER_ID, team_number: null }, error: null },
      // 3) DELETE game_players
      { data: null, error: null },
      // 4) DELETE game_registration_requests
      { data: null, error: null },
    ]);
    const { withdrawSelf } = await import('./withdrawSelf');

    const result = await withdrawSelf(GAME_ID, USER_ID);

    expect(result).toEqual({ ok: true, kept: false });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
    expect(notifyMock).not.toHaveBeenCalled();
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
      // 3) mates lookup (samme team_number) → finnes en til
      { data: [{ user_id: TEAMMATE_ID }], error: null },
      // 4) min request-rad (team_name + team_request_id)
      {
        data: {
          team_name: 'Bjørka',
          team_request_id: CAPTAIN_REQ_ID,
          is_team_captain: false,
        },
        error: null,
      },
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
      // 3) DELETE feiler
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
      // 2) game_players — trukket
      {
        data: { user_id: USER_ID, withdrawn_at: '2026-06-01T10:00:00.000Z' },
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
