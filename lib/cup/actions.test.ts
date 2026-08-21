import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * #1397: createTournamentDraft signalled every error via `redirect('?error=…')`,
 * which unmounted the still-filled CupSetup form and wiped the organizer's input
 * (the #1379 figure, kept out of that PR for scope). The fix returns validation
 * and insert failures as an action result (`{ error: code }`) consumed by
 * useActionState — the form stays mounted. Only the success redirect (and the
 * auth-gate redirects) still throw NEXT_REDIRECT.
 *
 * This suite locks the regression contract — "return instead of redirect on
 * failure" — not the validation rules themselves (each code's condition is
 * exercised elsewhere): a representative slice of validation codes, the insert
 * failure, and that success still redirects.
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/i18n/revalidateLocalePath', () => ({
  revalidatePath: vi.fn(),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

// `createTournamentDraft` on a frittstående cup never reaches the admin client
// (getRoleContext reads the users row on the request-scoped client). The swap
// suite below does — every read and write it makes is service-role, gated by
// requireAdminOrClubAdminOfCup at the call-site.
let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

// Boundary mock: the real helper opens its own admin client and would eat
// queue entries. Its own behaviour is covered where it lives.
const notifyInvitedMock = vi.fn(async () => {});
vi.mock('@/lib/notifications/notifyInvitedToGame', () => ({
  notifyInvitedToGame: (...args: unknown[]) => notifyInvitedMock(...(args as [])),
}));

function setUser(id: string) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id, email: `${id}@x.no` } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

/** Valid standalone cup form; per-case overrides break one field. */
function cupForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set('name', 'Ryder Cup');
  fd.set('team_1_name', 'Europa');
  fd.set('team_2_name', 'USA');
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

describe('createTournamentDraft — validation returns { error }, no insert (#1397)', () => {
  const cases: Array<[string, Record<string, string>]> = [
    ['cup_name', { name: '' }],
    ['cup_team_dup', { team_1_name: 'Lag', team_2_name: 'lag' }],
    ['cup_win_points', { win_points: '0' }],
  ];

  it.each(cases)(
    'returns { error: %s } and issues no tournaments insert',
    async (code, overrides) => {
      supabaseMock = buildSupabaseMock([]);
      setUser('creator-1');

      const { createTournamentDraft } = await import('./actions');
      expect(await createTournamentDraft(cupForm(overrides))).toEqual({
        error: code,
      });

      // Validation runs before getServerClient, so the DB is never touched.
      const ins = supabaseMock.__fromCalls.find(
        (c) => c.table === 'tournaments' && c.method === 'insert',
      );
      expect(ins, 'no tournaments insert on validation failure').toBeUndefined();
      // A failure must never redirect (that is the whole regression).
      expect(redirectMock).not.toHaveBeenCalled();
    },
  );
});

describe('createTournamentDraft — insert failure returns { error } (#1397)', () => {
  it('returns { error: cup_insert_failed } when the tournaments insert fails', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // getRoleContext → users.single
      { data: null, error: { message: 'boom' } }, // tournaments.insert().select('id').single
    ]);
    setUser('creator-1');

    const { createTournamentDraft } = await import('./actions');
    expect(await createTournamentDraft(cupForm())).toEqual({
      error: 'cup_insert_failed',
    });

    const ins = supabaseMock.__fromCalls.find(
      (c) => c.table === 'tournaments' && c.method === 'insert',
    );
    expect(ins, 'tournaments insert was issued').toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe('createTournamentDraft — success still redirects (#1397)', () => {
  it('throws NEXT_REDIRECT to the new cup on a successful insert', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // getRoleContext → users.single
      { data: { id: 'T1' }, error: null }, // tournaments.insert().select('id').single
    ]);
    setUser('creator-1');

    const { createTournamentDraft } = await import('./actions');
    const err = await createTournamentDraft(cupForm()).catch((e) => e);
    expect(err, 'success path redirects (throws), never returns').toBeInstanceOf(
      RedirectError,
    );
    expect((err as RedirectError).url).toBe('/admin/cup/T1?status=created');
  });
});

/**
 * swapCupMatchPlayer (#1473) — bytt spiller i en generert, ikke-startet match.
 *
 * Guard-tabellen (hvilke bytter som er lov, og hvilke matcher i bunten som
 * skal skrives) er ren logikk og dekkes uttømmende av
 * `matchSwapValidation.test.ts`. Denne suiten dekker det som BARE finnes i
 * action-en: at riktig rader leses og skrives, at inn-raden får eksplisitte
 * kolonner (ikke arvet søl), at klubb-medlemskap mates inn i guarden, at et
 * halvskrevet bytte kompenseres, og at cron-sveipet ikke kan etterlate en
 * spiller uten spillehandicap i en aktiv match.
 *
 * Admin-caller DB-sekvens (gaten kortslutter på is_admin):
 *   1. adminMock: tournaments.select('group_id') — gaten
 *   2. supabaseMock: users.select(...) — loadRole
 *   3. supabaseMock: tournaments.select('group_id') — cupRedirectBase
 *   4. onwards: action-ens egne adminMock-lesninger/skrivinger
 */

const gateGroupIdNull = { data: { group_id: null }, error: null };
const cupAdminUser = {
  data: { is_admin: true, email: 'a@x.no', name: 'Admin' },
  error: null,
};

/** Splittet cup-dag: greensome-host + avledet singel. Begge scheduled. */
const SPLIT_GAMES = [
  { id: 'g-host', status: 'scheduled', source_game_id: null },
  { id: 'g-derived', status: 'scheduled', source_game_id: 'g-host' },
];
const SPLIT_PLAYERS = [
  { game_id: 'g-host', user_id: 'out' },
  { game_id: 'g-host', user_id: 'mate' },
  { game_id: 'g-host', user_id: 'opp1' },
  { game_id: 'g-host', user_id: 'opp2' },
  { game_id: 'g-derived', user_id: 'out' },
  { game_id: 'g-derived', user_id: 'opp1' },
];
const PARTICIPANTS = [
  { user_id: 'out' },
  { user_id: 'mate' },
  { user_id: 'opp1' },
  { user_id: 'opp2' },
  { user_id: 'reserve' },
];

/**
 * Ut-spillerens rader slik de ligger i DB — med felter som ALDRI skal arves av
 * inn-spilleren (frosset handicap, betaling, levering, trekking).
 */
function outRow(gameId: string) {
  return {
    game_id: gameId,
    user_id: 'out',
    team_number: 1,
    flight_number: 1,
    tee_gender: 'mens',
    accepted_at: '2026-08-01T10:00:00.000Z',
    course_handicap: 14,
    paid_at: '2026-08-01T10:00:00.000Z',
    submitted_at: null,
    approved_at: null,
    withdrawn_at: null,
    result_summary: null,
    score_differential: null,
    signup_source: 'admin',
  };
}

function swapForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set('tournament_id', 'cup-1');
  fd.set('game_id', 'g-derived');
  fd.set('out_user_id', 'out');
  fd.set('in_user_id', 'reserve');
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

/** Lesningene fram til (og med) inn-spillerens profil, for en personlig cup. */
function readsUpToProfile(overrides: { games?: unknown[] } = {}) {
  return [
    gateGroupIdNull, // 1. gaten
    { data: { id: 'g-derived', tournament_id: 'cup-1', source_game_id: 'g-host' }, error: null },
    { data: overrides.games ?? SPLIT_GAMES, error: null },
    { data: PARTICIPANTS, error: null },
    { data: SPLIT_PLAYERS, error: null },
    { data: { gender: 'ladies' }, error: null },
  ];
}

function gamePlayerCalls(method: string) {
  return adminMock.__fromCalls.filter(
    (c) => c.table === 'game_players' && c.method === method,
  );
}

describe('swapCupMatchPlayer — happy path (#1473)', () => {
  it('bytter spilleren i HELE bunten, med eksplisitte kolonner på inn-raden', async () => {
    adminMock = buildSupabaseMock([
      ...readsUpToProfile(),
      { data: [outRow('g-host')], error: null }, // delete host
      { data: null, error: null }, // insert host
      { data: [outRow('g-derived')], error: null }, // delete derived
      { data: null, error: null }, // insert derived
      { data: [{ id: 'g-host', status: 'scheduled' }, { id: 'g-derived', status: 'scheduled' }], error: null },
    ]);
    supabaseMock = buildSupabaseMock([cupAdminUser, gateGroupIdNull]);
    setUser('admin-1');

    const { swapCupMatchPlayer } = await import('./actions');
    const err = await swapCupMatchPlayer(swapForm()).catch((e) => e);

    expect(err, 'success redirects (throws)').toBeInstanceOf(RedirectError);
    expect((err as RedirectError).url).toBe('/admin/cup/cup-1?status=player_swapped');

    // Begge matchene i bunten er skrevet — arrangøren trykket på den avledede.
    const inserts = gamePlayerCalls('insert');
    expect(inserts).toHaveLength(2);
    const payloads = inserts.map((c) => c.args[0] as Record<string, unknown>);
    expect(payloads.map((p) => p.game_id)).toEqual(['g-host', 'g-derived']);

    for (const payload of payloads) {
      // Eksplisitt kolonneliste: ingenting fra ut-spilleren siver inn.
      expect(Object.keys(payload).sort()).toEqual([
        'accepted_at',
        'course_handicap',
        'flight_number',
        'game_id',
        'team_number',
        'tee_gender',
        'user_id',
      ]);
      expect(payload.user_id).toBe('reserve');
      expect(payload.team_number).toBe(1);
      expect(payload.flight_number).toBe(1);
      // Inn-spillerens EGEN tee — ikke ut-spillerens 'mens'.
      expect(payload.tee_gender).toBe('ladies');
      expect(payload.course_handicap).toBeNull();
      expect(typeof payload.accepted_at).toBe('string');
    }

    // #1628: greensome-lagslag regnes ut på nytt ved start — byttet skal ikke
    // røre mode_config (eller games i det hele tatt).
    expect(
      adminMock.__fromCalls.some(
        (c) => c.table === 'games' && (c.method === 'update' || c.method === 'upsert'),
      ),
    ).toBe(false);

    // Hver skrevet match får cachen sin revalidert, ellers viser hull-siden
    // den gamle spilleren i opptil 15 minutter.
    const { revalidateTag } = await import('next/cache');
    const tags = (revalidateTag as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(tags).toEqual(
      expect.arrayContaining(['tournament-cup-1', 'game-g-host', 'game-g-derived']),
    );

    // Ett invite-varsel til den som kom inn, på host-matchen.
    expect(notifyInvitedMock).toHaveBeenCalledTimes(1);
    expect(notifyInvitedMock).toHaveBeenCalledWith({
      recipientUserId: 'reserve',
      gameId: 'g-host',
      inviterUserId: 'admin-1',
    });
  });
});

describe('swapCupMatchPlayer — guards som bor i action-en (#1473)', () => {
  it('matchen tilhører en annen cup: not_found, ingen skriving', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      { data: { id: 'g-x', tournament_id: 'annen-cup', source_game_id: null }, error: null },
    ]);
    supabaseMock = buildSupabaseMock([cupAdminUser, gateGroupIdNull]);
    setUser('admin-1');

    const { swapCupMatchPlayer } = await import('./actions');
    expect(await swapCupMatchPlayer(swapForm({ game_id: 'g-x' }))).toEqual({
      error: 'not_found',
    });
    expect(gamePlayerCalls('delete')).toHaveLength(0);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('klubb-cup: medlemskapet er trukket etter påmelding → not_member, ingen skriving', async () => {
    adminMock = buildSupabaseMock([
      { data: { group_id: 'club-1' }, error: null }, // gaten
      { data: { id: 'g-derived', tournament_id: 'cup-1', source_game_id: 'g-host' }, error: null },
      { data: SPLIT_GAMES, error: null },
      { data: PARTICIPANTS, error: null },
      { data: [{ user_id: 'out' }, { user_id: 'mate' }], error: null }, // group_members: reserve er ute
      { data: SPLIT_PLAYERS, error: null },
    ]);
    supabaseMock = buildSupabaseMock([
      cupAdminUser,
      { data: { group_id: 'club-1' }, error: null }, // cupRedirectBase
    ]);
    setUser('admin-1');

    const { swapCupMatchPlayer } = await import('./actions');
    expect(await swapCupMatchPlayer(swapForm())).toEqual({ error: 'not_member' });
    expect(gamePlayerCalls('delete')).toHaveLength(0);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe('swapCupMatchPlayer — atomic-or-compensated (#1473)', () => {
  it('inn-inserten feiler midt i bunten: ut-radene re-inserters ordrett, inn-radene ryddes', async () => {
    adminMock = buildSupabaseMock([
      ...readsUpToProfile(),
      { data: [outRow('g-host')], error: null }, // delete host
      { data: null, error: null }, // insert host — ok
      { data: [outRow('g-derived')], error: null }, // delete derived
      { data: null, error: { message: 'boom' } }, // insert derived — feiler
      { data: null, error: null }, // kompensering: slett inn-radene
      { data: null, error: null }, // kompensering: re-insert ut-radene
    ]);
    supabaseMock = buildSupabaseMock([cupAdminUser, gateGroupIdNull]);
    setUser('admin-1');

    const { swapCupMatchPlayer } = await import('./actions');
    expect(await swapCupMatchPlayer(swapForm())).toEqual({ error: 'swap_failed' });
    expect(redirectMock).not.toHaveBeenCalled();

    // Siste insert er kompenseringen: begge ut-radene, ordrett som de lå.
    const inserts = gamePlayerCalls('insert');
    expect(inserts.at(-1)!.args[0]).toEqual([outRow('g-host'), outRow('g-derived')]);
    // Inn-raden som RAKK å bli skrevet ryddes bort igjen.
    const deletes = gamePlayerCalls('delete');
    expect(deletes).toHaveLength(3);
    // Siste `.in()` på game_players er kompenserings-slettingen (den første er
    // buntens roster-lesing).
    const compensationFilter = gamePlayerCalls('in').at(-1);
    expect(compensationFilter!.args).toEqual(['game_id', ['g-host']]);
  });

  it('cron-sveipet startet bunten under skrivingen: rulles tilbake, already_started', async () => {
    adminMock = buildSupabaseMock([
      ...readsUpToProfile(),
      { data: [outRow('g-host')], error: null },
      { data: null, error: null },
      { data: [outRow('g-derived')], error: null },
      { data: null, error: null },
      // Re-lesing: hosten er startet mens vi skrev.
      { data: [{ id: 'g-host', status: 'active' }, { id: 'g-derived', status: 'scheduled' }], error: null },
      { data: null, error: null }, // kompensering: slett inn-radene
      { data: null, error: null }, // kompensering: re-insert ut-radene
    ]);
    supabaseMock = buildSupabaseMock([cupAdminUser, gateGroupIdNull]);
    setUser('admin-1');

    const { swapCupMatchPlayer } = await import('./actions');
    expect(await swapCupMatchPlayer(swapForm())).toEqual({ error: 'already_started' });
    expect(redirectMock).not.toHaveBeenCalled();

    const inserts = gamePlayerCalls('insert');
    expect(inserts.at(-1)!.args[0]).toEqual([outRow('g-host'), outRow('g-derived')]);
    // Ingen varsel når byttet ikke ble stående.
    expect(notifyInvitedMock).not.toHaveBeenCalled();
  });
});
