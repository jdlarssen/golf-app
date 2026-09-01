import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for saveCupPlan / addCupParticipant / removeCupParticipant (#1472).
 *
 * Same two-client shape as sideAwardActions.test.ts: `supabaseMock`
 * (request-scoped, `getServerClient` — consumed only by the gate's `loadRole`)
 * and `adminMock` (service-role, `getAdminClient` — the gate's own
 * `tournaments.group_id` lookup AND every read/write these actions do, since
 * `tournament_plans`/`tournament_participants` have no write-RLS by design).
 *
 * `getCupCandidatePlayers` is mocked at the boundary — the eligibility source is
 * exercised through the shipped GenerateMatches flow; here we control the list
 * directly so the action's own gate/cap logic is tested in isolation.
 *
 * Admin-caller DB sequence (gate short-circuits on is_admin):
 *   1. adminMock: tournaments.select('group_id')...maybeSingle — gate
 *   2. supabaseMock: users.select('is_admin,...')...single — loadRole
 *   3. adminMock: tournaments.select('status')...maybeSingle — the action's own
 *      cup lookup. `group_id` is NOT re-read: the gate returns the resolved
 *      `groupId` (#1749) and the actions destructure it (#1768), so this read
 *      only answers «does the cup exist, and is it still draft?».
 *   4. onwards: the action's own adminMock reads/writes
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

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

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
});

const gateGroupIdNull = { data: { group_id: null }, error: null };
const adminUser = { data: { is_admin: true, email: 'a@x.no', name: 'Admin' }, error: null };
const normalUser = { data: { is_admin: false, email: 'c@x.no', name: 'Creator' }, error: null };

/** Valid standalone-cup Oppsett form; per-case overrides break one field. */
function planForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set('id', 'cup-1');
  fd.set('course_id', 'course-1');
  fd.set('tee_box_id', 'tee-1');
  fd.set('tee_off_at', '');
  fd.set('preset_id', 'klassisk');
  fd.set('custom_sessions', '');
  fd.set('strategy', 'handicap');
  fd.set('best_ball_allowance_pct', '');
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function participantForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set('id', 'cup-1');
  fd.set('user_id', 'p1');
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

describe('saveCupPlan', () => {
  it('happy path: upserts the plan on tournament_id, redirects with plan_saved', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull, // 1. gate
      { data: { status: 'draft' }, error: null }, // 2. cup lookup
      { data: { id: 'course-1' }, error: null }, // 3. course exists
      { data: { id: 'tee-1', course_id: 'course-1', archived_at: null }, error: null }, // 4. tee of course
      { data: [{ tournament_id: 'cup-1' }], error: null }, // 5. upsert...select
    ]);
    supabaseMock = buildSupabaseMock([adminUser]);
    setUser('admin-1');

    const { saveCupPlan } = await import('./planActions');
    const err = await saveCupPlan(planForm()).catch((e) => e);

    expect(err, 'success redirects (throws)').toBeInstanceOf(RedirectError);
    expect((err as RedirectError).url).toBe('/admin/cup/cup-1?status=plan_saved');

    const upsert = adminMock.__fromCalls.find(
      (c) => c.table === 'tournament_plans' && c.method === 'upsert',
    );
    expect(upsert, 'plan upsert issued').toBeDefined();
    expect(upsert!.args[0]).toMatchObject({
      tournament_id: 'cup-1',
      course_id: 'course-1',
      tee_box_id: 'tee-1',
      scheduled_tee_off_at: null,
      preset_id: 'klassisk',
      custom_sessions: null,
      strategy: 'handicap',
      best_ball_allowance_pct: null,
    });
    expect(typeof (upsert!.args[0] as { updated_at: unknown }).updated_at).toBe('string');
    expect(upsert!.args[1]).toEqual({ onConflict: 'tournament_id' });
  });

  it('genererte matcher: scheduled-radene får ny bane/tee/starttid, én UPDATE per flight-tid', async () => {
    // Én splittet-cup-dag-flight per host-par; «Singel»-radene er avledede.
    const games = [
      { id: 'gs-1', status: 'scheduled', source_game_id: null, tournament_match_label: 'Greensome 1', hole_segment: 'front9' },
      { id: 'bb-1', status: 'scheduled', source_game_id: null, tournament_match_label: 'Best ball 1', hole_segment: 'back9' },
      { id: 's-1', status: 'scheduled', source_game_id: 'bb-1', tournament_match_label: 'Singel 1', hole_segment: 'back9' },
      { id: 'gs-2', status: 'scheduled', source_game_id: null, tournament_match_label: 'Greensome 2', hole_segment: 'front9' },
      { id: 'aktiv', status: 'active', source_game_id: null, tournament_match_label: 'Greensome 3', hole_segment: 'front9' },
    ];
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      { data: { status: 'draft' }, error: null },
      { data: { id: 'course-1' }, error: null },
      { data: { id: 'tee-1', course_id: 'course-1', archived_at: null }, error: null },
      { data: [{ tournament_id: 'cup-1' }], error: null }, // plan upsert
      { data: games, error: null }, // cupens games
      { data: [{ id: 'gs-1' }, { id: 'bb-1' }, { id: 's-1' }], error: null }, // flight 1
      { data: [{ id: 'gs-2' }], error: null }, // flight 2
    ]);
    supabaseMock = buildSupabaseMock([adminUser]);
    setUser('admin-1');

    const { saveCupPlan } = await import('./planActions');
    const err = await saveCupPlan(
      planForm({ tee_off_at: '2030-06-01T08:00' }),
    ).catch((e) => e);
    expect(err, 'success redirects (throws)').toBeInstanceOf(RedirectError);

    const updates = adminMock.__fromCalls.filter(
      (c) => c.table === 'games' && c.method === 'update',
    );
    expect(updates, 'one UPDATE per distinct tee-off').toHaveLength(2);

    const payloads = updates.map(
      (c) => c.args[0] as { course_id: string; tee_box_id: string; scheduled_tee_off_at: string },
    );
    for (const p of payloads) {
      expect(p.course_id).toBe('course-1');
      expect(p.tee_box_id).toBe('tee-1');
    }
    // Flight 2 ligger ti minutter etter flight 1 (FLIGHT_TEE_OFF_STAGGER_MINUTES).
    const [first, second] = payloads.map((p) => Date.parse(p.scheduled_tee_off_at));
    expect(second - first).toBe(10 * 60 * 1000);

    // Den avledede singles-matchen følger hosten sin, ikke sitt eget label-tall.
    const idGroups = adminMock.__fromCalls
      .filter((c) => c.table === 'games' && c.method === 'in')
      .map((c) => c.args[1] as string[]);
    expect(idGroups).toEqual([['gs-1', 'bb-1', 's-1'], ['gs-2']]);

    // Den startede matchen er hverken i settet eller uten status-vern i UPDATE-en.
    expect(idGroups.flat()).not.toContain('aktiv');
    const statusFilters = adminMock.__fromCalls.filter(
      (c) => c.table === 'games' && c.method === 'eq' && c.args[0] === 'status',
    );
    expect(statusFilters).toHaveLength(2);
    expect(statusFilters[0].args[1]).toBe('scheduled');

    // Hver oppdatert kamp får cachen sin revalidert.
    const { revalidateTag } = await import('next/cache');
    const tags = (revalidateTag as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(tags).toEqual(
      expect.arrayContaining(['game-gs-1', 'game-bb-1', 'game-s-1', 'game-gs-2']),
    );
  });

  it('ingen genererte matcher: ingen UPDATE, planen lagres som før', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      { data: { status: 'draft' }, error: null },
      { data: { id: 'course-1' }, error: null },
      { data: { id: 'tee-1', course_id: 'course-1', archived_at: null }, error: null },
      { data: [{ tournament_id: 'cup-1' }], error: null }, // plan upsert
      { data: [], error: null }, // cupen har ingen matcher ennå
    ]);
    supabaseMock = buildSupabaseMock([adminUser]);
    setUser('admin-1');

    const { saveCupPlan } = await import('./planActions');
    const err = await saveCupPlan(planForm()).catch((e) => e);

    expect(err).toBeInstanceOf(RedirectError);
    expect(
      adminMock.__fromCalls.some((c) => c.table === 'games' && c.method === 'update'),
    ).toBe(false);
  });

  it('0 oppdaterte rader tross scheduled-matcher: plan_matches_not_updated, ingen redirect', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      { data: { status: 'draft' }, error: null },
      { data: { id: 'course-1' }, error: null },
      { data: { id: 'tee-1', course_id: 'course-1', archived_at: null }, error: null },
      { data: [{ tournament_id: 'cup-1' }], error: null }, // plan upsert
      {
        data: [
          { id: 'g1', status: 'scheduled', source_game_id: null, tournament_match_label: 'Singel 1', hole_segment: 'full' },
        ],
        error: null,
      },
      { data: [], error: null }, // UPDATE traff 0 rader — ekte feil, ikke no-op
    ]);
    supabaseMock = buildSupabaseMock([adminUser]);
    setUser('admin-1');

    const { saveCupPlan } = await import('./planActions');
    expect(await saveCupPlan(planForm())).toEqual({
      error: 'plan_matches_not_updated',
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('cup not draft: not_draft, no upsert, no redirect', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      { data: { status: 'active' }, error: null }, // cup lookup: active
    ]);
    supabaseMock = buildSupabaseMock([adminUser]);
    setUser('admin-1');

    const { saveCupPlan } = await import('./planActions');
    expect(await saveCupPlan(planForm())).toEqual({ error: 'not_draft' });
    expect(
      adminMock.__fromCalls.some((c) => c.table === 'tournament_plans'),
    ).toBe(false);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('tee does not belong to the chosen course: plan_tee, no upsert', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      { data: { status: 'draft' }, error: null }, // cup lookup
      { data: { id: 'course-1' }, error: null }, // course exists
      { data: { id: 'tee-1', course_id: 'course-OTHER', archived_at: null }, error: null }, // tee of a different course
    ]);
    supabaseMock = buildSupabaseMock([adminUser]);
    setUser('admin-1');

    const { saveCupPlan } = await import('./planActions');
    expect(await saveCupPlan(planForm())).toEqual({ error: 'plan_tee' });
    expect(
      adminMock.__fromCalls.some((c) => c.table === 'tournament_plans'),
    ).toBe(false);
  });
});

describe('addCupParticipant', () => {
  it('happy path: upserts the participant, redirects to the spillere room', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull, // gate
      { data: { status: 'draft' }, error: null }, // cup lookup
      { data: null, error: null }, // participant upsert
    ]);
    supabaseMock = buildSupabaseMock([adminUser]);
    setUser('admin-1');
    candidateMock.mockResolvedValue([{ id: 'p1', displayName: 'Anna', hcpIndex: 10 }]);

    const { addCupParticipant } = await import('./planActions');
    const err = await addCupParticipant(participantForm()).catch((e) => e);

    expect(err).toBeInstanceOf(RedirectError);
    expect((err as RedirectError).url).toBe(
      '/admin/cup/cup-1/spillere?status=participant_added',
    );

    const upsert = adminMock.__fromCalls.find(
      (c) => c.table === 'tournament_participants' && c.method === 'upsert',
    );
    expect(upsert!.args[0]).toEqual({ tournament_id: 'cup-1', user_id: 'p1' });
    expect(upsert!.args[1]).toEqual({
      onConflict: 'tournament_id,user_id',
      ignoreDuplicates: true,
    });
  });

  it('target is not a valid candidate: not_candidate, no insert', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      { data: { status: 'draft' }, error: null },
    ]);
    supabaseMock = buildSupabaseMock([adminUser]);
    setUser('admin-1');
    candidateMock.mockResolvedValue([]); // p1 not offered

    const { addCupParticipant } = await import('./planActions');
    expect(await addCupParticipant(participantForm())).toEqual({
      error: 'not_candidate',
    });
    expect(
      adminMock.__fromCalls.some((c) => c.table === 'tournament_participants'),
    ).toBe(false);
  });

  it('personal non-admin cup at the player cap: too_many_players, no insert', async () => {
    const existing = Array.from({ length: 24 }, (_, i) => ({ user_id: `p${i + 1}` }));
    adminMock = buildSupabaseMock([
      gateGroupIdNull, // gate group_id
      { data: { created_by: 'creator-1' }, error: null }, // requireAdminOrTournamentCreator
      { data: { status: 'draft' }, error: null }, // cup lookup
      { data: existing, error: null }, // existing participants read (24 distinct)
    ]);
    supabaseMock = buildSupabaseMock([normalUser]);
    setUser('creator-1');
    // p25 is a valid candidate but pushes the distinct set to 25 (> cap of 24).
    candidateMock.mockResolvedValue([{ id: 'p25', displayName: 'Nr 25', hcpIndex: 12 }]);

    const { addCupParticipant } = await import('./planActions');
    expect(
      await addCupParticipant(participantForm({ user_id: 'p25' })),
    ).toEqual({ error: 'too_many_players' });
    expect(
      adminMock.__fromCalls.some(
        (c) => c.table === 'tournament_participants' && c.method === 'upsert',
      ),
    ).toBe(false);
  });

  // #1810: cap-vakta leste deltakerne uten å se på error-kanalen. En feilet
  // lesing ga `existing = null` → distinct-settet ble 1 → taket slapp
  // påmeldingen gjennom (fail-open). Vakta skal feile LUKKET, som
  // `checkSwapParticipantCap` gjør.
  it('personal non-admin cup, participant read fails: plan_save_failed, no insert', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull, // gate group_id
      { data: { created_by: 'creator-1' }, error: null }, // requireAdminOrTournamentCreator
      { data: { status: 'draft' }, error: null }, // cup lookup
      { data: null, error: { message: 'boom' } }, // existing participants read FAILS
    ]);
    supabaseMock = buildSupabaseMock([normalUser]);
    setUser('creator-1');
    candidateMock.mockResolvedValue([
      { id: 'p25', displayName: 'Nr 25', hcpIndex: 12 },
    ]);

    const { addCupParticipant } = await import('./planActions');
    expect(
      await addCupParticipant(participantForm({ user_id: 'p25' })),
    ).toEqual({ error: 'plan_save_failed' });
    expect(
      adminMock.__fromCalls.some(
        (c) => c.table === 'tournament_participants' && c.method === 'upsert',
      ),
    ).toBe(false);
  });
});

describe('removeCupParticipant', () => {
  it('happy path: deletes the participant, redirects to the spillere room', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull, // gate
      { data: { status: 'draft' }, error: null }, // cup lookup
      { data: null, error: null }, // delete
    ]);
    supabaseMock = buildSupabaseMock([adminUser]);
    setUser('admin-1');

    const { removeCupParticipant } = await import('./planActions');
    const err = await removeCupParticipant(participantForm()).catch((e) => e);

    expect(err).toBeInstanceOf(RedirectError);
    expect((err as RedirectError).url).toBe(
      '/admin/cup/cup-1/spillere?status=participant_removed',
    );
    const del = adminMock.__fromCalls.find(
      (c) => c.table === 'tournament_participants' && c.method === 'delete',
    );
    expect(del, 'delete issued').toBeDefined();
  });
});
