// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type A (#2752): «Cupene dine» på Hjem. `getRoomCups` og `getMyCupIds` har egne
 * suiter; her står porten og hva raden får vite: ingen poeng, bare fremdriften.
 */

const ME = '11111111-1111-4111-8111-111111111111';

const fake = createAdminClientMock({
  tokens: { 'token-meg': ME },
  respond: () => {
    throw new Error('ruta leser ingenting selv med admin-klienten');
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('@/lib/api/appAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/appAuth')>();
  return { ...actual, callerScopedClient: () => buildSupabaseMock([]) };
});

const getMyCupIds = vi.fn();
vi.mock('@/lib/cup/myCups', () => ({ getMyCupIds: (...args: unknown[]) => getMyCupIds(...args) }));
const getRoomCups = vi.fn();
vi.mock('@/lib/cup/getRoomCups', () => ({ getRoomCups: (...args: unknown[]) => getRoomCups(...args) }));

const createTournamentDraftCore = vi.fn();
vi.mock('@/lib/cup/setupCore', () => ({
  createTournamentDraftCore: (...args: unknown[]) => createTournamentDraftCore(...args),
  revalidateCupSetup: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const call = (token?: string) =>
  GET(
    new NextRequest('http://localhost/api/cup', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  getMyCupIds.mockResolvedValue({ ok: true, ids: ['a'], playing: ['a'] });
});

describe('POST /api/cup', () => {
  const body = { name: 'Klubbmesterskapet', team1Name: 'Team Nord', team2Name: 'Team Sør', winPoints: '', tiePoints: '' };
  const post = (token: string | undefined, payload: unknown = body) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    return POST(new NextRequest('http://localhost/api/cup', { method: 'POST', headers, body: JSON.stringify(payload) }));
  };

  it('uten token: 401, og ingenting skrives', async () => {
    expect((await post(undefined)).status).toBe(401);
    expect(createTournamentDraftCore).not.toHaveBeenCalled();
  });

  it('lager en personlig cup, skapt av kalleren, med nettets standard', async () => {
    createTournamentDraftCore.mockResolvedValue({ ok: true, id: 'ny' });

    const res = await post('token-meg');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: 'ny' });
    const args = createTournamentDraftCore.mock.calls[0][1];
    expect(args.userId).toBe(ME);
    expect(args.groupId).toBeNull();
    expect(args.values).toMatchObject({ name: 'Klubbmesterskapet', team1: 'Team Nord', team2: 'Team Sør' });
    expect(args.values.winPoints).toBeUndefined();
    expect(args.values.fourballAllowance).toBeGreaterThan(0);
  });

  it('en klubb i kroppen gjør ingenting: klubb-cuper lages på nettet', async () => {
    createTournamentDraftCore.mockResolvedValue({ ok: true, id: 'ny' });
    await post('token-meg', { ...body, groupId: 'klubb', group_id: 'klubb' });
    expect(createTournamentDraftCore.mock.calls[0][1].groupId).toBeNull();
  });

  it.each([
    ['cup_name', { name: '   ' }],
    ['cup_team_1', { team1Name: '' }],
    ['cup_team_2', { team2Name: '' }],
    ['cup_team_dup', { team2Name: 'team nord' }],
    ['cup_win_points', { winPoints: '0' }],
    ['cup_tie_points', { tiePoints: '-1' }],
  ])('%s: 409 før noe skrives', async (error, patch) => {
    const res = await post('token-meg', { ...body, ...patch });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error });
    expect(createTournamentDraftCore).not.toHaveBeenCalled();
  });

  it('en kropp uten navn: 400', async () => {
    expect((await post('token-meg', { team1Name: 'A' })).status).toBe(400);
  });

  it('skrivingen feiler: 500', async () => {
    createTournamentDraftCore.mockResolvedValue({ ok: false, error: 'cup_insert_failed' });
    const res = await post('token-meg');
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'cup_insert_failed' });
  });
});

describe('GET /api/cup', () => {
  it('uten token: 401 før noe leses', async () => {
    const res = await call();

    expect(res.status).toBe(401);
    expect(getMyCupIds).not.toHaveBeenCalled();
  });

  it('gir cupene som ikke er avsluttet, med navn, status og fremdrift, og spør for kalleren', async () => {
    getRoomCups.mockResolvedValue({
      ok: true,
      finishedCount: 2,
      recentFinished: [],
      live: [
        { id: 'a', name: 'Cup a', status: 'active', created_by: 'x', group_id: null, playing: true, progress: { played: 3, total: 8 } },
        { id: 'b', name: 'Cup b', status: 'draft', created_by: ME, group_id: null, playing: false, progress: { played: 0, total: 0 } },
      ],
    });

    const res = await call('token-meg');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      cups: [
        { id: 'a', name: 'Cup a', status: 'active', progress: { played: 3, total: 8 } },
        { id: 'b', name: 'Cup b', status: 'draft', progress: { played: 0, total: 0 } },
      ],
    });
    expect(getMyCupIds.mock.calls[0][1]).toBe(ME);
  });

  it('de siste ferdige står under de aktive, uten fremdrift (eierens svar 02.11)', async () => {
    getRoomCups.mockResolvedValue({
      ok: true,
      finishedCount: 5,
      recentFinished: [
        { id: 'ny', name: 'Høstcupen' },
        { id: 'gammel', name: 'Sommercupen' },
      ],
      live: [
        { id: 'a', name: 'Cup a', status: 'active', created_by: 'x', group_id: null, playing: true, progress: { played: 3, total: 8 } },
      ],
    });

    const res = await call('token-meg');

    await expect(res.json()).resolves.toEqual({
      cups: [
        { id: 'a', name: 'Cup a', status: 'active', progress: { played: 3, total: 8 } },
        { id: 'ny', name: 'Høstcupen', status: 'finished', progress: null },
        { id: 'gammel', name: 'Sommercupen', status: 'finished', progress: null },
      ],
    });
  });

  it('en feilet lesing er 500, ikke en tom liste', async () => {
    getRoomCups.mockResolvedValue({ ok: false });

    const res = await call('token-meg');

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'load_failed' });
  });
});
