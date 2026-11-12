// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2838): rutas port for terminlista i appen. Reglene (hvilke runder,
 * knapp, seter) har egne suiter; her står at id-en bare kommer fra tokenet, at
 * ruta leser det nettsiden leser, og at en feil blir 500 appen viser.
 */

const ME = '11111111-1111-4111-8111-111111111111';

const fake = createAdminClientMock({
  tokens: { 'token-meg': ME },
  respond: () => {
    throw new Error('ruta leser ikke selv med admin-klienten');
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

const getDiscoverableGames = vi.fn();
vi.mock('@/lib/games/getDiscoverableGames', () => ({
  getDiscoverableGames: (...args: unknown[]) => getDiscoverableGames(...args),
}));
const getGamesSocialProof = vi.fn();
vi.mock('@/lib/games/getGameSocialProof', () => ({
  getGamesSocialProof: (...args: unknown[]) => getGamesSocialProof(...args),
}));
const getRegistrationSeats = vi.fn();
vi.mock('@/lib/games/getRegistrationSeats', () => ({
  getRegistrationSeats: (...args: unknown[]) => getRegistrationSeats(...args),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

async function call(token?: string, query = '') {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await GET(new NextRequest(`http://localhost/api/terminliste${query}`, { headers }));
  return { status: res.status, body: await res.json() };
}

const OPEN = {
  id: 'o1',
  name: 'Åpen runde',
  short_id: 'open0001',
  scheduled_tee_off_at: '2026-11-14T07:20:00Z',
  course_name: 'Byneset North',
  registration_mode: 'open',
  game_mode: 'stableford',
  mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
  hole_segment: 'full',
  start_type: 'first_tee',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getDiscoverableGames.mockResolvedValue({
    clubGames: [],
    friendGames: [],
    openGames: [OPEN],
    pendingRequests: [],
  });
  getGamesSocialProof.mockResolvedValue({});
  getRegistrationSeats.mockResolvedValue(new Map());
});

describe('GET /api/terminliste', () => {
  it('401 without a token, and nothing is read', async () => {
    expect({
      ...(await call()),
      read: getDiscoverableGames.mock.calls.length,
    }).toEqual({ status: 401, body: { error: 'unauthorized' }, read: 0 });
  });

  it('401 with a token the auth server does not know', async () => {
    expect((await call('token-ukjent')).status).toBe(401);
    expect(getDiscoverableGames).not.toHaveBeenCalled();
  });

  it('reads the list of the token’s user only, whatever the query says', async () => {
    const res = await call('token-meg', '?userId=99999999-9999-4999-8999-999999999999&user_id=x');
    expect({
      status: res.status,
      list: getDiscoverableGames.mock.calls,
      proof: getGamesSocialProof.mock.calls[0],
    }).toEqual({
      status: 200,
      list: [[ME]],
      proof: [['o1'], ME],
    });
  });

  it('answers with the rows, each with its button and format', async () => {
    const { body } = await call('token-meg');
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({
      id: 'o1',
      source: 'open',
      cta: 'direct',
      full: false,
      modeLabel: 'Stableford',
      teamSize: 1,
      socialProof: null,
    });
    expect(body.pendingRequests).toEqual([]);
  });

  it('carries no e-mail address', async () => {
    expect(JSON.stringify((await call('token-meg')).body)).not.toContain('@');
  });

  it('a failed read is 500 load_failed', async () => {
    getDiscoverableGames.mockRejectedValueOnce(new Error('boom'));
    expect(await call('token-meg')).toEqual({ status: 500, body: { error: 'load_failed' } });
  });
});
