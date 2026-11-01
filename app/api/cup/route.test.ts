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

import { NextRequest } from 'next/server';
import { GET } from './route';

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

  it('en feilet lesing er 500, ikke en tom liste', async () => {
    getRoomCups.mockResolvedValue({ ok: false });

    const res = await call('token-meg');

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'load_failed' });
  });
});
