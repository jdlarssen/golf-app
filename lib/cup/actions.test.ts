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

// Boundary mock (same reason, and the same seam planActions.test.ts uses): the
// swap's eligibility source. Which players it returns per role is its own
// suite's business; here it only has to be the list the guard is fed.
const candidateMock = vi.fn();
vi.mock('./getCupCandidatePlayers', () => ({
  getCupCandidatePlayers: (...args: unknown[]) => candidateMock(...args),
}));

function setUser(id: string) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id, email: `${id}@x.no` } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  candidateMock.mockResolvedValue(CANDIDATES);
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
 * kolonner (ikke arvet søl), at kandidatlista og klubb-medlemskapet mates inn
 * i guarden med kallerens rolle, at profil-statusen leses fra users-raden, at
 * et halvskrevet bytte kompenseres, og at cron-sveipet ikke kan etterlate en
 * spiller uten spillehandicap i en aktiv match.
 *
 * Admin-caller DB-sekvens (gaten kortslutter på is_admin):
 *   1. adminMock: tournaments.select('group_id') — gaten (#1749: eneste
 *      group_id-lesing; cupRedirectBase gjenbruker gatens verdi)
 *   2. supabaseMock: users.select(...) — loadRole
 *   3. onwards: action-ens egne adminMock-lesninger/skrivinger
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
/**
 * Kandidatlista (#1473, valg 1B): reserven hentes fra venner/klubbmedlemmer,
 * ikke fra deltakerlista — «reserve» er derfor med her uten å være påmeldt.
 */
const CANDIDATES = [
  { id: 'out', displayName: 'Ut', hcpIndex: 12 },
  { id: 'mate', displayName: 'Makker', hcpIndex: 8 },
  { id: 'reserve', displayName: 'Reserve', hcpIndex: 20 },
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

/** Lesningene fram til (og med) buntens roster, for en personlig cup. */
function readsUpToRoster(overrides: { games?: unknown[]; profile?: unknown } = {}) {
  return [
    gateGroupIdNull, // 1. gaten (#1749: cupRedirectBase gjenbruker verdien)
    { data: { id: 'g-derived', tournament_id: 'cup-1', source_game_id: 'g-host' }, error: null },
    { data: overrides.games ?? SPLIT_GAMES, error: null },
    // users: inn-spillerens tee-kjønn + profil-status i én runde-tur.
    {
      data: overrides.profile ?? {
        gender: 'ladies',
        profile_completed_at: '2026-07-01T09:00:00.000Z',
      },
      error: null,
    },
    { data: SPLIT_PLAYERS, error: null },
  ];
}

function gamePlayerCalls(method: string) {
  return adminMock.__fromCalls.filter(
    (c) => c.table === 'game_players' && c.method === method,
  );
}

function participantCalls(method: string) {
  return adminMock.__fromCalls.filter(
    (c) => c.table === 'tournament_participants' && c.method === method,
  );
}

/**
 * Cupens roster slik det ser ut ETTER et gjennomført bytte (#1735) — 'out' er
 * borte, 'reserve' står i begge buntens matcher.
 */
const ROSTER_AFTER_SWAP = [
  { user_id: 'reserve' },
  { user_id: 'mate' },
  { user_id: 'opp1' },
  { user_id: 'opp2' },
  { user_id: 'reserve' },
  { user_id: 'opp1' },
];

/** Skrivingene i bunten + TOCTOU-re-lesingen, alle vellykkede. */
function successfulBundleWrites() {
  return [
    { data: [outRow('g-host')], error: null }, // delete host
    { data: null, error: null }, // insert host
    { data: [outRow('g-derived')], error: null }, // delete derived
    { data: null, error: null }, // insert derived
    {
      data: [
        { id: 'g-host', status: 'scheduled' },
        { id: 'g-derived', status: 'scheduled' },
      ],
      error: null,
    }, // re-lesing: bunten står fortsatt urørt
  ];
}

describe('swapCupMatchPlayer — happy path (#1473)', () => {
  it('bytter spilleren i HELE bunten, med eksplisitte kolonner på inn-raden', async () => {
    adminMock = buildSupabaseMock([
      ...readsUpToRoster(),
      ...successfulBundleWrites(),
      // #1735: deltaker-synkingen etter byttet. Seedet eksplisitt — fallbacken
      // ({data:null}) ville lest som «0 gjenværende matcher» og gitt en delete
      // testen ikke handler om.
      { data: ROSTER_AFTER_SWAP, error: null }, // cupens roster etter byttet
      { data: null, error: null }, // participants upsert
      { data: null, error: null }, // participants delete
    ]);
    supabaseMock = buildSupabaseMock([cupAdminUser]);
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

    // #1473 (1B): 'reserve' er IKKE påmeldt cupen — byttet går fordi hun står i
    // kandidatlista, og den slås opp med KALLERENS rolle (kandidatsettet er
    // rollestyrt: venner / klubbmedlemmer / alle for global admin).
    expect(candidateMock).toHaveBeenCalledTimes(1);
    expect(candidateMock.mock.calls[0][1]).toMatchObject({
      groupId: null,
      userId: 'admin-1',
      isAdmin: true,
    });
    // Deltakerlista er ikke en KILDE i denne flyten: alt fram til første
    // skriving (gate, plan, guard) rører den ikke — kandidatlista er eneste
    // kilde. Etter skrivingen synkroniseres den (#1735), dekket under.
    const firstWrite = adminMock.__fromCalls.findIndex(
      (c) => c.table === 'game_players' && c.method === 'delete',
    );
    expect(firstWrite, 'byttet skrev faktisk').toBeGreaterThan(-1);
    expect(
      adminMock.__fromCalls
        .slice(0, firstWrite)
        .some((c) => c.table === 'tournament_participants'),
    ).toBe(false);
  });
});

/**
 * #1718: `cupRedirectBase` leste `group_id` med request-klienten, og
 * `swapCupMatchPlayer` mater den verdien inn som klubb-medlemskaps-guarden i
 * `planCupMatchSwap`. Ble cupen usynlig for kalleren under RLS, leste den som
 * `null` — og guarden slo seg stille AV (feilet ÅPENT) i stedet for å avvise.
 * Lesingen går nå via admin-klienten, som gaten alltid har gjort.
 */
describe('swapCupMatchPlayer — klubb-tilhørigheten leses med admin-klienten (#1718)', () => {
  it('klubb-cup: group_id kommer fra admin-klienten, request-klienten rører aldri tournaments', async () => {
    adminMock = buildSupabaseMock([
      { data: { group_id: 'club-1' }, error: null }, // gaten (#1749: eneste)
      { data: { id: 'g-derived', tournament_id: 'cup-1', source_game_id: 'g-host' }, error: null },
      { data: SPLIT_GAMES, error: null },
      {
        data: [
          { user_id: 'out' },
          { user_id: 'mate' },
          { user_id: 'reserve' },
          { user_id: 'opp1' },
          { user_id: 'opp2' },
        ],
        error: null,
      }, // group_members: reserven er medlem
      { data: { gender: 'ladies', profile_completed_at: '2026-07-01T09:00:00.000Z' }, error: null },
      { data: SPLIT_PLAYERS, error: null },
      ...successfulBundleWrites(),
      { data: ROSTER_AFTER_SWAP, error: null },
      { data: null, error: null }, // participants upsert
      { data: null, error: null }, // participants delete
    ]);
    supabaseMock = buildSupabaseMock([cupAdminUser]);
    setUser('admin-1');

    const { swapCupMatchPlayer } = await import('./actions');
    const err = await swapCupMatchPlayer(swapForm()).catch((e) => e);

    // Klubb-cupen holder seg i klubb-chrome — redirect-målet beviser at
    // groupId ble lest, og medlemskaps-guarden fikk samme verdi.
    expect(err, 'byttet gikk gjennom').toBeInstanceOf(RedirectError);
    expect((err as RedirectError).url).toBe(
      '/klubber/club-1/cup/cup-1?status=player_swapped',
    );
    expect(candidateMock.mock.calls[0][1]).toMatchObject({ groupId: 'club-1' });

    // Tournaments-oppslaget (gaten — cupRedirectBase gjenbruker verdien,
    // #1749) er admin-klientens, og det finnes bare ETT.
    expect(
      adminMock.__fromCalls.filter(
        (c) => c.table === 'tournaments' && c.method === 'maybeSingle',
      ),
    ).toHaveLength(1);
    expect(
      supabaseMock.__fromCalls.filter((c) => c.table === 'tournaments'),
      'request-klienten leser ikke cup-raden lenger',
    ).toHaveLength(0);
  });
});

/**
 * #1735: byttet skrev kun `game_players`, mens Spillere-rommet og
 * generer-veiviseren leser `tournament_participants`. Uten synkingen står
 * frafallet igjen på deltakerlista og reserven mangler i neste
 * genererings-runde. Beslutningstabellen (hvem meldes på / fjernes gitt
 * rosteret) er ren logikk og dekkes av `participantRosterSync.test.ts`; her
 * dekkes I/O-en: at riktig rader skrives, og at en feil ikke velter byttet.
 */
describe('swapCupMatchPlayer — deltakerlista følger matchene (#1735)', () => {
  it('ut-spilleren står i 0 gjenværende matcher: reserven meldes på, frafallet fjernes', async () => {
    adminMock = buildSupabaseMock([
      ...readsUpToRoster(),
      ...successfulBundleWrites(),
      { data: ROSTER_AFTER_SWAP, error: null },
      { data: null, error: null }, // upsert
      { data: null, error: null }, // delete
    ]);
    supabaseMock = buildSupabaseMock([cupAdminUser]);
    setUser('admin-1');

    const { swapCupMatchPlayer } = await import('./actions');
    const err = await swapCupMatchPlayer(swapForm()).catch((e) => e);
    expect(err, 'byttet gikk gjennom').toBeInstanceOf(RedirectError);

    const upserts = participantCalls('upsert');
    expect(upserts).toHaveLength(1);
    expect(upserts[0].args[0]).toEqual({
      tournament_id: 'cup-1',
      user_id: 'reserve',
    });
    // Allerede påmeldt reserve = stille no-op, ikke en feil.
    expect(upserts[0].args[1]).toMatchObject({
      onConflict: 'tournament_id,user_id',
      ignoreDuplicates: true,
    });

    expect(participantCalls('delete')).toHaveLength(1);
    expect(participantCalls('eq').map((c) => c.args)).toEqual([
      ['tournament_id', 'cup-1'],
      ['user_id', 'out'],
    ]);
  });

  it('ut-spilleren står fortsatt i en annen match: deltaker-raden beholdes', async () => {
    adminMock = buildSupabaseMock([
      // Cupen har en match til utenfor bunten — der spiller 'out' fortsatt.
      ...readsUpToRoster({
        games: [
          ...SPLIT_GAMES,
          { id: 'g-other', status: 'scheduled', source_game_id: null },
        ],
      }),
      ...successfulBundleWrites(),
      { data: [...ROSTER_AFTER_SWAP, { user_id: 'out' }], error: null },
      { data: null, error: null }, // upsert
    ]);
    supabaseMock = buildSupabaseMock([cupAdminUser]);
    setUser('admin-1');

    const { swapCupMatchPlayer } = await import('./actions');
    const err = await swapCupMatchPlayer(swapForm()).catch((e) => e);
    expect(err, 'byttet gikk gjennom').toBeInstanceOf(RedirectError);

    // Rosteret leses over alle cupens matcher, men bare de to byttede
    // spillernes rader (#1745): uten game_id-bredden ville g-other-matchen vært
    // usynlig og raden slettet feilaktig, og uten user_id-smalheten kunne en
    // trunkert side ha mistet 'out' og gitt samme feilslettingen.
    expect(gamePlayerCalls('in').slice(-2).map((c) => c.args)).toEqual([
      ['game_id', ['g-host', 'g-derived', 'g-other']],
      ['user_id', ['out', 'reserve']],
    ]);
    expect(participantCalls('upsert')).toHaveLength(1);
    expect(participantCalls('delete')).toHaveLength(0);
  });

  it('synkingen feiler: byttet står likevel, feilen logges', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([
      ...readsUpToRoster(),
      ...successfulBundleWrites(),
      { data: ROSTER_AFTER_SWAP, error: null },
      { data: null, error: { message: 'participants boom' } }, // upsert feiler
      { data: null, error: null }, // delete
    ]);
    supabaseMock = buildSupabaseMock([cupAdminUser]);
    setUser('admin-1');

    const { swapCupMatchPlayer } = await import('./actions');
    const err = await swapCupMatchPlayer(swapForm()).catch((e) => e);

    // Byttet er allerede skrevet — en feilet synk skal aldri velte det.
    expect(err, 'redirect skjer uansett').toBeInstanceOf(RedirectError);
    expect((err as RedirectError).url).toBe(
      '/admin/cup/cup-1?status=player_swapped',
    );
    expect(errSpy).toHaveBeenCalledWith(
      '[cup] swapCupMatchPlayer participant sync failed',
      expect.objectContaining({ error: { message: 'participants boom' } }),
    );
    errSpy.mockRestore();
  });
});

describe('swapCupMatchPlayer — guards som bor i action-en (#1473)', () => {
  it('matchen tilhører en annen cup: not_found, ingen skriving', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull, // gaten (#1749: eneste group_id-lesing)
      { data: { id: 'g-x', tournament_id: 'annen-cup', source_game_id: null }, error: null },
    ]);
    supabaseMock = buildSupabaseMock([cupAdminUser]);
    setUser('admin-1');

    const { swapCupMatchPlayer } = await import('./actions');
    expect(await swapCupMatchPlayer(swapForm({ game_id: 'g-x' }))).toEqual({
      error: 'not_found',
    });
    expect(gamePlayerCalls('delete')).toHaveLength(0);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('klubb-cup: medlemskapet er trukket → not_member, ingen skriving', async () => {
    adminMock = buildSupabaseMock([
      { data: { group_id: 'club-1' }, error: null }, // gaten (#1749: eneste)
      { data: { id: 'g-derived', tournament_id: 'cup-1', source_game_id: 'g-host' }, error: null },
      { data: SPLIT_GAMES, error: null },
      { data: [{ user_id: 'out' }, { user_id: 'mate' }], error: null }, // group_members: reserve er ute
      { data: { gender: 'ladies', profile_completed_at: '2026-07-01T09:00:00.000Z' }, error: null },
      { data: SPLIT_PLAYERS, error: null },
    ]);
    supabaseMock = buildSupabaseMock([cupAdminUser]);
    setUser('admin-1');

    const { swapCupMatchPlayer } = await import('./actions');
    expect(await swapCupMatchPlayer(swapForm())).toEqual({ error: 'not_member' });
    expect(gamePlayerCalls('delete')).toHaveLength(0);
    expect(redirectMock).not.toHaveBeenCalled();
    // Klubb-cupens kandidatliste slås opp mot klubben, ikke mot vennelista.
    expect(candidateMock.mock.calls[0][1]).toMatchObject({ groupId: 'club-1' });
  });

  it('reserven har ikke fullført profilen → profile_incomplete, ingen skriving', async () => {
    // 1A hvilte på «deltaker = profil fullført ved påmelding». Kandidatlista er
    // bredere, så profil-statusen leses fra users-raden og mates inn i guarden.
    adminMock = buildSupabaseMock([
      ...readsUpToRoster({ profile: { gender: 'ladies', profile_completed_at: null } }),
    ]);
    supabaseMock = buildSupabaseMock([cupAdminUser]);
    setUser('admin-1');

    const { swapCupMatchPlayer } = await import('./actions');
    expect(await swapCupMatchPlayer(swapForm())).toEqual({
      error: 'profile_incomplete',
    });
    expect(gamePlayerCalls('delete')).toHaveLength(0);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

/**
 * #1804: deltaker-taket (#526) håndheves i de tre andre skriveveiene inn i
 * `tournament_participants`, men synken etter byttet er best-effort og kan
 * ikke avvise — så vakta bor i PLANFASEN, før noe skrives. Beslutningen
 * (sett-matematikken) er ren logikk og dekkes av
 * `participantRosterSync.test.ts`; her dekkes wiringen: at gaten kun gjelder
 * personlig ikke-admin-cup, at riktige rader leses, og at avvisning/lese-feil
 * skjer FØR første skriving. Admin-kaller-testene over beviser kortslutningen
 * (deres mock-køer har ingen tak-lesinger og står urørt).
 *
 * Ikke-admin creator-DB-sekvens (requireAdminOrTournamentCreator leser
 * created_by når is_admin er false):
 *   1. adminMock: tournaments.select('group_id') — gaten
 *   2. supabaseMock: users.select(...) — loadRole (is_admin: false)
 *   3. adminMock: tournaments.select('created_by') — creator-sjekken
 *   4. onwards: planfasens lesinger, så tak-vaktas to
 */

const cupCreatorUser = {
  data: { is_admin: false, email: 'c@x.no', name: 'Creator' },
  error: null,
};

/** 24 deltakere — nøyaktig på taket. Ut-spilleren er én av dem. */
const PARTICIPANTS_AT_CAP = [
  { user_id: 'out' },
  ...Array.from({ length: 23 }, (_, i) => ({ user_id: `p${i}` })),
];

/** Som `readsUpToRoster`, men for cupens IKKE-admin-skaper. */
function creatorReadsUpToRoster(overrides: { games?: unknown[] } = {}) {
  const [gate, ...rest] = readsUpToRoster(overrides);
  return [
    gate,
    { data: { created_by: 'creator-1' }, error: null }, // creator-sjekken
    ...rest,
  ];
}

describe('swapCupMatchPlayer — deltaker-taket vokter planfasen (#1804)', () => {
  it('personlig cup på taket, ny reserve inn, ut-spilleren blir i en annen match: too_many_players, ingenting skrives', async () => {
    adminMock = buildSupabaseMock([
      ...creatorReadsUpToRoster({
        // En match utenfor bunten — der blir ut-spilleren stående.
        games: [
          ...SPLIT_GAMES,
          { id: 'g-other', status: 'scheduled', source_game_id: null },
        ],
      }),
      { data: PARTICIPANTS_AT_CAP, error: null }, // deltakerlista (tak-vakta)
      {
        data: [{ game_id: 'g-host' }, { game_id: 'g-derived' }, { game_id: 'g-other' }],
        error: null,
      }, // ut-spillerens rader: g-other skrives ikke → hun blir i cupen
    ]);
    supabaseMock = buildSupabaseMock([cupCreatorUser]);
    setUser('creator-1');

    const { swapCupMatchPlayer } = await import('./actions');
    expect(await swapCupMatchPlayer(swapForm())).toEqual({
      error: 'too_many_players',
    });
    expect(gamePlayerCalls('delete')).toHaveLength(0);
    expect(gamePlayerCalls('insert')).toHaveLength(0);
    expect(participantCalls('upsert')).toHaveLength(0);
    expect(participantCalls('delete')).toHaveLength(0);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('samme bytte der ut-spilleren forlater cupen helt: netto 0, går gjennom på taket', async () => {
    adminMock = buildSupabaseMock([
      ...creatorReadsUpToRoster(),
      { data: PARTICIPANTS_AT_CAP, error: null },
      // Ut-spilleren står KUN i matchene som skrives → raden godskrives.
      { data: [{ game_id: 'g-host' }, { game_id: 'g-derived' }], error: null },
      ...successfulBundleWrites(),
      { data: ROSTER_AFTER_SWAP, error: null },
      { data: null, error: null }, // participants upsert
      { data: null, error: null }, // participants delete
    ]);
    supabaseMock = buildSupabaseMock([cupCreatorUser]);
    setUser('creator-1');

    const { swapCupMatchPlayer } = await import('./actions');
    const err = await swapCupMatchPlayer(swapForm()).catch((e) => e);
    expect(err, 'frafallet godskrives — byttet går gjennom').toBeInstanceOf(
      RedirectError,
    );
    expect((err as RedirectError).url).toBe(
      '/admin/cup/cup-1?status=player_swapped',
    );
  });

  it('tak-lesingen feiler: swap_failed (fail-closed), ingenting skrives', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([
      ...creatorReadsUpToRoster(),
      { data: null, error: { message: 'participants boom' } }, // deltakerlista
      { data: [{ game_id: 'g-host' }, { game_id: 'g-derived' }], error: null },
    ]);
    supabaseMock = buildSupabaseMock([cupCreatorUser]);
    setUser('creator-1');

    const { swapCupMatchPlayer } = await import('./actions');
    expect(await swapCupMatchPlayer(swapForm())).toEqual({
      error: 'swap_failed',
    });
    expect(gamePlayerCalls('delete')).toHaveLength(0);
    expect(redirectMock).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(
      '[cup] swapCupMatchPlayer cap read failed',
      expect.objectContaining({
        participantsError: { message: 'participants boom' },
      }),
    );
    errSpy.mockRestore();
  });
});

describe('swapCupMatchPlayer — atomic-or-compensated (#1473)', () => {
  it('inn-inserten feiler midt i bunten: ut-radene re-inserters ordrett, inn-radene ryddes', async () => {
    adminMock = buildSupabaseMock([
      ...readsUpToRoster(),
      { data: [outRow('g-host')], error: null }, // delete host
      { data: null, error: null }, // insert host — ok
      { data: [outRow('g-derived')], error: null }, // delete derived
      { data: null, error: { message: 'boom' } }, // insert derived — feiler
      { data: null, error: null }, // kompensering: slett inn-radene
      { data: null, error: null }, // kompensering: re-insert ut-radene
    ]);
    supabaseMock = buildSupabaseMock([cupAdminUser]);
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
      ...readsUpToRoster(),
      { data: [outRow('g-host')], error: null },
      { data: null, error: null },
      { data: [outRow('g-derived')], error: null },
      { data: null, error: null },
      // Re-lesing: hosten er startet mens vi skrev.
      { data: [{ id: 'g-host', status: 'active' }, { id: 'g-derived', status: 'scheduled' }], error: null },
      { data: null, error: null }, // kompensering: slett inn-radene
      { data: null, error: null }, // kompensering: re-insert ut-radene
    ]);
    supabaseMock = buildSupabaseMock([cupAdminUser]);
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
