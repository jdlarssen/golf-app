import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';
import type { LeagueFlight } from './leagueFlight';

/**
 * #2815: the door to a card behind a cell in the season table. A league
 * mate is usually not in the flight, and RLS shows a finished game only to
 * its players (#1542), so the card is read past RLS behind this gate: the
 * caller must see the league (`canViewLeague`, run for real here as the
 * caller), and the card must be one the table counts (`countingCards`).
 * Everything else is «not found»; a failed read throws.
 */

let admin: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => admin }));
vi.mock('@/lib/league/leagueFlight');

import { readLeagueFlight } from './leagueFlight';
import { leagueCardAccess, loadLeagueCard } from './leagueCardAccess';

const FLIGHT: LeagueFlight = {
  gameId: 'g1',
  roundId: 'r1',
  roundLabel: 'Runde 1',
  leagueId: 'l1',
  leagueName: 'Vinterliga',
  isSimulator: false,
  leagueCreatorId: 'org',
};
const card = (userId: string, over: Record<string, unknown> = {}) => ({
  user_id: userId,
  course_handicap: 2,
  tee_gender: 'mens',
  submitted_at: '2026-11-10T19:00:00Z',
  approved_at: null,
  withdrawn_at: null,
  users: { name: userId === 'anders' ? 'Anders Berg' : 'Mia Lie', nickname: null },
  ...over,
});

/**
 * The service-role reads: the league, the caller's own participant row, the
 * flight and its cards. `groupId` makes it a club league.
 */
function reads(opts: {
  groupId?: string | null;
  participant?: boolean;
  status?: string;
  anders?: Record<string, unknown>;
  leagueError?: boolean;
} = {}) {
  const byTable: Record<string, QueryResult[]> = {
    leagues: [
      opts.leagueError
        ? { data: null, error: { message: 'boom' } }
        : { data: { group_id: opts.groupId ?? null, format: 'stroke', scoring: 'net' } },
    ],
    league_players: [{ data: opts.participant ? { user_id: 'caller' } : null }],
    games: [{ data: { status: opts.status ?? 'finished', course_id: 'c1', tee_box_id: 't1' } }],
    game_players: [{ data: [card('anders', opts.anders), card('mia')] }],
  };
  admin = buildSupabaseMock([], {}, { byTable });
}

/** The caller's own reads in `canViewLeague`: club membership and is_admin. */
function caller(opts: { member?: boolean; isAdmin?: boolean } = {}) {
  return buildSupabaseMock([], {}, {
    byTable: {
      group_members: [{ data: opts.member ? { user_id: 'caller' } : null }],
      users: [{ data: { is_admin: opts.isAdmin ?? false } }],
    },
  }) as unknown as SupabaseClient<Database>;
}

const ask = (client: SupabaseClient<Database>, over: Partial<{ leagueId: string; playerUserId: string }> = {}) =>
  leagueCardAccess(client, {
    callerId: 'caller',
    leagueId: over.leagueId ?? 'l1',
    gameId: 'g1',
    playerUserId: over.playerUserId ?? 'anders',
  });

beforeEach(() => {
  vi.mocked(readLeagueFlight).mockResolvedValue(FLIGHT);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('leagueCardAccess — who may see the card', () => {
  it.each([
    ['a participant of a club league', { groupId: 'club', participant: true }, {}],
    ['a club member who is not a participant', { groupId: 'club' }, { member: true }],
    ['a global admin outside the club', { groupId: 'club' }, { isAdmin: true }],
    ['any signed-in user in a league without a club', { groupId: null }, {}],
  ])('%s sees a counted card', async (_label, league, who) => {
    reads(league);
    const access = await ask(caller(who));
    expect(access).toMatchObject({
      ok: true,
      flight: { leagueId: 'l1', roundLabel: 'Runde 1' },
      format: 'stroke',
      metric: 'net',
      card: { user_id: 'anders' },
    });
  });

  it('someone outside the club of a club league gets «not found»', async () => {
    reads({ groupId: 'club' });
    expect(await ask(caller())).toEqual({ ok: false, reason: 'not_found' });
  });

  it('a card from another league than the one in the address is «not found»', async () => {
    reads();
    expect(await ask(caller(), { leagueId: 'l2' })).toEqual({ ok: false, reason: 'not_found' });
  });

  it('a game that is not a league flight is «not found»', async () => {
    vi.mocked(readLeagueFlight).mockResolvedValue(null);
    reads();
    expect(await ask(caller())).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('leagueCardAccess — only a card the table counts', () => {
  it.each([
    ['a withdrawn card', { anders: { withdrawn_at: '2026-11-10T18:00:00Z' } }],
    ['a card not delivered', { anders: { submitted_at: null } }],
    ['a flight not finished', { status: 'active' }],
    ['a player not in the flight', {}, 'kari'],
  ])('%s is «not found»', async (_label, opts, player = 'anders') => {
    reads(opts);
    expect(await ask(caller(), { playerUserId: player })).toEqual({ ok: false, reason: 'not_found' });
  });

  it('in a simulator league a card the marker has not approved is «not found»; an approved one is shown', async () => {
    vi.mocked(readLeagueFlight).mockResolvedValue({ ...FLIGHT, isSimulator: true });
    reads();
    expect(await ask(caller())).toEqual({ ok: false, reason: 'not_found' });
    reads({ anders: { approved_at: '2026-11-10T20:00:00Z' } });
    expect(await ask(caller())).toMatchObject({ ok: true, card: { user_id: 'anders' } });
  });
});

describe('leagueCardAccess — a failed read', () => {
  it('throws, never «not found»', async () => {
    reads({ leagueError: true });
    await expect(ask(caller())).rejects.toThrow();
  });
});

describe('loadLeagueCard', () => {
  it("builds the card on the league's axis: the value the table shows, the strokes, the handicap", async () => {
    reads();
    const access = await ask(caller());
    if (!access.ok) throw new Error('expected access');
    // Three holes, par 4-4-3 for men, SI 1-3; Anders plays 5-5-4 off 2.
    admin = buildSupabaseMock([], {}, {
      byTable: {
        course_holes: [
          {
            data: [1, 2, 3].map((n) => ({
              hole_number: n,
              par_mens: n === 3 ? 3 : 4,
              par_ladies: n === 3 ? 3 : 4,
              par_juniors: n === 3 ? 3 : 4,
              stroke_index: n,
            })),
          },
        ],
        tee_boxes: [{ data: { par_total_mens: 11, par_total_ladies: 11, par_total_juniors: 11 } }],
        scores: [{ data: [5, 5, 4].map((strokes, i) => ({ hole_number: i + 1, strokes })) }],
      },
    });
    const loaded = await loadLeagueCard(access);
    expect(loaded && {
      card: { ...loaded.card, grid: undefined },
      totals: loaded.card.grid.totals,
      holes: loaded.holes.length,
    }).toEqual({
      card: {
        leagueId: 'l1',
        leagueName: 'Vinterliga',
        roundLabel: 'Runde 1',
        gameId: 'g1',
        player: { userId: 'anders', name: 'Anders Berg' },
        format: 'stroke',
        axis: 'net',
        playingHandicap: 2,
        value: 1,
        grid: undefined,
      },
      totals: { played: 3, holeCount: 3, brutto: 14, netto: 12, points: null },
      holes: 3,
    });
  });

  it('no card when the table has none for the player (an incomplete card)', async () => {
    reads();
    const access = await ask(caller());
    if (!access.ok) throw new Error('expected access');
    admin = buildSupabaseMock([], {}, {
      byTable: {
        course_holes: [{ data: [1, 2].map((n) => ({ hole_number: n, par_mens: 4, par_ladies: 4, par_juniors: 4, stroke_index: n })) }],
        tee_boxes: [{ data: { par_total_mens: 8, par_total_ladies: 8, par_total_juniors: 8 } }],
        scores: [{ data: [{ hole_number: 1, strokes: 5 }] }],
      },
    });
    expect(await loadLeagueCard(access)).toBeNull();
  });
});
