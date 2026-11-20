// #2927: the rule books' examples for stroke play and Stableford, run through
// the real engines (`ScoringContext` in, result out).
//
// Sources (read 20.11.2026):
//   Rules of Golf 21.1b, https://www.randa.org/en/rog/the-rules-of-golf/rule-21
//     (the points table is an image on that page: 0, 1, 2, 3, 4, 5, 6 points
//     for more than one over, one over, the fixed score, one to four under).
//   Committee Procedures 5A(6)(d), https://www.randa.org/en/rog/committee-procedures/5
//   NGF = Handicapreglene WHS 2024, https://www.golfforbundet.no/files/documents/handicapreglene-whs-2024.pdf
//
// A known deviation is an `it.fails` in «Kjent avvik» named after its row in
// docs/regelbok-gjennomgang.md (lib/scoring/AGENTS.md).

import { describe, expect, it } from 'vitest';
import { compute as computeBestBall } from '../modes/bestBall';
import { compute as computeModifiedStableford } from '../modes/modifiedStableford';
import { compute as computeShamble } from '../modes/shamble';
import { compute as computeSoloStrokeplay } from '../modes/soloStrokeplay';
import { compute as computeStableford, computeStablefordPoints } from '../modes/stableford';
import type {
  GameMode,
  GameModeConfig,
  ScoringContext,
  ScoringHole,
  ScoringHoleScore,
  ScoringPlayer,
  StablefordSoloResult,
} from '../modes/types';
import { strokesForHole } from '../strokeAllocation';

/** 18 par-4 holes, stroke index = hole number. */
const PAR4_18: ScoringHole[] = Array.from({ length: 18 }, (_, i) => ({
  number: i + 1,
  par: 4,
  strokeIndex: i + 1,
}));

function ctx(
  game_mode: GameMode,
  mode_config: GameModeConfig,
  players: ScoringPlayer[],
  holes: ScoringHole[],
  scores: ScoringHoleScore[],
): ScoringContext {
  return { game: { id: 'g', game_mode, mode_config }, players, holes, scores };
}

function solo(userId: string, courseHandicap: number, teeGender?: ScoringPlayer['teeGender']): ScoringPlayer {
  return { userId, teamNumber: null, flightNumber: null, courseHandicap, teeGender };
}

/** One score per hole from a gross-per-hole array (index 0 = hole 1). */
function card(userId: string, grossByHole: number[]): ScoringHoleScore[] {
  return grossByHole.map((gross, i) => ({ userId, holeNumber: i + 1, gross }));
}

const STABLEFORD_SOLO: GameModeConfig = { kind: 'stableford', team_size: 1, points_table: 'standard' };

describe('Golfreglene 21.1b: stableford-tabellen', () => {
  it.each([
    ['mer enn én over (to over)', 4, 6, 0],
    ['mer enn én over (tre over)', 4, 7, 0],
    ['én over', 4, 5, 1],
    ['fast mål (par)', 4, 4, 2],
    ['én under', 4, 3, 3],
    ['to under', 5, 3, 4],
    ['tre under', 5, 2, 5],
    ['fire under', 5, 1, 6],
  ])('%s gir %i poeng', (_label, par, netStrokes, points) => {
    expect(computeStablefordPoints({ par, netStrokes })).toBe(points);
  });

  it('ingen score levert gir 0 poeng', () => {
    expect(computeStablefordPoints({ par: 4, netStrokes: null })).toBe(0);
  });

  // The table runs on the net score: banehandicap 18 is one stroke a hole, so
  // a bogey on every hole is net par on every hole and 18 × 2 = 36 points.
  it('motoren: banehandicap 18 og bogey på alle hull gir 36 poeng', () => {
    const result = computeStableford(
      ctx('stableford', STABLEFORD_SOLO, [solo('a', 18)], PAR4_18, card('a', Array(18).fill(5))),
    ) as StablefordSoloResult;
    expect(result.players[0].totalPoints).toBe(36);
  });

  // NGF 6.2b(iii) s. 57: Stableford compares points, so players on tees with a
  // different par get no extra strokes; each plays to their own par.
  it('6.2b(iii): ulik par på samme hull gir like poeng for netto par mot egen par', () => {
    const hole: ScoringHole = { number: 1, par: 4, parByGender: { mens: 4, ladies: 5, juniors: 4 }, strokeIndex: 1 };
    const result = computeStableford(
      ctx(
        'stableford',
        STABLEFORD_SOLO,
        [solo('herre', 0, 'mens'), solo('dame', 0, 'ladies')],
        [hole],
        [
          { userId: 'herre', holeNumber: 1, gross: 4 },
          { userId: 'dame', holeNumber: 1, gross: 5 },
        ],
      ),
    ) as StablefordSoloResult;
    expect(result.players.map((p) => p.totalPoints)).toEqual([2, 2]);
  });

  // NGF 7.2a s. 65 (høyeste spillehandicap): the league's 32 is 18 + 14, so
  // two strokes on index 1-14 and one on 15-18.
  it('ligaflighten: spillehandicap 32 gir to slag på hullindeks 1-14', () => {
    const result = computeStableford(
      ctx(
        'stableford',
        STABLEFORD_SOLO,
        [solo('a', 32)],
        PAR4_18,
        card('a', [6, ...Array(13).fill(6), 5, 5, 5, 5]),
      ),
    ) as StablefordSoloResult;
    expect(result.players[0].totalPoints).toBe(36);
  });
});

describe('Modified stableford: samme slagfordeling som stableford', () => {
  // The Rules of Golf have no modified table (21.1 is the standard one). What
  // the handicap rules govern is the net score: gross minus the strokes on
  // the hole by stroke index. Banehandicap 18: a 5 on a par 4 is net par.
  it('banehandicap 18: 5 på par 4 er netto par, 4 er netto birdie', () => {
    const result = computeModifiedStableford(
      ctx(
        'modified_stableford',
        { kind: 'modified_stableford', team_size: 1, points_table: 'modified' },
        [solo('a', 18)],
        PAR4_18.slice(0, 2),
        card('a', [5, 4]),
      ),
    ) as StablefordSoloResult;
    expect(result.holes.map((h) => h.perPlayer[0].points)).toEqual([0, 2]);
  });
});

describe('Solo slagspill: netto = brutto − slag etter hullindeks', () => {
  // NGF vedlegg C s. 75: individual stroke play 100 %, and each player gets
  // their whole handicap (not the difference to the lowest). Banehandicap 10,
  // 18, 27 and 39 from NGF's C/2 table; 90 gross each.
  it('vedlegg C: banehandicap 10, 18, 27 og 39 og 90 brutto gir netto 80, 72, 63 og 51', () => {
    const players = [solo('a', 10), solo('b', 18), solo('c', 27), solo('d', 39)];
    const gross = Array(18).fill(5);
    const result = computeSoloStrokeplay(
      ctx(
        'solo_strokeplay',
        { kind: 'solo_strokeplay', team_size: 1 },
        players,
        PAR4_18,
        players.flatMap((p) => card(p.userId, gross)),
      ),
    );
    const net = Object.fromEntries(result.players.map((p) => [p.userId, p.totalNetStrokes]));
    expect(net).toEqual({ a: 80, b: 72, c: 63, d: 51 });
  });
});

describe('Best ball (four-ball slagspill), vedlegg C/3', () => {
  // NGF vedlegg C/3 s. 77-78: at 85 % player A (+4) gives 3 strokes back to
  // the course and B (16) gets 14. A gives back on index 16-18.
  it('lag 1 med A (+3) og B (14): A gir tilbake på hullindeks 16-18, B får slag på 1-14', () => {
    expect(PAR4_18.map((h) => strokesForHole(-3, h.strokeIndex)).reduce((s, x) => s + x, 0)).toBe(-3);
    const result = computeBestBall(
      ctx(
        'best_ball',
        { kind: 'best_ball', team_size: 2, teams_count: 1 },
        [
          { userId: 'A', teamNumber: 1, flightNumber: null, courseHandicap: -3 },
          { userId: 'B', teamNumber: 1, flightNumber: null, courseHandicap: 14 },
        ],
        [PAR4_18[0], PAR4_18[14], PAR4_18[17]],
        [
          { userId: 'A', holeNumber: 1, gross: 4 },
          { userId: 'B', holeNumber: 1, gross: 5 },
          { userId: 'A', holeNumber: 15, gross: 4 },
          { userId: 'B', holeNumber: 15, gross: 5 },
          { userId: 'A', holeNumber: 18, gross: 3 },
          { userId: 'B', holeNumber: 18, gross: 5 },
        ],
      ),
    );
    const team = result.teams[0];
    const net = team.holes.map((h) => h.players.map((p) => p.net));
    // Hole 1 (index 1): A 4, B 5 − 1. Hole 15 (index 15): A 4, B 5 (no stroke
    // past 14). Hole 18 (index 18): A 3 + 1 given back, B 5.
    expect(net).toEqual([
      [4, 4],
      [4, 5],
      [4, 5],
    ]);
    expect(team.holes.map((h) => h.teamNet)).toEqual([4, 4, 4]);
  });
});

describe('Shamble netto: hver spiller med egne slag etter hullindeks', () => {
  // Appendix C has no shamble row (the drive is shared). The handicap part is
  // the same as four-ball: each player's net by stroke index. The C/3 four
  // (+3, 14, 6, 22 at 85 %) as one team, best two count, on index 1.
  it('vedlegg C/3-firerlaget på hullindeks 1: netto 4, 5, 4 og 4, beste to gir 8', () => {
    const team = [
      { id: 'A', ch: -3, gross: 4 },
      { id: 'B', ch: 14, gross: 6 },
      { id: 'C', ch: 6, gross: 5 },
      { id: 'D', ch: 22, gross: 6 },
    ];
    const result = computeShamble(
      ctx(
        'shamble',
        {
          kind: 'shamble',
          team_size: 4,
          teams_count: 1,
          shamble_variant: 'shamble',
          shamble_count: 2,
          shamble_scoring: 'net',
        },
        team.map((p) => ({ userId: p.id, teamNumber: 1, flightNumber: null, courseHandicap: p.ch })),
        [PAR4_18[0]],
        team.map((p) => ({ userId: p.id, holeNumber: 1, gross: p.gross })),
      ),
    );
    const cell = result.holes[0].teams[0];
    expect(cell.perPlayer.map((p) => p.effectiveScore)).toEqual([4, 5, 4, 4]);
    expect(cell.teamScore).toBe(8);
  });
});

describe('Like plasseringer: tilbaketelling, Committee Procedures 5A(6)(d)', () => {
  // «determine the winner based on the score for the last nine holes, last six
  // holes, last three holes and finally the 18th hole.» For Stableford: «handicap
  // strokes should be applied consistently with how they were applied for the
  // competition», which the engine does by counting the holes' points.
  it('stableford: lik sum avgjøres på poengene for de siste ni hullene', () => {
    // Banehandicap 0. A: 5 on 1-9, par on 10-18 (9 + 18 = 27). B: par on 1-9,
    // 5 on 10-18 (18 + 9 = 27).
    const result = computeStableford(
      ctx(
        'stableford',
        STABLEFORD_SOLO,
        [solo('B', 0), solo('A', 0)],
        PAR4_18,
        [
          ...card('A', [...Array(9).fill(5), ...Array(9).fill(4)]),
          ...card('B', [...Array(9).fill(4), ...Array(9).fill(5)]),
        ],
      ),
    ) as StablefordSoloResult;
    expect(result.players.map((p) => [p.userId, p.totalPoints, p.rank])).toEqual([
      ['A', 27, 1],
      ['B', 27, 2],
    ]);
    expect(result.players[1].decidedBy).toBe('back9');
  });

  // Net stroke play in the app gives strokes by stroke index on each hole, so
  // the count-back uses the same net hole scores (the rule's fractions,
  // one-half, one-third and one-sixth, are for competitions «where the stroke
  // index allocation as set by the Committee is not used»).
  it('netto slagspill: lik netto sum avgjøres på netto for de siste ni hullene', () => {
    // A: banehandicap 9 (strokes on index 1-9 = holes 1-9), 5 on every hole:
    // net 4 on 1-9, 5 on 10-18 = 81. B: banehandicap 0, 5 on 1-9, 4 on
    // 10-18 = 81. B is better on the last nine.
    const result = computeSoloStrokeplay(
      ctx(
        'solo_strokeplay',
        { kind: 'solo_strokeplay', team_size: 1 },
        [solo('A', 9), solo('B', 0)],
        PAR4_18,
        [
          ...card('A', Array(18).fill(5)),
          ...card('B', [...Array(9).fill(5), ...Array(9).fill(4)]),
        ],
      ),
    );
    expect(result.players.map((p) => [p.userId, p.totalNetStrokes, p.rank])).toEqual([
      ['B', 81, 1],
      ['A', 81, 2],
    ]);
  });
});

describe('Kjent avvik', () => {
  // 5A(6)(d): «If there is still a tie, then the last six holes, three holes and
  // final hole of the first nine holes will be considered in turn.» The engine
  // stops after hole 18 (tiebreaker.ts) and calls it a tie.
  it.fails('F4: står det likt etter hull 18, teller regelen videre på de siste seks hullene av første ni', () => {
    // Banehandicap 0, the same back nine (par everywhere, 18 points). A: 5 on
    // 1-3, par on 4-9 (3 + 12 = 15). B: par on 1-3, then 4, 4, 4, 5, 5, 5 on
    // 4-9 (6 + 9 = 15). Equal on total, last 9, 6, 3 and hole 18; A is better
    // on holes 4-9 (12 against 9).
    const backNine = Array(9).fill(4);
    const result = computeStableford(
      ctx(
        'stableford',
        STABLEFORD_SOLO,
        [solo('B', 0), solo('A', 0)],
        PAR4_18,
        [
          ...card('A', [5, 5, 5, 4, 4, 4, 4, 4, 4, ...backNine]),
          ...card('B', [4, 4, 4, 4, 4, 4, 5, 5, 5, ...backNine]),
        ],
      ),
    ) as StablefordSoloResult;
    expect(result.players.map((p) => [p.userId, p.rank])).toEqual([
      ['A', 1],
      ['B', 2],
    ]);
  });
});
