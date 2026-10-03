// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2333): «Eksporter mine data» feiler lukket.
 *
 * Det som bevises: hver lesing som feiler gir 500 uten `Content-Disposition`
 * (ingen halv fil som ser hel ut), en manglende brukerrad gir 500 i stedet for
 * en stille `.eq('email', '')`, og klubb-lesingen er filtrert på brukeren selv
 * — RLS lar et medlem se hele klubbens medlemsliste, så filteret er authz-en.
 *
 * Admin- og request-klienten deler én dobbel; tabellen skiller dem. `respond`
 * kaster på alt den ikke kjenner igjen, så en uventet spørring blir rød.
 */

const USER = 'meg-selv';
const EMAIL = 'meg@example.test';

type Read =
  | 'users'
  | 'game_players'
  | 'scores'
  | 'invitations_email'
  | 'invitations_inviter'
  | 'friendships'
  | 'group_members';

let state: {
  userId: string | null;
  userRow: Record<string, unknown> | null;
  failing: Read | null;
  adminThrows: boolean;
};

const hasEq = (op: QueryOp, column: string, value: unknown) =>
  op.filters.some((f) => f.op === 'eq' && f.column === column && f.value === value);

function classify(op: QueryOp): Read {
  if (op.kind !== 'select') throw new Error(`uventet ${op.kind} ${op.table}`);
  if (op.table === 'users' && hasEq(op, 'id', USER)) return 'users';
  if (op.table === 'game_players' && hasEq(op, 'user_id', USER)) return 'game_players';
  if (op.table === 'scores') return 'scores';
  if (op.table === 'invitations' && hasEq(op, 'email', EMAIL)) return 'invitations_email';
  if (op.table === 'invitations' && hasEq(op, 'invited_by', USER)) return 'invitations_inviter';
  if (op.table === 'friendships') return 'friendships';
  if (op.table === 'group_members' && hasEq(op, 'user_id', USER)) return 'group_members';
  throw new Error(`uventet spørring: ${op.table} ${JSON.stringify(op.filters)}`);
}

const ROWS: Record<Exclude<Read, 'users'>, unknown[]> = {
  game_players: [{ game_id: 'g1', user_id: USER }],
  scores: [{ id: 's1', user_id: USER }],
  invitations_email: [{ id: 'i1', email: EMAIL }],
  invitations_inviter: [{ id: 'i2', invited_by: USER }],
  friendships: [{ id: 'f1', requester_id: USER, addressee_id: 'venn', status: 'accepted' }],
  group_members: [{ group_id: 'k1', role: 'member', joined_at: '2026-10-02', groups: { name: 'Klubb' } }],
};

function respond(op: QueryOp): QueryResponse {
  const read = classify(op);
  if (state.failing === read) return { data: null, error: { message: `${read} failed` } };
  if (read === 'users') return { data: state.userRow };
  return { data: ROWS[read] };
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => {
    if (state.adminThrows) throw new Error('SUPABASE_SERVICE_ROLE_KEY mangler');
    return fake.client;
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => fake.client,
}));
vi.mock('@/lib/auth/userId', () => ({
  getProxyVerifiedUserId: async () => state.userId,
}));

import { GET } from './route';

beforeEach(() => {
  fake.reset();
  state = {
    userId: USER,
    userRow: { id: USER, email: EMAIL, name: 'Meg Selv' },
    failing: null,
    adminThrows: false,
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

async function expectFailedClosed(res: Response) {
  expect(res.status).toBe(500);
  expect(res.headers.get('Content-Disposition')).toBeNull();
  const body = await res.json();
  expect(typeof body.error).toBe('string');
}

describe('GET /profile/export', () => {
  it('uinnlogget → 401 uten at databasen røres', async () => {
    state.userId = null;

    const res = await GET();

    expect(res.status).toBe(401);
    expect(fake.ops).toEqual([]);
  });

  it.each<Read>([
    'users',
    'game_players',
    'scores',
    'invitations_email',
    'invitations_inviter',
    'friendships',
    'group_members',
  ])('lesefeil på %s → 500 og ingen fil', async (read) => {
    state.failing = read;

    await expectFailedClosed(await GET());
  });

  it('brukerraden mangler → 500, ikke en invitasjonslesing på tom e-post', async () => {
    state.userRow = null;

    await expectFailedClosed(await GET());
    expect(fake.ops.some((op) => hasEq(op, 'email', ''))).toBe(false);
  });

  it('admin-klienten kaster → 500, ikke et ufanget kast', async () => {
    state.adminThrows = true;

    await expectFailedClosed(await GET());
  });

  it('lykkesti → 200 med fil som har venner og klubber, filtrert på brukeren', async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="torny-data-/);
    const body = await res.json();
    expect(body.friendships).toEqual(ROWS.friendships);
    expect(body.club_memberships).toEqual(ROWS.group_members);

    const clubOp = fake.ops.find((op) => op.table === 'group_members');
    expect(clubOp?.filters).toContainEqual({ op: 'eq', column: 'user_id', value: USER });
    const emailOp = fake.ops.find((op) => op.table === 'invitations' && hasEq(op, 'email', EMAIL));
    expect(emailOp).toBeDefined();
  });
});
