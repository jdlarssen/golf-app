import { describe, it, expect } from 'vitest';
import { allowanceExample, type AllowanceExamplePlayer } from './allowanceExample';
import { displayCourseHandicap } from '@/lib/scoring/courseHandicap';
import type { TeeBoxRatings } from './teeRating';

// Type A (#2455): the numbers in «Slik blir det på … tee». They must be the
// ones the game freezes at start, so every expected value is checked against
// `displayCourseHandicap` as well as written out.

const GUL: TeeBoxRatings = {
  slope_mens: 130,
  course_rating_mens: 71.2,
  par_total_mens: 72,
  slope_ladies: 128,
  course_rating_ladies: 73.5,
  par_total_ladies: 72,
  slope_juniors: 120,
  course_rating_juniors: 69.0,
  par_total_juniors: 72,
};

const GUL_MENS_ONLY: TeeBoxRatings = {
  ...GUL,
  slope_ladies: null,
  course_rating_ladies: null,
  par_total_ladies: null,
  slope_juniors: null,
  course_rating_juniors: null,
  par_total_juniors: null,
};

const tee = { name: 'Gul', ratings: GUL };

const marte: AllowanceExamplePlayer = { id: 'marte', name: 'Marte', hcpIndex: 18.4, gender: 'ladies' };
const jonas: AllowanceExamplePlayer = { id: 'jonas', name: 'Jonas', hcpIndex: 9.4, gender: 'mens' };
const ola: AllowanceExamplePlayer = { id: 'ola', name: 'Ola', hcpIndex: 12.0, gender: 'mens' };
const kari: AllowanceExamplePlayer = { id: 'kari', name: 'Kari', hcpIndex: 12.0, gender: 'mens' };
const plus: AllowanceExamplePlayer = { id: 'plus', name: 'Pro', hcpIndex: -2.0, gender: 'mens' };
const junior: AllowanceExamplePlayer = { id: 'junior', name: 'Junior', hcpIndex: 30.0, gender: 'juniors' };

function strokes(rows: { playerId: string; strokes: number; strokesAtFull: number }[]) {
  return rows.map((r) => [r.playerId, r.strokes, r.strokesAtFull]);
}

describe('allowanceExample', () => {
  it('(a) matches displayCourseHandicap at the chosen share and at 100 %', () => {
    const result = allowanceExample({ players: [jonas, marte], tee, pct: 85 });
    expect(result?.teeName).toBe('Gul');
    expect(strokes(result!.rows)).toEqual([
      ['marte', 19, 22],
      ['jonas', 9, 10],
    ]);
    for (const [player, set] of [
      [marte, { slope: 128, courseRating: 73.5, par: 72 }],
      [jonas, { slope: 130, courseRating: 71.2, par: 72 }],
    ] as const) {
      const row = result!.rows.find((r) => r.playerId === player.id)!;
      expect(row.strokes).toBe(
        displayCourseHandicap({ hcpIndex: player.hcpIndex, ...set, allowancePct: 85 }),
      );
      expect(row.strokesAtFull).toBe(
        displayCourseHandicap({ hcpIndex: player.hcpIndex, ...set, allowancePct: 100 }),
      );
    }
  });

  it('at 100 % the strokes and the full strokes are the same', () => {
    const result = allowanceExample({ players: [jonas, marte], tee, pct: 100 });
    expect(strokes(result!.rows)).toEqual([
      ['marte', 22, 22],
      ['jonas', 10, 10],
    ]);
  });

  it('(b) picks the lowest and the highest handicap, highest first', () => {
    const result = allowanceExample({ players: [ola, marte, jonas, kari], tee, pct: 95 });
    expect(result!.rows.map((r) => r.playerId)).toEqual(['marte', 'jonas']);
    expect(strokes(result!.rows)).toEqual([
      ['marte', 21, 22],
      ['jonas', 10, 10],
    ]);
  });

  it('carries name and handicap index through for the label', () => {
    const result = allowanceExample({ players: [marte], tee, pct: 85 });
    expect(result!.rows[0]).toMatchObject({ name: 'Marte', hcpIndex: 18.4 });
  });

  it('(c) one player gives one row', () => {
    const result = allowanceExample({ players: [jonas], tee, pct: 85 });
    expect(strokes(result!.rows)).toEqual([['jonas', 9, 10]]);
  });

  it('(d) no players gives null', () => {
    expect(allowanceExample({ players: [], tee, pct: 85 })).toBeNull();
  });

  it('no tee, or a tee without ratings, gives null', () => {
    expect(allowanceExample({ players: [jonas], tee: null, pct: 85 })).toBeNull();
    expect(allowanceExample({ players: [jonas], tee: { name: 'Gul' }, pct: 85 })).toBeNull();
  });

  it('(e) a player whose rating set is missing is skipped', () => {
    const result = allowanceExample({
      players: [marte, jonas, junior],
      tee: { name: 'Gul', ratings: GUL_MENS_ONLY },
      pct: 85,
    });
    expect(strokes(result!.rows)).toEqual([['jonas', 9, 10]]);
  });

  it('(e) null when no player has a rating set on the tee', () => {
    expect(
      allowanceExample({
        players: [marte, junior],
        tee: { name: 'Gul', ratings: GUL_MENS_ONLY },
        pct: 85,
      }),
    ).toBeNull();
  });

  it('a non-finite handicap index is skipped', () => {
    const broken = { ...ola, id: 'broken', hcpIndex: Number.NaN };
    const result = allowanceExample({ players: [broken, jonas], tee, pct: 85 });
    expect(strokes(result!.rows)).toEqual([['jonas', 9, 10]]);
  });

  it('(f) a plus handicap gives the negative course handicap the freeze stores', () => {
    const result = allowanceExample({ players: [plus, jonas], tee, pct: 50 });
    expect(strokes(result!.rows)).toEqual([
      ['jonas', 5, 10],
      ['plus', -1, -3],
    ]);
  });

  it('(f) a plus handicap rounding to zero reads 0, not -0', () => {
    const result = allowanceExample({ players: [plus], tee, pct: 5 });
    expect(result!.rows[0].strokes).toBe(0);
  });

  it('(g) ladies and juniors use their own rating set', () => {
    const result = allowanceExample({ players: [junior, { ...jonas, gender: 'ladies' }], tee, pct: 85 });
    expect(strokes(result!.rows)).toEqual([
      ['junior', 25, 29],
      ['jonas', 10, 12],
    ]);
  });

  it('equal handicaps: the first two in selected order', () => {
    const result = allowanceExample({ players: [kari, ola, { ...ola, id: 'ola2' }], tee, pct: 85 });
    expect(result!.rows.map((r) => r.playerId)).toEqual(['kari', 'ola']);
  });
});
