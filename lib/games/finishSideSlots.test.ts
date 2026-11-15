// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';
import type { FinishSideGame, FinishSidePlayer } from './finishSideSlots';

/**
 * Type A (#2283, D4): what both finish pages hand the form. The claim tables
 * show a player only their own flight, so the read goes through the admin
 * client; the page's own gate is the enforcement. A failed read must leave the
 * organiser able to finish.
 */

let claimRows: unknown[] = [];
let claimError: { message: string } | null = null;
let adminThrows = false;

function respond(op: QueryOp): QueryResponse {
  if (op.table !== 'game_side_claims') throw new Error(`reads only game_side_claims, not ${op.table}`);
  return { data: claimRows, error: claimError };
}
const fake = createAdminClientMock({ tokens: {}, respond });

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => {
    if (adminThrows) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    return fake.client;
  },
}));

const { loadSideSlotViews } = await import('./finishSideSlots');

const person = (id: string, name: string, flight: number | null, extra: Partial<FinishSidePlayer> = {}): FinishSidePlayer => ({
  user_id: id,
  flight_number: flight,
  withdrawn_at: null,
  users: { name, nickname: null },
  ...extra,
});

// Eight players in two flights: more than four active, so each flight reports under its own number.
const EIGHT: FinishSidePlayer[] = [
  person('jonas', 'Jonas Berg', 1),
  person('marte', 'Marte Lie', 1),
  person('ola', 'Ola Nordmann', 1),
  person('tore', 'Tore Lunde', 1),
  person('sigrid', 'Sigrid Aas', 2),
  person('kristian', 'Kristian Holm', 2),
  person('anders', 'Anders Moe', 2),
  person('ingrid', 'Ingrid Dahl', 2),
];

const game = (over: Partial<FinishSideGame> = {}): FinishSideGame => ({
  game_mode: 'stableford',
  side_ld_count: 1,
  side_ctp_count: 2,
  side_ld_holes: [9],
  side_ctp_holes: [7, null],
  ...over,
});

const row = (over: Record<string, unknown>) => ({
  category: 'closest_to_pin',
  hole_number: 7,
  flight_number: 1,
  winner_user_id: 'marte',
  distance_m: null,
  ...over,
});

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  claimRows = [];
  claimError = null;
  adminThrows = false;
  fake.reset();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe('loadSideSlotViews', () => {
  it('reads nothing when no slot has a hole, and every slot is as before', async () => {
    const views = await loadSideSlotViews(
      'G1',
      game({ side_ld_holes: null, side_ctp_holes: [null, null] }),
      EIGHT,
    );
    expect(fake.ops).toEqual([]);
    expect(views).toEqual({
      ld: [{ hole: null, reports: null }],
      ctp: [
        { hole: null, reports: null },
        { hole: null, reports: null },
      ],
    });
  });

  it('reads all flights\' reports for the game once, and gives each slot its hole\'s lines and missing flights', async () => {
    claimRows = [
      row({ flight_number: 1, winner_user_id: 'marte', distance_m: 2.4 }),
      row({ flight_number: 2, winner_user_id: 'kristian', distance_m: 1.8 }),
      row({ category: 'longest_drive', hole_number: 9, flight_number: 1, winner_user_id: 'jonas' }),
      row({ category: 'longest_drive', hole_number: 8, flight_number: 2, winner_user_id: 'ola' }), // not a contest hole
    ];
    const views = await loadSideSlotViews('G1', game(), EIGHT);

    expect(fake.ops).toHaveLength(1);
    expect(fake.ops[0]).toMatchObject({
      table: 'game_side_claims',
      kind: 'select',
      filters: [{ op: 'eq', column: 'game_id', value: 'G1' }],
    });
    expect(views.ctp[0]).toEqual({
      hole: 7,
      reports: {
        hole: 7,
        lines: [
          { flightNumber: 2, name: 'Kristian', distanceM: 1.8 },
          { flightNumber: 1, name: 'Marte', distanceM: 2.4 },
        ],
        missingFlights: [],
      },
    });
    expect(views.ld[0]).toEqual({
      hole: 9,
      reports: { hole: 9, lines: [{ flightNumber: 1, name: 'Jonas', distanceM: null }], missingFlights: [2] },
    });
    // The second closest-to-pin slot has no hole: no box.
    expect(views.ctp[1]).toEqual({ hole: null, reports: null });
  });

  it('a single-flight game reports under key 0, so «Flighten» is the one that may be missing', async () => {
    const four = EIGHT.slice(0, 4);
    claimRows = [row({ flight_number: 0, winner_user_id: 'marte', distance_m: 1.2 })];
    const views = await loadSideSlotViews('G1', game({ side_ctp_count: 1, side_ctp_holes: [7] }), four);
    expect(views.ctp[0].reports).toEqual({
      hole: 7,
      lines: [{ flightNumber: 0, name: 'Marte', distanceM: 1.2 }],
      missingFlights: [],
    });
    claimRows = [];
    const none = await loadSideSlotViews('G1', game({ side_ctp_count: 1, side_ctp_holes: [7] }), four);
    expect(none.ctp[0].reports).toEqual({ hole: 7, lines: [], missingFlights: [0] });
  });

  it('a winner who has since withdrawn still gets a name, and a shared first name shows in full', async () => {
    const players = [
      ...EIGHT.filter((p) => p.user_id !== 'ingrid'),
      person('ingrid', 'Ingrid Dahl', 2, { withdrawn_at: '2026-11-15T10:00:00Z' }),
      person('marte-b', 'Marte Berg', 2),
    ];
    claimRows = [
      row({ flight_number: 1, winner_user_id: 'marte', distance_m: 2.4 }),
      row({ flight_number: 2, winner_user_id: 'ingrid', distance_m: 3.1 }),
    ];
    const lines = (await loadSideSlotViews('G1', game(), players)).ctp[0].reports;
    expect(lines).toMatchObject({
      lines: [
        { flightNumber: 1, name: 'Marte Lie' },
        { flightNumber: 2, name: 'Ingrid' },
      ],
    });
  });

  it('a slot past the count has no hole even when the array still holds one', async () => {
    const views = await loadSideSlotViews('G1', game({ side_ctp_count: 1, side_ctp_holes: [7, 12] }), EIGHT);
    expect(views.ctp).toHaveLength(1);
  });

  it('a failed read gives «failed» on the slots with a hole, never throws, and leaves the others alone', async () => {
    claimError = { message: 'connection reset' };
    const views = await loadSideSlotViews('G1', game(), EIGHT);
    expect(views.ld).toEqual([{ hole: 9, reports: 'failed' }]);
    expect(views.ctp).toEqual([
      { hole: 7, reports: 'failed' },
      { hole: null, reports: null },
    ]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('a read that throws (no service key, network down) is a failed read too', async () => {
    adminThrows = true;
    const views = await loadSideSlotViews('G1', game(), EIGHT);
    expect(views.ld).toEqual([{ hole: 9, reports: 'failed' }]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
