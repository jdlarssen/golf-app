import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import type { LeagueFlight } from './leagueFlight';

/**
 * #2661: the marker's door to a simulator-league card. The rule is
 * `mayApproveAsMarker` (tested in leagueMarker.test.ts); here: the gate reads
 * the card past RLS and answers per caller, a game outside a simulator league
 * is not found, a failed read throws, and the card's state.
 */

let admin: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => admin }));
vi.mock('@/lib/league/leagueFlight');

import { readSimulatorLeagueFlight } from './leagueFlight';
import { markerReviewAccess } from './markerReviewAccess';

const FLIGHT: LeagueFlight = {
  gameId: 'g1',
  roundId: 'r1',
  roundLabel: 'Runde 3',
  leagueId: 'l1',
  leagueName: 'Vinterliga',
  isSimulator: true,
  leagueCreatorId: 'org',
};
const GAME = { name: 'Vinterliga – Runde', status: 'active', game_mode: 'stableford', course_id: 'c1', hole_segment: 'full' };
const card = (over: Record<string, unknown> = {}) => ({
  user_id: 'anders',
  submitted_at: '2026-11-10T19:00:00Z',
  approved_at: null,
  submitted_by_user_id: 'anders',
  marker_user_id: 'mia',
  withdrawn_at: null,
  tee_gender: 'mens',
  course_handicap: 12,
  users: { name: 'Anders Berg', nickname: null },
  ...over,
});

/** games, game_players, the caller's is_admin, then the marker's name. */
function reads(opts: { game?: unknown; card?: unknown; isAdmin?: boolean } = {}) {
  admin = buildSupabaseMock([
    { data: opts.game === undefined ? GAME : opts.game },
    { data: opts.card === undefined ? card() : opts.card },
    { data: { is_admin: opts.isAdmin ?? false } },
    { data: { name: 'Mia Lie', nickname: null } },
  ]);
}

beforeEach(() => {
  vi.mocked(readSimulatorLeagueFlight).mockResolvedValue(FLIGHT);
});

describe('markerReviewAccess', () => {
  it('the named marker answers a delivered card', async () => {
    reads();
    const review = await markerReviewAccess('mia', 'g1', 'anders');
    expect(review).toMatchObject({
      ok: true,
      role: 'marker',
      state: 'pending',
      card: { userId: 'anders', name: 'Anders Berg', markerName: 'Mia Lie' },
    });
  });

  it('the league organiser and a global admin answer in the marker’s stead', async () => {
    reads();
    expect(await markerReviewAccess('org', 'g1', 'anders')).toMatchObject({ ok: true, role: 'organizer' });
    reads({ isAdmin: true });
    expect(await markerReviewAccess('adm', 'g1', 'anders')).toMatchObject({ ok: true, role: 'organizer' });
  });

  it.each([
    ['the owner', 'anders'],
    ['a flightmate who is not the marker', 'kari'],
  ])('%s is refused', async (_label, caller) => {
    reads();
    expect(await markerReviewAccess(caller, 'g1', 'anders')).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('a game outside a simulator league is not found, without reading the card', async () => {
    vi.mocked(readSimulatorLeagueFlight).mockResolvedValue(null);
    admin = buildSupabaseMock([]);
    expect(await markerReviewAccess('mia', 'g1', 'anders')).toEqual({ ok: false, reason: 'not_found' });
    expect(admin.__fromCalls).toEqual([]);
  });

  it.each([
    ['approved', { approved_at: '2026-11-10T20:00:00Z' }, 'active'],
    ['not_delivered', { submitted_at: null }, 'active'],
    ['withdrawn', { withdrawn_at: '2026-11-10T20:00:00Z' }, 'active'],
    ['closed', {}, 'finished'],
  ])('the card is %s', async (state, over, status) => {
    reads({ card: card(over), game: { ...GAME, status } });
    expect(await markerReviewAccess('mia', 'g1', 'anders')).toMatchObject({ ok: true, state });
  });

  it('a failed read throws, never «no access»', async () => {
    admin = buildSupabaseMock([{ data: GAME }, { data: null, error: { message: 'connection reset' } }, { data: {} }]);
    await expect(markerReviewAccess('mia', 'g1', 'anders')).rejects.toThrow(/connection reset/);
  });
});
