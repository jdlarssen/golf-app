import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';

/**
 * #2293: a failed read on the signups page goes to the error boundary. Before,
 * it logged and rendered the empty tab («Ingen påmeldinger venter …») with every
 * counter at 0, so the organiser believed nobody had signed up. Same rule as the
 * game read just above it (#1441: error ≠ absence).
 *
 * Query order:
 *   serverMock[0]: games.select(...).eq.maybeSingle
 *   adminMock[0]:  game_registration_requests.select(...).eq.eq.order.returns
 *   serverMock[1]: game_registration_requests.select(status).eq.returns  (counts)
 */

let serverMock: ReturnType<typeof buildSupabaseMock>;
let adminMock: ReturnType<typeof buildSupabaseMock>;

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => serverMock,
}));
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));
vi.mock('@/lib/admin/auth', () => ({
  requireAdminOrCreator: async () => ({ userId: 'admin-1', isAdmin: true }),
}));

const GAME = {
  id: 'game-1',
  name: 'Vårcupen',
  short_id: 'abc123',
  status: 'scheduled',
  registration_mode: 'manual_approval',
  registration_type: 'solo',
  game_mode: 'stableford',
  mode_config: { team_size: 1 },
  courses: { name: 'Bogstad' },
};

const BOOM = { message: 'boom' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PåmeldingerPage', () => {
  it.each<{ failing: string; requests: QueryResult; counts: QueryResult }>([
    {
      failing: 'forespørslene',
      requests: { data: null, error: BOOM },
      counts: { data: [], error: null },
    },
    {
      failing: 'tellingen',
      requests: { data: [], error: null },
      counts: { data: null, error: BOOM },
    },
  ])('lesefeil på $failing kaster i stedet for å vise tomtilstand', async ({ requests, counts }) => {
    serverMock = buildSupabaseMock([{ data: GAME, error: null }, counts]);
    adminMock = buildSupabaseMock([requests]);

    const { default: PåmeldingerPage } = await import('./page');
    await expect(
      PåmeldingerPage({
        params: Promise.resolve({ id: 'game-1' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toBe(BOOM);
  });
});
