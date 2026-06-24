import { describe, it, expect } from 'vitest';
import {
  buildScoringTrend,
  summarizeTrendRounds,
  type TrendRound,
} from './scoringTrend';

/** Brutto-only round helper. */
const r = (brutto: number, netto: number | null = null): TrendRound => ({
  brutto,
  netto,
});

/** Fixed geometry so coordinate math is deterministic across cases.
 *  width 100, height 100, no padding → inner box is the full 100×100. */
const SQUARE = {
  width: 100,
  height: 100,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
};

describe('buildScoringTrend — guard', () => {
  it.each([[[]], [[r(90)]]])(
    'returns null for fewer than 2 rounds (%#)',
    (rounds) => {
      expect(buildScoringTrend(rounds as TrendRound[])).toBeNull();
    },
  );

  it('returns geometry once there are 2+ rounds', () => {
    expect(buildScoringTrend([r(90), r(88)])).not.toBeNull();
  });
});

describe('buildScoringTrend — point counts', () => {
  it('emits one brutto point per round', () => {
    const g = buildScoringTrend([r(90), r(88), r(91)])!;
    expect(g.bruttoPoints).toHaveLength(3);
  });

  it('skips rounds with null netto on the netto line', () => {
    const g = buildScoringTrend([r(90, 72), r(88, null), r(91, 73)])!;
    expect(g.bruttoPoints).toHaveLength(3);
    expect(g.nettoPoints).toHaveLength(2);
  });

  it('emits an empty netto line when no round has netto', () => {
    const g = buildScoringTrend([r(90), r(88)])!;
    expect(g.nettoPoints).toHaveLength(0);
    expect(g.nettoPolyline).toBe('');
  });
});

describe('buildScoringTrend — x spacing', () => {
  it('spreads points evenly left→right with first at left edge, last at right edge', () => {
    const g = buildScoringTrend([r(90), r(88), r(86)], SQUARE)!;
    expect(g.bruttoPoints.map((p) => p.x)).toEqual([0, 50, 100]);
  });

  it('keeps the netto point under the same x as its round index', () => {
    // netto present only on round index 2 → its x must equal the 3rd brutto x.
    const g = buildScoringTrend([r(90), r(88), r(86, 70)], SQUARE)!;
    expect(g.nettoPoints[0].x).toBe(g.bruttoPoints[2].x);
  });
});

describe('buildScoringTrend — y direction (golf: lower score sits lower on screen)', () => {
  it('maps a lower score to a LARGER svg-y than a higher score', () => {
    const g = buildScoringTrend([r(95), r(80)], SQUARE)!;
    const [worst, best] = g.bruttoPoints; // 95 then 80
    // 80 is the better (lower) score → should be lower on screen → larger y.
    expect(best.y).toBeGreaterThan(worst.y);
  });

  it('is monotonic: strictly improving scores trend downward', () => {
    const g = buildScoringTrend([r(100), r(90), r(80)], SQUARE)!;
    const ys = g.bruttoPoints.map((p) => p.y);
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
  });
});

describe('buildScoringTrend — y domain', () => {
  it('spans min/max across BOTH brutto and netto values', () => {
    // brutto 90..92, netto 70..71 → raw domain must include the netto floor 70.
    const g = buildScoringTrend([r(92, 71), r(90, 70)], SQUARE)!;
    // padded by max(1, round(span*0.1)); span = 92-70 = 22 → pad = 2.
    expect(g.yMin).toBe(68);
    expect(g.yMax).toBe(94);
  });

  it('keeps points strictly inside the padded domain (never on the edge)', () => {
    const g = buildScoringTrend([r(90), r(80)], SQUARE)!;
    const ys = g.bruttoPoints.map((p) => p.y);
    // With padding the extreme scores sit off the top/bottom edges.
    for (const y of ys) {
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(100);
    }
  });
});

describe('buildScoringTrend — flat line (all scores equal)', () => {
  it('does not divide by zero and centres the line vertically', () => {
    const g = buildScoringTrend([r(85), r(85), r(85)], SQUARE)!;
    const ys = g.bruttoPoints.map((p) => p.y);
    expect(ys.every((y) => Number.isFinite(y))).toBe(true);
    // span 0 → pad 2 → domain [83,87]; v=85 maps to the vertical centre (50).
    expect(ys.every((y) => y === 50)).toBe(true);
  });
});

describe('buildScoringTrend — polyline strings', () => {
  it('serialises points as space-separated "x,y" pairs, rounded to 2 decimals', () => {
    const g = buildScoringTrend([r(90), r(80)], SQUARE)!;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    expect(g.bruttoPolyline).toBe(
      g.bruttoPoints.map((p) => `${round2(p.x)},${round2(p.y)}`).join(' '),
    );
    // The compact string never carries full float precision.
    expect(g.bruttoPolyline).not.toContain('8.333');
  });
});

describe('buildScoringTrend — best-round markers (#949)', () => {
  it('points the brutto marker at the lowest brutto round', () => {
    const g = buildScoringTrend([r(90), r(84), r(88)], SQUARE)!;
    // 84 is the min → marker sits on the 2nd brutto point.
    expect(g.bruttoBestPoint).toEqual(g.bruttoPoints[1]);
  });

  it('breaks brutto ties toward the EARLIEST occurrence (record was set then)', () => {
    const g = buildScoringTrend([r(84), r(90), r(84)], SQUARE)!;
    expect(g.bruttoBestPoint).toEqual(g.bruttoPoints[0]);
  });

  it('points the netto marker at the lowest netto, skipping null rounds', () => {
    const g = buildScoringTrend([r(90, 74), r(84, null), r(88, 70)], SQUARE)!;
    // best netto = 70 on round index 2 → marker x matches that round's x.
    expect(g.nettoBestPoint).not.toBeNull();
    expect(g.nettoBestPoint!.x).toBe(g.bruttoPoints[2].x);
  });

  it('has no netto marker when no round carries netto', () => {
    const g = buildScoringTrend([r(90), r(88)], SQUARE)!;
    expect(g.nettoBestPoint).toBeNull();
  });
});

describe('summarizeTrendRounds (#949)', () => {
  it('reads brutto start (first), now (last) and best (min)', () => {
    const s = summarizeTrendRounds([r(99), r(92), r(86), r(90)]);
    expect(s.brutto).toEqual({ start: 99, now: 90, best: 86 });
  });

  it('reads netto start/now/best, ignoring null rounds for best', () => {
    const s = summarizeTrendRounds([r(99, 83), r(92, null), r(86, 70), r(90, 74)]);
    expect(s.netto).toEqual({ start: 83, now: 74, best: 70 });
  });

  it('returns null netto fields when no round carries netto', () => {
    const s = summarizeTrendRounds([r(99), r(86)]);
    expect(s.netto).toEqual({ start: null, now: null, best: null });
  });

  it('reports the same value for start/now/best with a single round', () => {
    const s = summarizeTrendRounds([r(88, 72)]);
    expect(s.brutto).toEqual({ start: 88, now: 88, best: 88 });
    expect(s.netto).toEqual({ start: 72, now: 72, best: 72 });
  });
});
