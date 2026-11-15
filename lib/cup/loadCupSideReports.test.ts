// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';
import type { CupSideAwardSnapshot } from './cupSideAwardSnapshot';

/**
 * Type A (#2283, E1): the read behind «Meldt inn fra kampene» in the cup's
 * «Etter runden». The claim tables show a player only their own flight, so the
 * read goes through the admin client; the caller's cup gate is the
 * enforcement. A failed read must leave the organiser able to register.
 */

let tables: Record<string, unknown[]> = {};
let failTable: string | null = null;
let adminThrows = false;

function respond(op: QueryOp): QueryResponse {
  if (op.table === failTable) return { data: null, error: { message: 'boom' } };
  return { data: tables[op.table] ?? [], error: null };
}
const fake = createAdminClientMock({ tokens: {}, respond });

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => {
    if (adminThrows) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    return fake.client;
  },
}));

const { loadCupSideReports } = await import('./loadCupSideReports');

const ctp = (holeNumber: number): CupSideAwardSnapshot => ({
  id: `ctp-${holeNumber}`,
  kind: 'ctp',
  holeNumber,
  points: 2,
  slot: 1,
  slotCount: 1,
  winnerUserId: null,
  winnerTeam: null,
  noWinner: false,
});
const girAward = (holeNumber: number): CupSideAwardSnapshot => ({
  id: `gir-${holeNumber}`,
  kind: 'gir',
  holeNumber,
  points: 1.5,
  maxPerTeam: 2,
  team1Count: null,
  team2Count: null,
});

const player = (game_id: string, user_id: string, name: string, team_number: 1 | 2) => ({
  game_id,
  user_id,
  team_number,
  withdrawn_at: null,
  users: { name, nickname: null },
});

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tables = {
    games: [
      { id: 'g1', status: 'active', game_mode: 'fourball_matchplay', tournament_match_label: 'Four-ball 1', hole_segment: 'full', source_game_id: null },
      { id: 'g2', status: 'active', game_mode: 'fourball_matchplay', tournament_match_label: 'Four-ball 2', hole_segment: 'full', source_game_id: null },
    ],
    game_players: [
      player('g1', 'jonas', 'Jonas Berg', 1),
      player('g1', 'tore', 'Tore Lunde', 2),
      player('g2', 'sigrid', 'Sigrid Aas', 1),
      player('g2', 'kari', 'Kari Nilsen', 2),
    ],
    game_side_claims: [
      { game_id: 'g1', category: 'closest_to_pin', hole_number: 3, flight_number: 0, winner_user_id: 'jonas', distance_m: 2.4 },
    ],
    game_gir_claims: [
      { game_id: 'g1', hole_number: 5, user_id: 'jonas', hit: true },
      { game_id: 'g1', hole_number: 5, user_id: 'tore', hit: false },
    ],
  };
  failTable = null;
  adminThrows = false;
  fake.reset();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

const tablesRead = () => fake.ops.map((op) => op.table).sort();

describe('loadCupSideReports', () => {
  it('reads nothing when the cup has no side awards', async () => {
    const result = await loadCupSideReports({ tournamentId: 'c1', status: 'active', awards: [] });
    expect(result).toBeNull();
    expect(fake.ops).toEqual([]);
  });

  it('reads nothing before the cup has started', async () => {
    const result = await loadCupSideReports({ tournamentId: 'c1', status: 'draft', awards: [ctp(3)] });
    expect(result).toBeNull();
    expect(fake.ops).toEqual([]);
  });

  it("reads the cup's matches, players and both claim tables once, scoped to the cup's games", async () => {
    const result = await loadCupSideReports({ tournamentId: 'c1', status: 'active', awards: [ctp(3), girAward(5)] });

    expect(tablesRead()).toEqual(['game_gir_claims', 'game_players', 'game_side_claims', 'games']);
    expect(fake.ops.find((op) => op.table === 'games')?.filters).toContainEqual({
      op: 'eq',
      column: 'tournament_id',
      value: 'c1',
    });
    for (const table of ['game_players', 'game_side_claims', 'game_gir_claims']) {
      expect(fake.ops.find((op) => op.table === table)?.filters).toContainEqual({
        op: 'in',
        column: 'game_id',
        value: ['g1', 'g2'],
      });
    }
    expect(result).toEqual({
      slots: [
        {
          kind: 'ctp',
          holeNumber: 3,
          lines: [{ gameId: 'g1', matchLabel: 'Four-ball 1', name: 'Jonas', distanceM: 2.4 }],
          missing: [{ gameId: 'g2', matchLabel: 'Four-ball 2' }],
        },
      ],
      gir: [
        {
          holeNumber: 5,
          maxPerTeam: 2,
          team1: { count: 1, names: ['Jonas'], overMax: false },
          team2: { count: 0, names: [], overMax: false },
          reportedMatches: 1,
          missing: [{ gameId: 'g2', matchLabel: 'Four-ball 2' }],
        },
      ],
    });
  });

  it('reads only the claim table the awards need', async () => {
    await loadCupSideReports({ tournamentId: 'c1', status: 'active', awards: [ctp(3)] });
    expect(tablesRead()).toEqual(['game_players', 'game_side_claims', 'games']);

    fake.reset();
    await loadCupSideReports({ tournamentId: 'c1', status: 'finished', awards: [girAward(5)] });
    expect(tablesRead()).toEqual(['game_gir_claims', 'game_players', 'games']);
  });

  it.each(['games', 'game_players', 'game_side_claims', 'game_gir_claims'])(
    'a failed read of %s is a failed marker, logged and never thrown',
    async (table) => {
      failTable = table;
      const result = await loadCupSideReports({ tournamentId: 'c1', status: 'active', awards: [ctp(3), girAward(5)] });
      expect(result).toBe('failed');
      expect(errorSpy).toHaveBeenCalled();
    },
  );

  it('a client that cannot be made is a failed marker too', async () => {
    adminThrows = true;
    const result = await loadCupSideReports({ tournamentId: 'c1', status: 'active', awards: [ctp(3)] });
    expect(result).toBe('failed');
  });

  it('a cup without games reads no claims and has every award empty', async () => {
    tables.games = [];
    const result = await loadCupSideReports({ tournamentId: 'c1', status: 'active', awards: [ctp(3)] });
    expect(tablesRead()).toEqual(['games']);
    expect(result).toEqual({ slots: [{ kind: 'ctp', holeNumber: 3, lines: [], missing: [] }], gir: [] });
  });
});
