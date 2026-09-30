import { describe, it, expect } from 'vitest';
import {
  MAX_TREND_ROUNDS,
  buildScoringTrend,
  compareRecentForm,
  isNewRecord,
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

// #2265: appens formkurve (Rundedagboka) snur kurven og tegner designets
// geometri. Valgene er additive; standarden over står uendret for webben.
describe('buildScoringTrend — invertY (#2265, better rounds sit higher)', () => {
  it('maps a lower score to a SMALLER svg-y than a higher score', () => {
    const g = buildScoringTrend([r(95), r(80)], { ...SQUARE, invertY: true })!;
    const [worst, best] = g.bruttoPoints;
    expect(best.y).toBeLessThan(worst.y);
  });

  it('mirrors the default direction inside the same box', () => {
    const rounds = [r(92), r(88), r(90)];
    const plain = buildScoringTrend(rounds, SQUARE)!;
    const flipped = buildScoringTrend(rounds, { ...SQUARE, invertY: true })!;
    flipped.bruttoPoints.forEach((p, i) => {
      expect(p.x).toBe(plain.bruttoPoints[i].x);
      expect(p.y).toBeCloseTo(100 - plain.bruttoPoints[i].y, 10);
    });
  });

  it('keeps the best-round marker on the earliest lowest score', () => {
    const g = buildScoringTrend([r(84), r(90), r(84)], { ...SQUARE, invertY: true })!;
    expect(g.bruttoBestPoint).toEqual(g.bruttoPoints[0]);
  });
});

describe('buildScoringTrend — padDomain false (#2265, the design geometry)', () => {
  const DESIGN = {
    width: 326,
    height: 124,
    padding: { top: 24, right: 14, bottom: 28, left: 12 },
    invertY: true,
    padDomain: false,
  };

  it('puts the best round on the top line and the worst on the bottom line', () => {
    const g = buildScoringTrend([r(92), r(87), r(82)], DESIGN)!;
    expect(g.bruttoPoints.map((p) => p.y)).toEqual([96, 60, 24]);
    expect(g.yMin).toBe(82);
    expect(g.yMax).toBe(92);
  });

  it('runs x from the left padding to width minus the right padding', () => {
    const g = buildScoringTrend([r(92), r(87), r(82)], DESIGN)!;
    expect(g.bruttoPoints.map((p) => p.x)).toEqual([12, 162, 312]);
  });

  it('centres a flat line instead of dividing by zero', () => {
    const g = buildScoringTrend([r(85), r(85)], DESIGN)!;
    expect(g.bruttoPoints.map((p) => p.y)).toEqual([60, 60]);
  });
});

describe('buildScoringTrend — areaPath (#2265)', () => {
  it('closes the area under the line down to the plot floor by default', () => {
    const g = buildScoringTrend([r(90), r(80)], SQUARE)!;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const [a, b] = g.bruttoPoints;
    expect(g.areaPath).toBe(
      `M${a.x},${round2(a.y)} L${b.x},${round2(b.y)} L${b.x},100 L${a.x},100 Z`,
    );
  });

  it('closes down to areaBottom when it is given', () => {
    const g = buildScoringTrend([r(92), r(82)], {
      width: 326,
      height: 124,
      padding: { top: 24, right: 14, bottom: 28, left: 12 },
      invertY: true,
      padDomain: false,
      areaBottom: 118,
    })!;
    expect(g.areaPath).toBe('M12,96 L312,24 L312,118 L12,118 Z');
  });
});

describe('compareRecentForm (#2265)', () => {
  const seq = (...values: number[]) => values;

  it('returns null under ten rounds', () => {
    expect(compareRecentForm([])).toBeNull();
    expect(compareRecentForm(seq(90, 90, 90, 90, 90, 86, 86, 86, 86))).toBeNull();
  });

  it('gives the five before minus the last five, to one decimal', () => {
    // Snitt 91,2 før og 87,4 nå → 3,8 slag bedre.
    expect(compareRecentForm(seq(92, 90, 91, 93, 90, 88, 87, 88, 86, 88))).toBe(3.8);
  });

  it('uses only the last ten of a longer run', () => {
    const older = seq(70, 70, 70, 70, 70);
    const last10 = seq(92, 90, 91, 93, 90, 88, 87, 88, 86, 88);
    expect(compareRecentForm([...older, ...last10])).toBe(3.8);
  });

  it('is negative when the last five are worse', () => {
    expect(compareRecentForm(seq(86, 86, 86, 86, 86, 88, 88, 88, 88, 88))).toBe(-2);
  });

  it('is zero when the two halves are equal', () => {
    expect(compareRecentForm(seq(88, 88, 88, 88, 88, 88, 88, 88, 88, 88))).toBe(0);
  });
});

describe('isNewRecord (#2265)', () => {
  it('is false without a round before the newest', () => {
    expect(isNewRecord([])).toBe(false);
    expect(isNewRecord([82])).toBe(false);
  });

  it('is true when the newest is strictly lower than every round before', () => {
    expect(isNewRecord([90, 85, 84])).toBe(true);
  });

  it('is false when the newest only equals the old best', () => {
    expect(isNewRecord([90, 84, 84])).toBe(false);
  });

  it('is false when an older round was lower', () => {
    expect(isNewRecord([80, 90, 85])).toBe(false);
  });
});

describe('MAX_TREND_ROUNDS', () => {
  it('is the WHS/Golfbox window of 20 rounds', () => {
    expect(MAX_TREND_ROUNDS).toBe(20);
  });
});
