/**
 * Trap #4 agreement test (AGENTS.md): the side contest's bounds live in the
 * migration (CHECKs and rpcs), in `sideContest.ts` and in the form parser
 * (`sideTournamentPayload.ts`). This reads the bounds out of
 * `0237_side_contest_claims.sql` and checks that the TypeScript side accepts
 * and refuses exactly at them, so a change to one without the others fails.
 *
 * The rpcs' own behaviour at the edges (0.04 → refused, 99.9 → accepted,
 * slot past the count → no_slot) is run in
 * `supabase/tests/game_side_claims_rls_test.sql`.
 */

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  CLAIM_DISTANCE_MAX_M,
  CLAIM_DISTANCE_MIN_M,
  SIDE_CONTEST_HOLE_MAX,
  SIDE_CONTEST_HOLE_MIN,
  SIDE_CONTEST_SLOT_MAX,
  parseClaimDistance,
  parseSideContestHole,
} from './sideContest';
import { parseSideTournamentFromFormData } from './sideTournamentPayload';

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, '../../supabase/migrations/0237_side_contest_claims.sql'),
  'utf-8',
);

function only<T>(values: T[], what: string): T {
  const distinct = [...new Set(values.map((v) => JSON.stringify(v)))];
  if (distinct.length !== 1) throw new Error(`${what}: expected one value in 0237, found ${distinct.join(' / ')}`);
  return JSON.parse(distinct[0]) as T;
}

function matches(re: RegExp): RegExpMatchArray[] {
  const found = [...MIGRATION.matchAll(re)];
  if (found.length === 0) throw new Error(`no match for ${re} in 0237`);
  return found;
}

const range = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => min + i);

function form(holes: Record<string, string>, counts = { ld: '2', ctp: '2' }): FormData {
  const data = new FormData();
  data.set('side_tournament_enabled', 'true');
  data.set('side_ld_count', counts.ld);
  data.set('side_ctp_count', counts.ctp);
  for (const [key, value] of Object.entries(holes)) data.set(key, value);
  return data;
}

describe('side contest bounds: 0237 ↔ sideContest.ts ↔ the form parser (trap #4)', () => {
  it('the holes in games_side_holes_valid are exactly SIDE_CONTEST_HOLE_MIN…MAX, for both columns', () => {
    const lists = matches(/<@\s*'\{([\d,]+)\}'::integer\[\]/g).map((m) => m[1].split(',').map(Number));
    expect(lists).toHaveLength(2);
    expect(only(lists, 'games_side_holes_valid holes')).toEqual(range(SIDE_CONTEST_HOLE_MIN, SIDE_CONTEST_HOLE_MAX));
  });

  it('the slot limit in games_side_holes_valid is SIDE_CONTEST_SLOT_MAX', () => {
    const limits = matches(/cardinality\(side_(?:ld|ctp)_holes\)\s*<=\s*(\d+)/g).map((m) => Number(m[1]));
    expect(limits).toHaveLength(2);
    expect(only(limits, 'slot limit')).toBe(SIDE_CONTEST_SLOT_MAX);
  });

  it('hole_number in both tables and in is_side_contest_hole is SIDE_CONTEST_HOLE_MIN…MAX', () => {
    const bounds = matches(/hole_number\s+between\s+(\d+)\s+and\s+(\d+)/g).map((m) => [Number(m[1]), Number(m[2])]);
    expect(bounds.length).toBeGreaterThanOrEqual(3);
    expect(only(bounds, 'hole_number bounds')).toEqual([SIDE_CONTEST_HOLE_MIN, SIDE_CONTEST_HOLE_MAX]);
  });

  it('distance_m in the CHECK and in record_side_claim is CLAIM_DISTANCE_MIN_M…MAX_M', () => {
    const check = matches(/distance_m\s+between\s+([\d.]+)\s+and\s+([\d.]+)/g).map((m) => [Number(m[1]), Number(m[2])]);
    expect(only(check, 'distance CHECK')).toEqual([CLAIM_DISTANCE_MIN_M, CLAIM_DISTANCE_MAX_M]);

    const rpcMin = matches(/v_distance\s*<\s*([\d.]+)/g).map((m) => Number(m[1]));
    const rpcMax = matches(/v_distance\s*>\s*([\d.]+)/g).map((m) => Number(m[1]));
    expect(only(rpcMin, 'rpc min')).toBe(CLAIM_DISTANCE_MIN_M);
    expect(only(rpcMax, 'rpc max')).toBe(CLAIM_DISTANCE_MAX_M);
    expect(MIGRATION).toMatch(/v_distance\s*:=\s*round\(p_distance_m,\s*1\)/);
  });

  it('parseSideContestHole accepts and refuses exactly at the hole bounds', () => {
    expect(parseSideContestHole(String(SIDE_CONTEST_HOLE_MIN))).toBe(SIDE_CONTEST_HOLE_MIN);
    expect(parseSideContestHole(String(SIDE_CONTEST_HOLE_MAX))).toBe(SIDE_CONTEST_HOLE_MAX);
    expect(parseSideContestHole(String(SIDE_CONTEST_HOLE_MIN - 1))).toBeNull();
    expect(parseSideContestHole(String(SIDE_CONTEST_HOLE_MAX + 1))).toBeNull();
  });

  it('parseClaimDistance accepts and refuses exactly at the distance bounds, after rounding', () => {
    expect(parseClaimDistance(String(CLAIM_DISTANCE_MIN_M))).toEqual({ ok: true, distanceM: CLAIM_DISTANCE_MIN_M });
    expect(parseClaimDistance(String(CLAIM_DISTANCE_MAX_M))).toEqual({ ok: true, distanceM: CLAIM_DISTANCE_MAX_M });
    expect(parseClaimDistance(String(CLAIM_DISTANCE_MIN_M - 0.06))).toEqual({ ok: false });
    expect(parseClaimDistance(String(CLAIM_DISTANCE_MAX_M + 0.05))).toEqual({ ok: false });
  });

  it('the form parser accepts and refuses exactly at the hole bounds', () => {
    const accepted = parseSideTournamentFromFormData(
      form({ side_ld_hole_1: String(SIDE_CONTEST_HOLE_MIN), side_ctp_hole_1: String(SIDE_CONTEST_HOLE_MAX) }),
    );
    expect(accepted.ok && accepted.payload.ldHoles).toEqual([SIDE_CONTEST_HOLE_MIN, null]);
    expect(accepted.ok && accepted.payload.ctpHoles).toEqual([SIDE_CONTEST_HOLE_MAX, null]);

    expect(parseSideTournamentFromFormData(form({ side_ld_hole_1: String(SIDE_CONTEST_HOLE_MIN - 1) }))).toEqual({
      ok: false,
      errorCode: 'bad_side_ld_holes',
    });
    expect(parseSideTournamentFromFormData(form({ side_ctp_hole_2: String(SIDE_CONTEST_HOLE_MAX + 1) }))).toEqual({
      ok: false,
      errorCode: 'bad_side_ctp_holes',
    });
  });

  it('the form parser never writes more slots than the CHECK allows', () => {
    const result = parseSideTournamentFromFormData(
      form({ side_ctp_hole_1: '3', side_ctp_hole_2: '7', side_ctp_hole_3: '12' }),
    );
    expect(result.ok && result.payload.ctpHoles?.length).toBeLessThanOrEqual(SIDE_CONTEST_SLOT_MAX);
  });
});
