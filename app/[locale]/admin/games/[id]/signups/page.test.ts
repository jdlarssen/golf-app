import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';
import { SignupCapacity } from './SignupCapacity';

/**
 * #2293: a failed read on the signups page goes to the error boundary. Before,
 * it logged and rendered the empty tab («Ingen påmeldinger venter …») with every
 * counter at 0, so the organiser believed nobody had signed up. Same rule as the
 * game read just above it (#1441: error ≠ absence).
 *
 * Query order:
 *   serverMock[0]: games.select(...).eq.maybeSingle
 *   adminMock, by table (both reads run in one Promise.all, #2288):
 *     game_registration_requests.select(...).eq.order.returns
 *     game_players.select(...).eq.returns
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
// #2201: the page marks its varsler read in after(), which has no request
// scope here. Both are boundaries for this test, not what it checks.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => {},
}));
vi.mock('@/lib/notifications/markRead', () => ({
  markReadOnVisit: async () => {},
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
  scheduled_tee_off_at: '2026-10-08T15:30:00Z',
  signups_closed_at: null,
  group_id: null,
  courses: { name: 'Bogstad' },
};

const BOOM = { message: 'boom' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function adminReads(requests: QueryResult, roster: QueryResult) {
  return buildSupabaseMock([], {}, {
    byTable: { game_registration_requests: [requests], game_players: [roster] },
  });
}

async function renderPage() {
  const { default: PåmeldingerPage } = await import('./page');
  return PåmeldingerPage({
    params: Promise.resolve({ id: 'game-1' }),
    searchParams: Promise.resolve({}),
  });
}

/** The elements `page.tsx` itself writes, walked through `props.children`. */
function findElement(node: ReactNode, type: unknown): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, type);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (node.type === type) return node;
  return findElement((node.props as { children?: ReactNode }).children, type);
}

describe('PåmeldingerPage', () => {
  it.each<{ failing: string; requests: QueryResult; roster: QueryResult }>([
    {
      failing: 'forespørslene',
      requests: { data: null, error: BOOM },
      roster: { data: [], error: null },
    },
    {
      failing: 'spillerlista',
      requests: { data: [], error: null },
      roster: { data: null, error: BOOM },
    },
  ])('lesefeil på $failing kaster i stedet for å vise tomtilstand', async ({ requests, roster }) => {
    serverMock = buildSupabaseMock([{ data: GAME, error: null }]);
    adminMock = adminReads(requests, roster);

    await expect(renderPage()).rejects.toBe(BOOM);
  });

  // #2291: the capacity line counted approved requests. It counts the roster:
  // non-withdrawn game_players rows. An approved teammate without a roster
  // row (#2061) is not «med».
  it('«med» er spillerlista, ikke godkjente forespørsler (#2291)', async () => {
    const request = (id: string, userId: string, extra: object = {}) => ({
      id,
      user_id: userId,
      status: 'approved',
      team_name: null,
      is_team_captain: false,
      team_request_id: null,
      message: null,
      rejection_reason: null,
      created_at: '2026-10-07T19:14:00Z',
      decided_at: '2026-10-07T20:00:00Z',
      users: { name: `Spiller ${id}`, nickname: null, hcp_index: 18.4 },
      ...extra,
    });
    const player = (userId: string, withdrawnAt: string | null = null) => ({
      user_id: userId,
      accepted_at: '2026-10-07T20:00:00Z',
      withdrawn_at: withdrawnAt,
      users: { name: `Spiller ${userId}`, nickname: null, hcp_index: 18.4 },
    });

    serverMock = buildSupabaseMock([
      { data: { ...GAME, game_mode: 'wolf', mode_config: null }, error: null },
    ]);
    adminMock = adminReads(
      {
        data: [
          request('r1', 'u1'),
          request('r2', 'u2'),
          // A teammate who said yes early: approved, no roster row.
          request('r3', 'u3', { team_request_id: 'gone-captain' }),
        ],
        error: null,
      },
      {
        data: [player('u1'), player('u2'), player('u9', '2026-10-08T08:00:00Z')],
        error: null,
      },
    );

    const tree = await renderPage();
    const capacity = findElement(tree, SignupCapacity);
    expect(capacity).not.toBeNull();
    expect((capacity!.props as { capacity: { taken: number } }).capacity.taken).toBe(2);
  });
});
