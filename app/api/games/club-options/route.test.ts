// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2753): the gate on `GET /api/games/club-options` and what it may
 * hand out. The rule itself is tested in `appClubOptionsView.test.ts`.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const CLUB = 'c1111111-1111-4111-8111-111111111111';

let isAdmin = false;
let profileFails = false;
let ownRows: unknown[] = [];
const fake = createAdminClientMock({
  tokens: { 'token-meg': ME },
  respond: (op: QueryOp) => {
    if (op.table === 'users') {
      return profileFails ? { data: null, error: { message: 'nede' } } : { data: { is_admin: isAdmin } };
    }
    if (op.table === 'group_members') return { data: ownRows };
    throw new Error(`uventet spørring mot ${op.table}`);
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

const isClubAdminAnywhere = vi.fn();
vi.mock('@/lib/clubs/isClubAdminAnywhere', () => ({
  isClubAdminAnywhere: (...args: unknown[]) => isClubAdminAnywhere(...args),
}));
const getClubMemberPlayerOptions = vi.fn();
vi.mock('@/lib/clubs/getClubMemberPlayerOptions', () => ({
  getClubMemberPlayerOptions: (...args: unknown[]) => getClubMemberPlayerOptions(...args),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const call = (token?: string) =>
  GET(
    new NextRequest('http://localhost/api/games/club-options', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );

const option = (id: string, name: string) => ({
  id,
  name,
  nickname: null,
  hcp_index: 12,
  pending: false,
  gender: 'mens',
  level: 'normal',
});

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  isAdmin = false;
  profileFails = false;
  ownRows = [{ role: 'admin', groups: { id: CLUB, name: 'Byneset GK', valid_until: null } }];
  isClubAdminAnywhere.mockResolvedValue(true);
  getClubMemberPlayerOptions.mockResolvedValue({
    memberIdsByClub: { [CLUB]: [ME, 'u2'], fremmed: ['u9'] },
    options: [option(ME, 'Meg'), option('u2', 'Ada'), option('u9', 'Fremmed')],
  });
});

describe('GET /api/games/club-options', () => {
  it('uten token: 401, og ingenting leses', async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(fake.ops).toHaveLength(0);
    expect(isClubAdminAnywhere).not.toHaveBeenCalled();
  });

  it('med ugyldig token: 401', async () => {
    expect((await call('token-falsk')).status).toBe(401);
  });

  it('en bruker uten klubbrolle får canCreateClubGame: false og ingen medlemmer', async () => {
    isClubAdminAnywhere.mockResolvedValue(false);
    ownRows = [{ role: 'member', groups: { id: CLUB, name: 'Byneset GK', valid_until: null } }];
    const res = await call('token-meg');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ canCreateClubGame: false, clubs: [], membersByClub: {} });
  });

  it('en klubbadmin får klubben og medlemmene, aldri en fremmed klubbs', async () => {
    const body = await (await call('token-meg')).json();
    expect(body.canCreateClubGame).toBe(true);
    expect(body.clubs).toEqual([{ id: CLUB, name: 'Byneset GK', role: 'admin', memberCount: 2 }]);
    expect(Object.keys(body.membersByClub)).toEqual([CLUB]);
    expect(body.membersByClub[CLUB].map((m: { id: string }) => m.id)).toEqual(['u2', ME]);
    expect(JSON.stringify(body)).not.toContain('Fremmed');
  });

  it('oppslagene gjelder kalleren fra tokenet', async () => {
    await call('token-meg');
    expect(isClubAdminAnywhere).toHaveBeenCalledWith(ME);
    expect(getClubMemberPlayerOptions).toHaveBeenCalledWith(ME);
    const own = fake.ops.find((op) => op.table === 'group_members');
    expect(own?.filters).toContainEqual({ op: 'eq', column: 'user_id', value: ME });
  });

  it('en utløpt klubb gir ikke flisen', async () => {
    isClubAdminAnywhere.mockResolvedValue(false);
    ownRows = [{ role: 'owner', groups: { id: CLUB, name: 'Byneset GK', valid_until: '2020-01-01' } }];
    const body = await (await call('token-meg')).json();
    expect(body.canCreateClubGame).toBe(false);
  });

  it('feiler profil-lesingen: 500 load_failed', async () => {
    profileFails = true;
    const res = await call('token-meg');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'load_failed' });
  });
});
