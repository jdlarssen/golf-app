// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type A (#2752): det kjernen svarer når noe går galt. Veien som lykkes er kjørt gjennom
 * `deleteTournament` i `actions.test.ts`. Her står feilene, for appen regner `not_found`
 * som at cupen alt er borte, og gir kvittering.
 */

let gamesDeleted: unknown[] = [];

function respond(op: QueryOp): QueryResponse {
  if (op.table !== 'games') throw new Error(`admin-klienten rører ikke ${op.table}`);
  return { data: gamesDeleted, error: null };
}
const fake = createAdminClientMock({ tokens: {}, respond });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('@/lib/games/expireGameCache', () => ({ expireTournamentCache: vi.fn() }));
vi.mock('@/lib/i18n/revalidateLocalePath', () => ({ revalidatePath: vi.fn() }));

const plan = vi.hoisted(() => ({ planTournamentGameDeletion: vi.fn() }));
vi.mock('./tournamentGameDeletion', () => ({ planTournamentGameDeletion: plan.planTournamentGameDeletion }));

const { deleteCupCore } = await import('./deleteCupCore');

const CUP_ROW = { data: { id: 'cup', name: 'Klubbmesterskapet' }, error: null };
const run = (queue: QueryResponse[]) => {
  const caller = buildSupabaseMock(queue);
  return { caller, result: deleteCupCore(caller as never, 'cup') };
};

beforeEach(() => {
  vi.clearAllMocks();
  fake.ops.length = 0;
  gamesDeleted = [];
  plan.planTournamentGameDeletion.mockResolvedValue({ hostIdsToDelete: [], derivedIdsRidingAlong: [], totalGames: 0 });
});

describe('deleteCupCore', () => {
  it('en lesefeil er ikke «finnes ikke», og ingenting slettes', async () => {
    const { result } = run([{ data: null, error: { message: 'nede' } }]);
    expect(await result).toEqual({ ok: false, error: 'delete_failed' });
    expect(plan.planTournamentGameDeletion).not.toHaveBeenCalled();
    expect(fake.ops).toHaveLength(0);
  });

  it('ingen rad er `not_found`', async () => {
    const { result } = run([{ data: null, error: null }]);
    expect(await result).toEqual({ ok: false, error: 'not_found' });
  });

  it('0 rader på cupen er en feil, ikke en sletting', async () => {
    const { result } = run([CUP_ROW, { data: [], error: null }]);
    expect(await result).toEqual({ ok: false, error: 'delete_failed' });
  });

  it('går ikke alle kampene, står cup-raden urørt', async () => {
    plan.planTournamentGameDeletion.mockResolvedValue({ hostIdsToDelete: ['a', 'b'], derivedIdsRidingAlong: [], totalGames: 2 });
    gamesDeleted = [{ id: 'a' }];
    const { caller, result } = run([CUP_ROW]);
    expect(await result).toEqual({ ok: false, error: 'delete_failed' });
    expect(caller.__fromCalls.filter((c: { method: string }) => c.method === 'delete')).toHaveLength(0);
  });

  it('slettet gir navnet tilbake', async () => {
    const { result } = run([CUP_ROW, { data: [{ id: 'cup' }], error: null }]);
    expect(await result).toEqual({ ok: true, name: 'Klubbmesterskapet' });
  });
});
