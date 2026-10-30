// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordingClient, type QueryCall } from '@/tests/queryBuilderMock';

/**
 * Type A (#2458): who gets the tee-off `.ics`. The receipt after «Publiser»
 * offers «Legg i kalenderen» to the organiser, also one who does not play, so
 * the route lets the game's creator in next to admin and the players. Anyone
 * else, and a draft, get the same 404 as a game that does not exist.
 */

const GAME_ID = 'game-1';

let state: {
  userId: string | null;
  isAdmin: boolean;
  status: string;
  createdBy: string | null;
  roster: string[];
};

const db = recordingClient((calls: QueryCall[]) => {
  const table = calls.find((c) => c[0] === 'from')?.[1];
  if (table === 'users') return { data: { is_admin: state.isAdmin }, error: null };
  if (table === 'courses') return { data: { name: 'Byneset' }, error: null };
  throw new Error(`unexpected query on ${String(table)}`);
});

vi.mock('@/lib/supabase/server', () => ({ getServerClient: async () => db.client }));
vi.mock('@/lib/auth/userId', () => ({ getProxyVerifiedUserId: async () => state.userId }));
vi.mock('@/lib/games/getGameWithPlayers', () => ({
  getGameWithPlayers: async () => ({
    game: {
      id: GAME_ID,
      name: 'Lørdagsrunden',
      status: state.status,
      created_by: state.createdBy,
      course_id: 'course-1',
      scheduled_tee_off_at: '2027-05-01T07:00:00Z',
    },
    players: state.roster.map((user_id) => ({ user_id })),
  }),
}));

const { GET } = await import('./route');

function call() {
  return GET(new Request(`https://tornygolf.no/no/games/${GAME_ID}/calendar`), {
    params: Promise.resolve({ locale: 'no', id: GAME_ID }),
  });
}

beforeEach(() => {
  state = { userId: 'org', isAdmin: false, status: 'scheduled', createdBy: 'org', roster: ['p1', 'p2'] };
});

describe('GET /games/[id]/calendar', () => {
  it.each<[string, Partial<typeof state>, number]>([
    ['the organiser who is not on the list', { userId: 'org' }, 200],
    ['a player on the list', { userId: 'p1' }, 200],
    ['an admin', { userId: 'admin', isAdmin: true }, 200],
    ['someone else signed in', { userId: 'stranger' }, 404],
    ['the organiser of a draft', { userId: 'org', status: 'draft' }, 404],
    ['a game without an organiser, for someone else', { userId: 'stranger', createdBy: null }, 404],
    ['nobody signed in', { userId: null }, 401],
  ])('%s', async (_label, patch, expected) => {
    Object.assign(state, patch);
    const res = await call();
    expect(res.status).toBe(expected);
    if (expected === 200) {
      expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
      expect(await res.text()).toContain('BEGIN:VCALENDAR');
    }
  });
});
