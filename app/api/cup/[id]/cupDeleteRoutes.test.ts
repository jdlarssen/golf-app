// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type A (#2752): ruta som sletter et utkast fra appen. Selve slettingen har sin suite i
 * `lib/cup/actions.test.ts` (via `deleteCupCore`), så kjernen er byttet ut her. Her står det
 * ruta svarer for: hvem som slipper inn, og at bare det som ikke er startet, går videre.
 */

const CUP = '44444444-4444-4444-8444-444444444444';
const MANAGER = '11111111-1111-4111-8111-111111111111';
const OUTSIDER = '99999999-9999-4999-8999-999999999999';

let row: Record<string, unknown> | null = null;
let readError: { message: string } | null = null;

function respond(op: QueryOp): QueryResponse {
  if (op.table !== 'tournaments') throw new Error(`ruta leser ikke ${op.table} med admin-klienten`);
  // Porten leser `group_id` først. Lesefeilen skal treffe ruta sin egen lesing.
  if (op.columns === 'group_id') return { data: row, error: null };
  return { data: readError ? null : row, error: readError };
}
const fake = createAdminClientMock({ tokens: { 'token-sjef': MANAGER, 'token-fremmed': OUTSIDER }, respond });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

let caller: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/api/appAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/appAuth')>();
  return { ...actual, callerScopedClient: () => caller };
});

const core = vi.hoisted(() => ({
  deleteCupCore: vi.fn(),
  revalidateCupDeleted: vi.fn(),
  planTournamentGameDeletion: vi.fn(),
}));
vi.mock('@/lib/cup/deleteCupCore', () => ({
  deleteCupCore: core.deleteCupCore,
  revalidateCupDeleted: core.revalidateCupDeleted,
}));
vi.mock('@/lib/cup/tournamentGameDeletion', () => ({
  planTournamentGameDeletion: core.planTournamentGameDeletion,
}));

const { GET, DELETE } = await import('./delete/route');

const params = (id = CUP) => ({ params: Promise.resolve({ id }) });
const request = (method: string, token: string | null = 'token-sjef') =>
  new NextRequest(`http://localhost/api/cup/${CUP}/delete`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

const cup = (status: string) => ({
  group_id: 'klubb',
  name: 'Klubbmesterskapet',
  status,
  team_1_name: 'Team Nord',
  team_2_name: 'Team Sør',
});
const allow = (allowed: boolean) => {
  caller = buildSupabaseMock([], { can_manage_tournament: allowed }, { byTable: { users: [{ data: { is_admin: false, name: 'Kari' }, error: null }] } });
};

beforeEach(() => {
  vi.clearAllMocks();
  row = cup('draft');
  readError = null;
  allow(true);
  core.deleteCupCore.mockResolvedValue({ ok: true, name: 'Klubbmesterskapet' });
  core.planTournamentGameDeletion.mockResolvedValue({ hostIdsToDelete: ['a', 'b'], derivedIdsRidingAlong: ['c'], totalGames: 3 });
});

describe.each([
  ['GET', () => GET(request('GET'), params()), (token: string | null) => GET(request('GET', token), params())],
  ['DELETE', () => DELETE(request('DELETE'), params()), (token: string | null) => DELETE(request('DELETE', token), params())],
] as const)('%s: porten', (_method, run, withToken) => {
  it('uten nøkkel: 401', async () => {
    expect((await withToken(null)).status).toBe(401);
    expect(core.deleteCupCore).not.toHaveBeenCalled();
  });

  it('en som ikke styrer cupen: 403, og ingenting skjer', async () => {
    allow(false);
    const res = await withToken('token-fremmed');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_manager' });
    expect(core.deleteCupCore).not.toHaveBeenCalled();
    expect(core.planTournamentGameDeletion).not.toHaveBeenCalled();
  });

  it('ingen slik cup: 404', async () => {
    row = null;
    expect((await run()).status).toBe(404);
    expect(core.deleteCupCore).not.toHaveBeenCalled();
  });
});

describe('GET', () => {
  it('sier hva som følger med: vertene og singlene som rir med', async () => {
    const res = await GET(request('GET'), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      name: 'Klubbmesterskapet',
      team1Name: 'Team Nord',
      team2Name: 'Team Sør',
      draft: true,
      matchCount: 3,
      keptCount: 0,
    });
  });

  it('en startet cup er ikke et utkast', async () => {
    row = cup('active');
    expect((await (await GET(request('GET'), params())).json()).draft).toBe(false);
  });

  it('en feil i planen er 500', async () => {
    core.planTournamentGameDeletion.mockRejectedValue(new Error('nede'));
    const res = await GET(request('GET'), params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'load_failed' });
  });

  it('en lesefeil på cupen er 500, ikke «finnes ikke»', async () => {
    readError = { message: 'nede' };
    const res = await GET(request('GET'), params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'load_failed' });
  });

  it('spilte kamper som blir stående, telles for seg', async () => {
    core.planTournamentGameDeletion.mockResolvedValue({ hostIdsToDelete: ['a'], derivedIdsRidingAlong: [], totalGames: 3 });
    expect(await (await GET(request('GET'), params())).json()).toMatchObject({ matchCount: 1, keptCount: 2 });
  });
});

describe('DELETE', () => {
  it('sletter et utkast med kallerens egen klient, og gir navnet tilbake', async () => {
    const res = await DELETE(request('DELETE'), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, name: 'Klubbmesterskapet' });
    expect(core.deleteCupCore).toHaveBeenCalledWith(caller, CUP);
    expect(core.revalidateCupDeleted).toHaveBeenCalledWith(CUP, 'klubb');
  });

  it.each(['active', 'finished'])('en cup med status %s: 409, og kjernen kalles ikke', async (status) => {
    row = cup(status);
    const res = await DELETE(request('DELETE'), params());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'not_draft' });
    expect(core.deleteCupCore).not.toHaveBeenCalled();
  });

  it('kjernen sier nei: 500, og ingen kvittering for en sletting som ikke skjedde', async () => {
    core.deleteCupCore.mockResolvedValue({ ok: false, error: 'delete_failed' });
    const res = await DELETE(request('DELETE'), params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'delete_failed' });
    expect(core.revalidateCupDeleted).not.toHaveBeenCalled();
  });

  it('kjernen ser ikke raden ruta nettopp så: 500, for appen regner 404 som slettet', async () => {
    core.deleteCupCore.mockResolvedValue({ ok: false, error: 'not_found' });
    const res = await DELETE(request('DELETE'), params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'delete_failed' });
  });

  it('en lesefeil på cupen er 500, så appen ikke tror den er borte', async () => {
    readError = { message: 'nede' };
    const res = await DELETE(request('DELETE'), params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'delete_failed' });
    expect(core.deleteCupCore).not.toHaveBeenCalled();
  });

  it('kaster noe: 500', async () => {
    core.deleteCupCore.mockRejectedValue(new Error('nede'));
    const res = await DELETE(request('DELETE'), params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'delete_failed' });
  });
});
