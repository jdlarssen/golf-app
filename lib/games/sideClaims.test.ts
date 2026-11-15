import { describe, expect, it } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';
import {
  claimsNeeded,
  readHoleClaims,
  readRpcAnswer,
  toGirClaims,
  toSideClaims,
} from './sideClaims';
import type { HoleContest } from './sideContest';

// #2283 (part D2) — Type A: what the web reads and how it reads an rpc's answer.

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

const SIDE_ROW = {
  category: 'closest_to_pin',
  hole_number: 7,
  winner_user_id: ID_A,
  distance_m: 2.4,
  entered_by: ID_B,
  updated_at: '2026-11-15T10:00:00Z',
};
const GIR_ROW = {
  hole_number: 7,
  user_id: ID_A,
  hit: true,
  entered_by: ID_B,
  updated_at: '2026-11-15T10:00:00Z',
};

function client(respond: (op: QueryOp) => QueryResponse) {
  const fake = createAdminClientMock({ respond });
  return { fake, db: fake.client as never };
}

describe('toSideClaims', () => {
  it('maps a row and reads a numeric distance given as text', () => {
    expect(toSideClaims([SIDE_ROW, { ...SIDE_ROW, category: 'longest_drive', distance_m: '3.0' as never }])).toEqual([
      {
        category: 'closest_to_pin',
        holeNumber: 7,
        winnerUserId: ID_A,
        distanceM: 2.4,
        enteredBy: ID_B,
        updatedAt: '2026-11-15T10:00:00Z',
      },
      {
        category: 'longest_drive',
        holeNumber: 7,
        winnerUserId: ID_A,
        distanceM: 3,
        enteredBy: ID_B,
        updatedAt: '2026-11-15T10:00:00Z',
      },
    ]);
  });

  it('keeps «Ingen på green» (no winner, no distance) and leaves out an unknown category', () => {
    const claims = toSideClaims([
      { ...SIDE_ROW, winner_user_id: null, distance_m: null },
      { ...SIDE_ROW, category: 'mystery' },
    ]);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ winnerUserId: null, distanceM: null });
  });
});

describe('toGirClaims', () => {
  it('maps a row, a miss included', () => {
    expect(toGirClaims([GIR_ROW, { ...GIR_ROW, user_id: ID_B, hit: false }])).toEqual([
      { holeNumber: 7, userId: ID_A, hit: true, enteredBy: ID_B, updatedAt: '2026-11-15T10:00:00Z' },
      { holeNumber: 7, userId: ID_B, hit: false, enteredBy: ID_B, updatedAt: '2026-11-15T10:00:00Z' },
    ]);
  });
});

describe('claimsNeeded', () => {
  const ctp: HoleContest = { category: 'closest_to_pin', source: 'game' };
  const gir: HoleContest = { category: 'gir', source: 'cup', points: 1, maxPerTeam: 2 };

  it('asks for the table each contest reports into', () => {
    expect(claimsNeeded([])).toEqual({ side: false, gir: false });
    expect(claimsNeeded([ctp])).toEqual({ side: true, gir: false });
    expect(claimsNeeded([gir])).toEqual({ side: false, gir: true });
    expect(claimsNeeded([ctp, gir])).toEqual({ side: true, gir: true });
  });
});

describe('readRpcAnswer', () => {
  it('is ok only for the exact answer ok', () => {
    expect(readRpcAnswer({ data: 'ok', error: null })).toEqual({ ok: true });
  });

  it.each(['not_player', 'not_active', 'no_slot', 'wrong_flight', 'bad_distance'])(
    'hands the code %s on as it is',
    (code) => {
      expect(readRpcAnswer({ data: code, error: null })).toEqual({ ok: false, error: code });
    },
  );

  // Trap 2: PostgREST answers `error: null` for work that never happened.
  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['an empty list', []],
    ['OK in capitals', 'OK'],
    ['an unknown string', 'something_new'],
    ['true', true],
  ])('is a failure for %s', (_label, data) => {
    expect(readRpcAnswer({ data, error: null })).toEqual({ ok: false, error: 'db_error' });
  });

  it('is a failure when the rpc raised, even with an ok in data', () => {
    expect(readRpcAnswer({ data: 'ok', error: { message: 'boom' } })).toEqual({ ok: false, error: 'db_error' });
  });
});

describe('readHoleClaims', () => {
  it('reads only the tables the hole needs, for this game and hole', async () => {
    const { fake, db } = client((op) => ({ data: op.table === 'game_side_claims' ? [SIDE_ROW] : [] }));

    const result = await readHoleClaims(db, { gameId: ID_A, holeNumber: 7, need: { side: true, gir: false } });

    expect(fake.ops).toHaveLength(1);
    expect(fake.ops[0]).toMatchObject({ table: 'game_side_claims', kind: 'select' });
    expect(fake.ops[0].filters).toEqual([
      { op: 'eq', column: 'game_id', value: ID_A },
      { op: 'eq', column: 'hole_number', value: 7 },
    ]);
    // The tables name no flight: RLS limits the rows to the caller's own.
    expect(fake.ops[0].columns).not.toMatch(/flight/);
    expect(result).toEqual({ ok: true, side: [expect.objectContaining({ winnerUserId: ID_A })], gir: undefined });
  });

  it('reads both tables in one go, an empty answer being an answer', async () => {
    const { fake, db } = client((op) => ({ data: op.table === 'game_gir_claims' ? [GIR_ROW] : [] }));

    const result = await readHoleClaims(db, { gameId: ID_A, holeNumber: 7, need: { side: true, gir: true } });

    expect(fake.ops.map((op) => op.table).sort()).toEqual(['game_gir_claims', 'game_side_claims']);
    expect(result).toEqual({ ok: true, side: [], gir: [expect.objectContaining({ userId: ID_A, hit: true })] });
  });

  it('reads nothing when no table is needed', async () => {
    const { fake, db } = client(() => ({ data: [] }));

    const result = await readHoleClaims(db, { gameId: ID_A, holeNumber: 7, need: { side: false, gir: false } });

    expect(fake.ops).toEqual([]);
    expect(result).toEqual({ ok: true, side: undefined, gir: undefined });
  });

  it('says ok: false when one table fails, never an empty list', async () => {
    const { db } = client((op) =>
      op.table === 'game_gir_claims' ? { data: null, error: { message: 'permission denied' } } : { data: [] },
    );

    const result = await readHoleClaims(db, { gameId: ID_A, holeNumber: 7, need: { side: true, gir: true } });

    expect(result).toMatchObject({ ok: false });
  });

  it('says ok: false when the request throws', async () => {
    const { db } = client(() => {
      throw new Error('network down');
    });

    const result = await readHoleClaims(db, { gameId: ID_A, holeNumber: 7, need: { side: true, gir: false } });

    expect(result).toMatchObject({ ok: false });
  });
});
