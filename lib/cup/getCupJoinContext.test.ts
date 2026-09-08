import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import { CupJoinReadError } from './cupJoinErrors';
import { getCupJoinContext } from './getCupJoinContext';

/**
 * Type A for fakta-innsamlingen bak spillerens påmeldingsside (#1490), med
 * fail-closed-regelen fra #1863: en lesefeil er en feil, aldri en tom liste.
 *
 * Regresjonen som gjorde testen nødvendig: `participantRes.error` ble ignorert,
 * så en DB-hikke ga `participantCount: 0` + `alreadyJoined: false` — altså
 * `can_join`, og deltaker-taket var omgått.
 *
 * KØ-REKKEFØLGE (`buildSupabaseMock` er FIFO, men `.maybeSingle()` er en EAGER
 * terminal som poper synkront når array-literalen i `Promise.all` evalueres,
 * mens participants-builderen først poper når `Promise.all` kaller `.then`):
 *
 *   klubb-cup (group_id satt):  cup, creator, me, membership, participants
 *   personlig cup (group_id null): cup, creator, me, participants
 *     — fallbacken `Promise.resolve({ data: null, error: null })` poper ingenting.
 */

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const ME = 'player-1';
const SHORT_ID = 'abcd1234';

const CLUB_CUP = {
  id: 'cup-1',
  name: 'Vinter-cup',
  status: 'draft',
  group_id: 'club-1',
  created_by: 'creator-1',
  team_1_name: 'Lag A',
  team_2_name: 'Lag B',
};
const PERSONAL_CUP = { ...CLUB_CUP, group_id: null };

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('getCupJoinContext', () => {
  it('happy path: samler faktaene fra alle fem lesingene', async () => {
    adminMock = buildSupabaseMock([
      { data: CLUB_CUP, error: null }, // cup
      { data: { is_admin: true }, error: null }, // creator
      { data: { profile_completed_at: '2026-01-01' }, error: null }, // me
      { data: { role: 'member' }, error: null }, // membership
      { data: [{ user_id: ME }, { user_id: 'other' }], error: null }, // participants
    ]);

    const { cup, facts } = await getCupJoinContext(SHORT_ID, ME);

    expect(cup).toEqual(CLUB_CUP);
    expect(facts).toEqual({
      cupExists: true,
      status: 'draft',
      groupId: 'club-1',
      creatorIsAdmin: true,
      profileCompleted: true,
      isClubMember: true,
      participantCount: 2,
      alreadyJoined: true,
    });
  });

  it('deltaker-lesingen feiler: kaster i stedet for å telle 0', async () => {
    adminMock = buildSupabaseMock([
      { data: PERSONAL_CUP, error: null },
      { data: { is_admin: false }, error: null },
      { data: { profile_completed_at: '2026-01-01' }, error: null },
      { data: null, error: { message: 'connection reset' } }, // participants
    ]);

    await expect(getCupJoinContext(SHORT_ID, ME)).rejects.toBeInstanceOf(
      CupJoinReadError,
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '[cup] getCupJoinContext read failed',
      expect.objectContaining({ shortId: SHORT_ID, userId: ME, which: 'participants' }),
    );
  });

  it('cup-oppslaget feiler: kaster i stedet for å svare «finnes ikke»', async () => {
    // Uten dette ble en Supabase-hikke til `cup: null` → `notFound()` på siden,
    // altså en 404 for en cup som finnes.
    adminMock = buildSupabaseMock([
      { data: null, error: { message: 'connection reset' } },
    ]);

    await expect(getCupJoinContext(SHORT_ID, ME)).rejects.toBeInstanceOf(
      CupJoinReadError,
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '[cup] getCupJoinContext read failed',
      expect.objectContaining({ which: 'cup' }),
    );
  });

  it('tom deltakerliste uten feil er fortsatt en gyldig cup', async () => {
    adminMock = buildSupabaseMock([
      { data: PERSONAL_CUP, error: null },
      { data: { is_admin: false }, error: null },
      { data: { profile_completed_at: null }, error: null },
      { data: [], error: null }, // participants — tom, men ingen feil
    ]);

    const { facts } = await getCupJoinContext(SHORT_ID, ME);

    expect(facts.participantCount).toBe(0);
    expect(facts.alreadyJoined).toBe(false);
    expect(facts.isClubMember).toBe(false); // fallbacken, ikke en lesing
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
