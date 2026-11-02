// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';
import type { CupLineupAccess } from './lineupAccess';

/**
 * Type A (#2752): hemmeligheten i kapteinuttaket. `cup_lineup_slots` har ingen lese-policy,
 * så filteret her er selve håndhevelsen. Radene er ekte nok: begge lag har levert plasser,
 * og spørsmålet er hva hver rolle får med seg ut.
 */

const CUP = 'cup';
const SECRET = 'motstanderens-valg';

let revealedAt: string | null = null;
let slotReadError: { message: string } | null = null;

function respond(op: QueryOp): QueryResponse {
  switch (op.table) {
    case 'tournaments':
      return {
        data: { name: 'Cup', status: 'active', team_1_name: 'Nord', team_2_name: 'Sør', planned_match_count: 4, points_to_win: 2.5, win_points: 1, tie_points: 0.5 },
        error: null,
      };
    case 'cup_lineup_sessions':
      return {
        data: [{ id: 'okt', session_index: 0, format: 'singles_matchplay', slot_count: 1, revealed_at: revealedAt, team_1_submitted_at: 'nå', team_2_submitted_at: null }],
        error: null,
      };
    case 'games':
      return { data: null, count: 0, error: null } as QueryResponse;
    case 'cup_lineup_slots':
      return {
        data: [
          { session_id: 'okt', team_number: 1, slot_index: 0, seat: 1, user_id: SECRET },
          { session_id: 'okt', team_number: 2, slot_index: 0, seat: 1, user_id: 'min-spiller' },
        ],
        error: slotReadError,
      };
    case 'users':
      return { data: [], error: null };
    default:
      throw new Error(`tavla leser ikke ${op.table}`);
  }
}
const fake = createAdminClientMock({ tokens: {}, respond });

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('./lineupAccess', () => ({ loadCupLineupAccess: vi.fn() }));

const { loadCupLineupBoardFor } = await import('./lineupData');

const access = (role: CupLineupAccess['role']): CupLineupAccess => ({
  userId: 'meg',
  isAdmin: false,
  groupId: null,
  role,
  participants: [
    { userId: 'kaptein-a', teamNumber: 1, isCaptain: true },
    { userId: 'kaptein-b', teamNumber: 2, isCaptain: true },
  ],
});
const teams = async (role: CupLineupAccess['role']) => {
  const board = await loadCupLineupBoardFor(access(role), CUP, 'Ukjent');
  return { board, one: board!.sessions[0].teams[0], two: board!.sessions[0].teams[1] };
};

beforeEach(() => {
  revealedAt = null;
  slotReadError = null;
});

describe('før avdekking', () => {
  it('kaptein B får ingen plasser fra lag A, bare at laget har levert, og valget finnes ingen steder i svaret', async () => {
    const { board, one, two } = await teams({ kind: 'captain', teamNumber: 2 });
    expect(one.slots).toBeNull();
    expect(one.submittedAt).toBe('nå');
    expect(two.slots).toEqual([{ slotIndex: 0, seat: 1, userId: 'min-spiller' }]);
    expect(JSON.stringify(board)).not.toContain(SECRET);
  });

  it('kaptein A får ikke lag B', async () => {
    const { board, one, two } = await teams({ kind: 'captain', teamNumber: 1 });
    expect(one.slots).toEqual([{ slotIndex: 0, seat: 1, userId: SECRET }]);
    expect(two.slots).toBeNull();
    expect(JSON.stringify(board)).not.toContain('min-spiller');
  });

  it('uten rolle: ingen av lagene, og ingen av valgene', async () => {
    const { board, one, two } = await teams({ kind: 'none' });
    expect(one.slots).toBeNull();
    expect(two.slots).toBeNull();
    expect(JSON.stringify(board)).not.toContain(SECRET);
    expect(JSON.stringify(board)).not.toContain('min-spiller');
  });

  it('arrangøren ser begge', async () => {
    const { one, two } = await teams({ kind: 'organizer' });
    expect(one.slots).toHaveLength(1);
    expect(two.slots).toHaveLength(1);
  });
});

describe('etter avdekking', () => {
  it('alle roller ser begge lag', async () => {
    revealedAt = 'nå';
    for (const role of [{ kind: 'captain', teamNumber: 2 }, { kind: 'none' }] as CupLineupAccess['role'][]) {
      const { one, two } = await teams(role);
      expect(one.slots).toHaveLength(1);
      expect(two.slots).toHaveLength(1);
    }
  });
});

describe('en lesefeil', () => {
  it('kaster, så den ikke blir en tavle der ingen har valgt', async () => {
    slotReadError = { message: 'nede' };
    await expect(loadCupLineupBoardFor(access({ kind: 'organizer' }), CUP, 'Ukjent')).rejects.toEqual({ message: 'nede' });
  });
});
