// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';
import { emailMatchPattern } from '@/lib/supabase/emailMatch';

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
  | 'group_members'
  | 'group_join_requests'
  | NewTable;

// #2332: tabellene kjernen leste inn i tillegg. Hver er filtrert på eieren.
const NEW_TABLES = [
  'handicap_history',
  'notifications',
  'notification_preferences',
  'ai_consents',
  'kavalkades',
  'kavalkade_shares',
  'reactions',
  'idea_submissions',
  // Audit 20.11: sign-ups, league and cup rows, devices and the newsletter log.
  'game_registration_requests',
  'league_players',
  'tournament_participants',
  'cup_lineup_slots',
  'push_subscriptions',
  'apns_tokens',
  'fcm_tokens',
  'product_update_digest_recipients',
] as const;
type NewTable = (typeof NEW_TABLES)[number];
const isNewTable = (table: string): table is NewTable => (NEW_TABLES as readonly string[]).includes(table);

let state: {
  userId: string | null;
  userRow: Record<string, unknown> | null;
  failing: Read | null;
  adminThrows: boolean;
};

const hasFilter = (op: QueryOp, kind: string, column: string, value: unknown) =>
  op.filters.some((f) => f.op === kind && f.column === column && f.value === value);
const hasEq = (op: QueryOp, column: string, value: unknown) => hasFilter(op, 'eq', column, value);
const isEmailRead = (op: QueryOp) =>
  op.table === 'invitations' && hasFilter(op, 'imatch', 'email', emailMatchPattern(EMAIL));

function classify(op: QueryOp): Read {
  if (op.kind !== 'select') throw new Error(`uventet ${op.kind} ${op.table}`);
  if (op.table === 'users' && hasEq(op, 'id', USER)) return 'users';
  if (op.table === 'game_players' && hasEq(op, 'user_id', USER)) return 'game_players';
  if (op.table === 'scores') return 'scores';
  if (isEmailRead(op)) return 'invitations_email';
  if (op.table === 'invitations' && hasEq(op, 'invited_by', USER)) return 'invitations_inviter';
  if (op.table === 'friendships') return 'friendships';
  if (op.table === 'group_members' && hasEq(op, 'user_id', USER)) return 'group_members';
  if (op.table === 'group_join_requests' && hasEq(op, 'user_id', USER)) return 'group_join_requests';
  if (isNewTable(op.table) && hasEq(op, 'user_id', USER)) return op.table;
  throw new Error(`uventet spørring: ${op.table} ${JSON.stringify(op.filters)}`);
}

const ROWS: Record<Exclude<Read, 'users'>, unknown[]> = {
  game_players: [{ game_id: 'g1', user_id: USER }],
  scores: [{ id: 's1', user_id: USER }],
  invitations_email: [{ id: 'i1', email: EMAIL }],
  invitations_inviter: [{ id: 'i2', invited_by: USER }],
  friendships: [{ id: 'f1', requester_id: USER, addressee_id: 'venn', status: 'accepted' }],
  group_members: [{ group_id: 'k1', role: 'member', joined_at: '2026-10-02', groups: { name: 'Klubb' } }],
  group_join_requests: [{ id: 'r1', group_id: 'k2', user_id: USER, status: 'pending' }],
  ...Object.fromEntries(NEW_TABLES.map((table) => [table, [{ id: `${table}-1`, user_id: USER }]])),
} as Record<Exclude<Read, 'users'>, unknown[]>;

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
  vi.restoreAllMocks();
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
    'group_join_requests',
    'notifications',
    'league_players',
    'push_subscriptions',
  ])('lesefeil på %s → 500 og ingen fil', async (read) => {
    state.failing = read;

    await expectFailedClosed(await GET());
  });

  it('brukerraden mangler → 500 fra vakta, uten noen invitasjonslesing', async () => {
    state.userRow = null;

    await expectFailedClosed(await GET());
    expect(fake.ops.some((op) => op.table === 'invitations')).toBe(false);
    expect(console.error).toHaveBeenCalledWith('[profile/export] users failed', expect.anything());
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
    expect(body.club_join_requests).toEqual(ROWS.group_join_requests);
    // #2332: samme fil som appen får, med de nye tabellene.
    for (const table of NEW_TABLES) expect(body[table]).toEqual(ROWS[table]);

    const clubOp = fake.ops.find((op) => op.table === 'group_members');
    expect(clubOp?.filters).toContainEqual({ op: 'eq', column: 'user_id', value: USER });
    const friendOp = fake.ops.find((op) => op.table === 'friendships');
    expect(friendOp?.filters).toContainEqual({
      op: 'or',
      column: '',
      value: `requester_id.eq.${USER},addressee_id.eq.${USER}`,
    });
    expect(fake.ops.some(isEmailRead)).toBe(true);
  });
});
