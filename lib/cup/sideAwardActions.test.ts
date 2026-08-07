import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Unit tests for saveSideAwardConfig / registerSideAwardWinner (#1441, D9).
 *
 * Two separate mocked Supabase clients, matching the two the module actually
 * uses: `supabaseMock` (request-scoped, `getServerClient` — consumed by the
 * `requireAdminOrClubAdminOfCup` gate's `loadRole` call) and `adminMock`
 * (service-role, `getAdminClient` — consumed by BOTH the gate's own
 * `tournaments.group_id` lookup AND every read/write this module does,
 * since `tournament_side_awards` has no write-RLS-policies by design).
 *
 * All tests use a global-admin caller (`is_admin: true`) so the gate
 * short-circuits without needing the club/creator-membership lookups —
 * DB sequence per call:
 *   1. adminMock: tournaments.select('group_id')...maybeSingle — gate
 *   2. supabaseMock: users.select('is_admin,...')...single — loadRole
 *   3. onwards: this module's own adminMock reads/writes
 */

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

function setUser(id: string) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id, email: `${id}@x.no` } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

const gateQueueItem = { data: { group_id: null }, error: null }; // frittstående cup
const adminUserQueueItem = { data: { is_admin: true, email: 'a@x.no', name: 'Admin' }, error: null };

describe('saveSideAwardConfig', () => {
  it('happy path: deletes existing rows then inserts the new set, revalidates', async () => {
    adminMock = buildSupabaseMock([
      gateQueueItem, // 1. gate: tournaments.group_id
      { data: { status: 'draft', group_id: null }, error: null }, // 2. cup lookup
      { data: [], error: null }, // 3. existing awards (none yet)
      { data: null, error: null }, // 4. delete
      { data: null, error: null }, // 5. insert
    ]);
    supabaseMock = buildSupabaseMock([adminUserQueueItem]);
    setUser('admin-1');

    const { saveSideAwardConfig } = await import('./sideAwardActions');
    const result = await saveSideAwardConfig('cup-1', [
      { kind: 'ctp', holeNumber: 4, points: 2 },
      { kind: 'ctp', holeNumber: 11, points: 2 },
      { kind: 'ld', holeNumber: 6, points: 3 },
    ]);

    expect(result).toEqual({ ok: true });

    const deleteCall = adminMock.__fromCalls.find(
      (c) => c.table === 'tournament_side_awards' && c.method === 'delete',
    );
    expect(deleteCall, 'delete issued').toBeDefined();

    const insertCall = adminMock.__fromCalls.find(
      (c) => c.table === 'tournament_side_awards' && c.method === 'insert',
    );
    expect(insertCall!.args[0]).toEqual([
      { tournament_id: 'cup-1', kind: 'ctp', hole_number: 4, points: 2 },
      { tournament_id: 'cup-1', kind: 'ctp', hole_number: 11, points: 2 },
      { tournament_id: 'cup-1', kind: 'ld', hole_number: 6, points: 3 },
    ]);
  });

  it('empty list: deletes existing rows, skips the insert call entirely (clears the config)', async () => {
    adminMock = buildSupabaseMock([
      gateQueueItem,
      { data: { status: 'draft', group_id: null }, error: null },
      { data: [], error: null }, // existing
      { data: null, error: null }, // delete
    ]);
    supabaseMock = buildSupabaseMock([adminUserQueueItem]);
    setUser('admin-1');

    const { saveSideAwardConfig } = await import('./sideAwardActions');
    const result = await saveSideAwardConfig('cup-1', []);

    expect(result).toEqual({ ok: true });
    expect(
      adminMock.__fromCalls.some(
        (c) => c.table === 'tournament_side_awards' && c.method === 'insert',
      ),
    ).toBe(false);
  });

  it.each([
    [{ kind: 'ctp', holeNumber: 0, points: 2 }], // hole out of 1..18
    [{ kind: 'ctp', holeNumber: 19, points: 2 }],
    [{ kind: 'ctp', holeNumber: 4, points: 0 }], // points must be > 0
    [{ kind: 'ctp', holeNumber: 4, points: -1 }],
    [{ kind: 'xyz', holeNumber: 4, points: 2 }], // invalid kind
  ])('ugyldig innslag %j: invalid_side_award FØR noe leses/skrives', async (bad) => {
    adminMock = buildSupabaseMock([gateQueueItem]);
    supabaseMock = buildSupabaseMock([adminUserQueueItem]);
    setUser('admin-1');

    const { saveSideAwardConfig } = await import('./sideAwardActions');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await saveSideAwardConfig('cup-1', [bad as any]);

    expect(result).toEqual({ ok: false, error: 'invalid_side_award' });
    expect(
      adminMock.__fromCalls.some((c) => c.table === 'tournament_side_awards'),
    ).toBe(false);
  });

  it('duplikat (samme kind+hole_number) i samme innsending: duplicate_side_award FØR noe skrives', async () => {
    adminMock = buildSupabaseMock([gateQueueItem]);
    supabaseMock = buildSupabaseMock([adminUserQueueItem]);
    setUser('admin-1');

    const { saveSideAwardConfig } = await import('./sideAwardActions');
    const result = await saveSideAwardConfig('cup-1', [
      { kind: 'ctp', holeNumber: 4, points: 2 },
      { kind: 'ctp', holeNumber: 4, points: 3 },
    ]);

    expect(result).toEqual({ ok: false, error: 'duplicate_side_award' });
    expect(
      adminMock.__fromCalls.some((c) => c.table === 'tournament_side_awards'),
    ).toBe(false);
  });

  it('cup finished: cup_finished, ingen skriving', async () => {
    adminMock = buildSupabaseMock([
      gateQueueItem,
      { data: { status: 'finished', group_id: null }, error: null },
    ]);
    supabaseMock = buildSupabaseMock([adminUserQueueItem]);
    setUser('admin-1');

    const { saveSideAwardConfig } = await import('./sideAwardActions');
    const result = await saveSideAwardConfig('cup-1', [
      { kind: 'ctp', holeNumber: 4, points: 2 },
    ]);

    expect(result).toEqual({ ok: false, error: 'cup_finished' });
  });

  it('cup active (ingen vinnere ennå): cup_started — sidepoeng er låst etter start, ingen lesing/skriving', async () => {
    // #1455: eier-overstyring av D9 — oppsett tillatt KUN i draft. En aktiv cup
    // avvises FØR eksisterende innslag leses, så verken delete eller insert kjøres.
    adminMock = buildSupabaseMock([
      gateQueueItem,
      { data: { status: 'active', group_id: null }, error: null },
    ]);
    supabaseMock = buildSupabaseMock([adminUserQueueItem]);
    setUser('admin-1');

    const { saveSideAwardConfig } = await import('./sideAwardActions');
    const result = await saveSideAwardConfig('cup-1', [
      { kind: 'ctp', holeNumber: 4, points: 2 },
    ]);

    expect(result).toEqual({ ok: false, error: 'cup_started' });
    expect(
      adminMock.__fromCalls.some(
        (c) => c.table === 'tournament_side_awards' && (c.method === 'delete' || c.method === 'insert'),
      ),
    ).toBe(false);
  });

  it('en vinner er allerede registrert på et eksisterende innslag (draft, dybdeforsvar): winners_already_registered, ingen sletting/skriving', async () => {
    // #1455: draft-cuper skal ikke kunne ha vinner-rader, men gaten beholdes som
    // forsvar i dybden. Status draft passerer cup_started-gaten, så winners-grenen
    // er fortsatt utøvd.
    adminMock = buildSupabaseMock([
      gateQueueItem,
      { data: { status: 'draft', group_id: null }, error: null },
      {
        data: [
          { id: 'sa1', tournament_id: 'cup-1', kind: 'ctp', hole_number: 4, points: 2, winner_user_id: 'p1' },
        ],
        error: null,
      },
    ]);
    supabaseMock = buildSupabaseMock([adminUserQueueItem]);
    setUser('admin-1');

    const { saveSideAwardConfig } = await import('./sideAwardActions');
    const result = await saveSideAwardConfig('cup-1', [
      { kind: 'ctp', holeNumber: 4, points: 5 }, // organizer trying to bump the points post-hoc
    ]);

    expect(result).toEqual({ ok: false, error: 'winners_already_registered' });
    expect(
      adminMock.__fromCalls.some(
        (c) => c.table === 'tournament_side_awards' && (c.method === 'delete' || c.method === 'insert'),
      ),
    ).toBe(false);
  });

  it('insert feiler etter delete: kompensert rollback — setter de før-slettingen-leste radene rett tilbake', async () => {
    const existingRow = {
      id: 'sa1',
      tournament_id: 'cup-1',
      kind: 'ctp',
      hole_number: 4,
      points: 2,
      winner_user_id: null,
    };
    adminMock = buildSupabaseMock([
      gateQueueItem,
      { data: { status: 'draft', group_id: null }, error: null },
      { data: [existingRow], error: null }, // existing (no winner — gate passes)
      { data: null, error: null }, // delete OK
      { data: null, error: { message: 'boom' } }, // insert FAILS
      { data: null, error: null }, // compensating re-insert
    ]);
    supabaseMock = buildSupabaseMock([adminUserQueueItem]);
    setUser('admin-1');

    const { saveSideAwardConfig } = await import('./sideAwardActions');
    const result = await saveSideAwardConfig('cup-1', [
      { kind: 'ld', holeNumber: 6, points: 3 },
    ]);

    expect(result).toEqual({ ok: false, error: 'save_failed' });

    const insertCalls = adminMock.__fromCalls.filter(
      (c) => c.table === 'tournament_side_awards' && c.method === 'insert',
    );
    // 1st insert = the attempted new config (failed); 2nd = the compensating
    // restore of the row that was deleted before the failure.
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[1].args[0]).toEqual([existingRow]);
  });
});

describe('registerSideAwardWinner', () => {
  it('happy path: winner is a roster participant → update succeeds, revalidates', async () => {
    adminMock = buildSupabaseMock([
      gateQueueItem, // 1. gate
      { data: { group_id: null }, error: null }, // 2. cup lookup
      { data: [{ id: 'g1' }, { id: 'g2' }], error: null }, // 3. cup's games
      { data: [{ user_id: 'p1' }], error: null }, // 4. roster check (found)
      { data: [{ id: 'sa1' }], error: null }, // 5. update...select('id')
    ]);
    supabaseMock = buildSupabaseMock([adminUserQueueItem]);
    setUser('admin-1');

    const { registerSideAwardWinner } = await import('./sideAwardActions');
    const result = await registerSideAwardWinner({
      tournamentId: 'cup-1',
      awardId: 'sa1',
      winnerUserId: 'p1',
    });

    expect(result).toEqual({ ok: true });
    const updateCall = adminMock.__fromCalls.find(
      (c) => c.table === 'tournament_side_awards' && c.method === 'update',
    );
    expect(updateCall!.args[0]).toEqual({ winner_user_id: 'p1' });
  });

  it('vinneren er IKKE en deltaker i cupen: not_a_participant, ingen update', async () => {
    adminMock = buildSupabaseMock([
      gateQueueItem,
      { data: { group_id: null }, error: null },
      { data: [{ id: 'g1' }], error: null },
      { data: [], error: null }, // roster check: not found
    ]);
    supabaseMock = buildSupabaseMock([adminUserQueueItem]);
    setUser('admin-1');

    const { registerSideAwardWinner } = await import('./sideAwardActions');
    const result = await registerSideAwardWinner({
      tournamentId: 'cup-1',
      awardId: 'sa1',
      winnerUserId: 'ghost',
    });

    expect(result).toEqual({ ok: false, error: 'not_a_participant' });
    expect(
      adminMock.__fromCalls.some(
        (c) => c.table === 'tournament_side_awards' && c.method === 'update',
      ),
    ).toBe(false);
  });

  it('cupen har ingen matcher ennå (tomt roster): not_a_participant', async () => {
    adminMock = buildSupabaseMock([
      gateQueueItem,
      { data: { group_id: null }, error: null },
      { data: [], error: null }, // no games
    ]);
    supabaseMock = buildSupabaseMock([adminUserQueueItem]);
    setUser('admin-1');

    const { registerSideAwardWinner } = await import('./sideAwardActions');
    const result = await registerSideAwardWinner({
      tournamentId: 'cup-1',
      awardId: 'sa1',
      winnerUserId: 'p1',
    });

    expect(result).toEqual({ ok: false, error: 'not_a_participant' });
  });

  it('update treffer 0 rader (feil awardId/tournamentId): save_failed (expectAffected)', async () => {
    adminMock = buildSupabaseMock([
      gateQueueItem,
      { data: { group_id: null }, error: null },
      { data: [{ id: 'g1' }], error: null },
      { data: [{ user_id: 'p1' }], error: null },
      { data: [], error: null }, // update...select('id') affected 0 rows
    ]);
    supabaseMock = buildSupabaseMock([adminUserQueueItem]);
    setUser('admin-1');

    const { registerSideAwardWinner } = await import('./sideAwardActions');
    const result = await registerSideAwardWinner({
      tournamentId: 'cup-1',
      awardId: 'does-not-exist',
      winnerUserId: 'p1',
    });

    expect(result).toEqual({ ok: false, error: 'save_failed' });
  });
});
