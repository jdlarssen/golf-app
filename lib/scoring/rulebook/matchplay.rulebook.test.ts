// #2927 round 2: the rule books' match play examples, run through the real
// engines (`ScoringContext` in, result out).
//
// Sources (read 20.11.2026):
//   NGF = Handicapreglene WHS 2024, Norges Golfforbund,
//         https://www.golfforbundet.no/files/documents/handicapreglene-whs-2024.pdf
//         (printed page numbers, equal to the PDF's). Vedlegg C s. 75-78,
//         vedlegg E s. 81-82, 6.1b s. 55, 6.2b s. 56-57.
//   Rules of Golf 3.2c(2), https://www.randa.org/en/rog/the-rules-of-golf/rule-3
//     («Handicap strokes are given by hole, and the lower net score wins the hole.»)
//   Rules of Golf 23.2b(2), https://www.randa.org/en/rog/the-rules-of-golf/rule-23
//     («the lowest (gross or net) score for that hole counts for the side»)
//
// NGF's examples apply the share to the rounded course handicap («for ease of
// illustration», R&A C/2 note 2), so the inputs here are whole numbers. A known
// deviation is an `it.fails` in «Kjent avvik» named after its row in
// docs/regelbok-gjennomgang.md (lib/scoring/AGENTS.md).

import { describe, expect, it } from 'vitest';
import { holesForSegment } from '../holeSegment';
import { compute as computeFourball } from '../modes/fourballMatchplay';
import { compute as computeFoursomes } from '../modes/foursomesMatchplay';
import { compute as computeGreensome } from '../modes/greensomeMatchplay';
import { compute as computeRoundRobin } from '../modes/roundRobin';
import { compute as computeSingles } from '../modes/singlesMatchplay';
import type {
  FourballMatchplayResult,
  GameMode,
  GameModeConfig,
  ScoringContext,
  ScoringHole,
  ScoringHoleScore,
  ScoringPlayer,
} from '../modes/types';
import { strokesReceived } from '../strokesReceived';

/** 18 par-4 holes, stroke index = hole number. */
const PAR4_18: ScoringHole[] = Array.from({ length: 18 }, (_, i) => ({
  number: i + 1,
  par: 4,
  strokeIndex: i + 1,
}));

/** NGF's example stroke index, vedlegg E s. 82, on 18 par-4 holes. */
const NGF_INDEX = [7, 15, 5, 11, 1, 13, 3, 17, 9, 8, 16, 6, 12, 2, 14, 4, 18, 10];
const NGF_HOLES: ScoringHole[] = NGF_INDEX.map((strokeIndex, i) => ({ number: i + 1, par: 4, strokeIndex }));

function ctx(
  game_mode: GameMode,
  mode_config: GameModeConfig,
  players: ScoringPlayer[],
  holes: ScoringHole[],
  scores: ScoringHoleScore[] = [],
): ScoringContext {
  return { game: { id: 'g', game_mode, mode_config }, players, holes, scores };
}

function player(
  userId: string,
  teamNumber: number,
  courseHandicap: number,
  teeGender?: ScoringPlayer['teeGender'],
): ScoringPlayer {
  return { userId, teamNumber, flightNumber: null, courseHandicap, teeGender };
}

/**
 * A singles match as created today: the higher handicap gets the difference
 * (`match_strokes: 'difference'`). A match created before keeps each player's
 * own strokes and is never recalculated (`singlesStrokeHandicap`).
 */
const SINGLES: GameModeConfig = {
  kind: 'singles_matchplay',
  team_size: 1,
  teams_count: 2,
  match_strokes: 'difference',
};
const fourball = (allowance_pct: number): GameModeConfig => ({
  kind: 'fourball_matchplay',
  team_size: 2,
  teams_count: 2,
  allowance_pct,
});

/** Strokes per player on stroke index 1..18 (holes ordered by stroke index). */
function fourballStrokesBySi(result: FourballMatchplayResult): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const rows = [...result.holes].sort((a, b) => a.strokeIndex - b.strokeIndex);
  for (const row of rows) {
    for (const cell of [...row.side1Players, ...row.side2Players]) {
      (out[cell.userId] ??= []).push(cell.extraStrokes);
    }
  }
  return out;
}

const ones = (n: number) => Array(n).fill(1);
const zeros = (n: number) => Array(n).fill(0);

describe('Golfreglene 3.2c(2) og 23.2b(2): laveste netto vinner hullet', () => {
  // Banehandicap 0 against 18 at 100 %: the difference is 18, one stroke a
  // hole. A 4 against a 5 on a par 4 is 4 against net 4: halved.
  it('singles: 4 mot 5 med ett slag i forskjell er delt hull', () => {
    const result = computeSingles(
      ctx('singles_matchplay', SINGLES, [player('A', 1, 0), player('B', 2, 18)], [PAR4_18[0]], [
        { userId: 'A', holeNumber: 1, gross: 4 },
        { userId: 'B', holeNumber: 1, gross: 5 },
      ]),
    );
    expect(result.holes[0].result).toBe('tied');
  });

  // The side's score is its partners' lowest net. Side 1: A (0) 5, B (18) 5
  // → net 5 and 4, best 4. Side 2: C (0) 4, D (18) 6 → net 4 and 5, best 4.
  it('four-ball: sidens beste netto teller, og like beste netto er delt hull', () => {
    const result = computeFourball(
      ctx(
        'fourball_matchplay',
        fourball(100),
        [player('A', 1, 0), player('B', 1, 18), player('C', 2, 0), player('D', 2, 18)],
        [PAR4_18[0]],
        [
          { userId: 'A', holeNumber: 1, gross: 5 },
          { userId: 'B', holeNumber: 1, gross: 5 },
          { userId: 'C', holeNumber: 1, gross: 4 },
          { userId: 'D', holeNumber: 1, gross: 6 },
        ],
      ),
    );
    const row = result.holes[0];
    expect([row.side1BestNet, row.side2BestNet, row.result]).toEqual([4, 4, 'tied']);
  });
});

describe('Vedlegg C: singles i matchspill (NGF s. 76)', () => {
  // «spiller den spilleren med det laveste spillehandicapet med null
  // handicapslag relativt til den andre spilleren/spillerne. Den andre
  // spilleren/spillerne får differansen». C/2 eksempel 1: «Spiller A får null
  // (0) handicapslag og spiller B får 8 handicapslag i matchen (ett
  // handicapslag på hullene med indeks 1-8).»
  it('C/2 eksempel 1: A (10) spiller på 0, og B (18) får ett slag på hullindeks 1-8', () => {
    const result = computeSingles(
      ctx(
        'singles_matchplay',
        SINGLES,
        [player('A', 1, 10), player('B', 2, 18)],
        PAR4_18,
      ),
    );
    expect(result.holes.map((h) => h.side1Extra)).toEqual(zeros(18));
    expect(result.holes.map((h) => h.side2Extra)).toEqual([...ones(8), ...zeros(10)]);
  });
});

describe('Vedlegg C: foursomes og greensome i matchspill (NGF s. 75-78)', () => {
  const foursomes: GameModeConfig = { kind: 'foursomes_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50 };

  // C/2 eksempel 3: A (10) and B (18) against C (27) and D (39). «lag 2 [får]
  // 19 slag (50 % av differansen mellom hvert lags sammenlagte Spillehandicap)».
  it('C/2 eksempel 3: 28 mot 66 i sammenlagt banehandicap gir lag 2 19 slag', () => {
    const result = computeFoursomes(
      ctx(
        'foursomes_matchplay',
        foursomes,
        [player('A', 1, 10), player('B', 1, 18), player('C', 2, 27), player('D', 2, 39)],
        PAR4_18,
      ),
    );
    expect(result.sides.map((s) => s.effectiveExtraHandicap)).toEqual([0, 19]);
    expect(result.holes.reduce((sum, h) => sum + h.side2Extra, 0)).toBe(19);
  });

  // C/3 eksempel 3: A (+4) and B (16) against C (7) and D (26): «lag 2 11
  // slag». 12 against 33 is 21, and 50 % is 10,5, which rounds up.
  it('C/3 eksempel 3 med plusshandicap: 12 mot 33 gir lag 2 11 slag', () => {
    const result = computeFoursomes(
      ctx(
        'foursomes_matchplay',
        foursomes,
        [player('A', 1, -4), player('B', 1, 16), player('C', 2, 7), player('D', 2, 26)],
        PAR4_18,
      ),
    );
    expect(result.sides.map((s) => s.effectiveExtraHandicap)).toEqual([0, 11]);
  });

  // Vedlegg C s. 75: greensome «60 % av laveste spillehandicap + 40 % av
  // høyeste spillehandicap». The C/2 four: 0,6 × 10 + 0,4 × 18 = 13,2 and
  // 0,6 × 27 + 0,4 × 39 = 31,8. The difference is 19 whether each side is
  // rounded first (13 and 32) or not (18,6).
  it('greensome: 60/40 for hvert lag, så differansen: 13 mot 32 gir 19 slag', () => {
    const result = computeGreensome(
      ctx(
        'greensome_matchplay',
        { kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100 },
        [player('A', 1, 10), player('B', 1, 18), player('C', 2, 27), player('D', 2, 39)],
        PAR4_18,
      ),
    );
    expect(result.sides.map((s) => s.combinedCourseHandicap)).toEqual([13, 32]);
    expect(result.sides.map((s) => s.effectiveExtraHandicap)).toEqual([0, 19]);
  });
});

describe('Regel 6.1b: ni hull med 18-hullsindeksen (NGF s. 55)', () => {
  // «Spillehandicapet beregnet for en 18-hulls runde ... fordeles på alle de
  // 18 hullene ... Handicapslag gis eller fås i henhold til hvordan de er
  // fordelt blant de 9 hullene som skal spilles». A difference of 5 falls on
  // index 1-5; on NGF's index, 2 and 4 are holes 14 and 16 on the back nine.
  it('siste ni: 5 i forskjell gir to slag, på hull 14 og 16', () => {
    const result = computeSingles(
      ctx(
        'singles_matchplay',
        SINGLES,
        [player('A', 1, 0), player('B', 2, 5)],
        holesForSegment(NGF_HOLES, 'back9'),
      ),
    );
    const rows = result.holes.map((h) => ({ holeNumber: h.holeNumber, extra: h.side2Extra }));
    expect(strokesReceived(rows)).toEqual({ count: 2, holes: [14, 16] });
    expect(result.holes.every((h) => h.side1Extra === 0)).toBe(true);
  });
});

describe('Kjent avvik', () => {
  // C/2 eksempel 2, four-ball at 90 %: «Spiller A får null (0) slag, spiller B
  // får 7 slag (90 % av differansen i Spillehandicap fra spiller A), spiller C
  // får 15 slag (90 % av 17) og spiller D får 26 slag (90 % av 29).» The engine
  // gives each player 90 % of their own: 9, 16, 24 and 35 (fourballMatchplay.ts).
  it.fails('F15: four-ball gir 90 % av differansen til den laveste (C/2 eksempel 2)', () => {
    const result = computeFourball(
      ctx(
        'fourball_matchplay',
        fourball(90),
        [player('A', 1, 10), player('B', 1, 18), player('C', 2, 27), player('D', 2, 39)],
        PAR4_18,
      ),
    );
    expect(fourballStrokesBySi(result)).toEqual({
      A: zeros(18),
      B: [...ones(7), ...zeros(11)],
      C: [...ones(15), ...zeros(3)],
      D: [...Array(8).fill(2), ...ones(10)],
    });
  });

  // C/3, four-ball match play with a plus handicap: «spiller A får null (0)
  // slag, spiller B får 18 slag (90 % av differansen i Spillehandicap fra
  // spiller A), spiller C får 10 slag (90 % av 11) og spiller D får 27 slag
  // (90 % av 30).» The engine has A give 4 strokes back on index 15-18.
  it.fails('F15: four-ball med plusshandicap: den laveste spiller på null (C/3)', () => {
    const result = computeFourball(
      ctx(
        'fourball_matchplay',
        fourball(90),
        [player('A', 1, -4), player('B', 1, 16), player('C', 2, 7), player('D', 2, 26)],
        PAR4_18,
      ),
    );
    expect(fourballStrokesBySi(result)).toEqual({
      A: zeros(18),
      B: ones(18),
      C: [...ones(10), ...zeros(8)],
      D: [...Array(9).fill(2), ...ones(9)],
    });
  });

  // Round Robin is four-ball match play in three six-hole segments with
  // rotating partners. Appendix C has no row for it; the four-ball rule above
  // is the closest («den laveste ... med null handicapslag», the others the
  // share of the difference). C/2 eksempel 2's four at 90 %: 0, 7, 15 and 26.
  // The engine gives each player 90 % of their own (roundRobin.ts).
  it.fails('F15: Round Robin gir andelen av differansen til den laveste, ikke egne slag', () => {
    const result = computeRoundRobin(
      ctx(
        'round_robin',
        { kind: 'round_robin', team_size: 1, teams_count: 4, allowance_pct: 90 },
        [player('A', 1, 10), player('B', 2, 18), player('C', 3, 27), player('D', 4, 39)],
        PAR4_18,
      ),
    );
    const bySi: Record<string, number[]> = {};
    for (const row of [...result.holes].sort((a, b) => a.strokeIndex - b.strokeIndex)) {
      for (const cell of [...row.side1Players, ...row.side2Players]) {
        (bySi[cell.userId] ??= []).push(cell.extraStrokes);
      }
    }
    expect(bySi).toEqual({
      A: zeros(18),
      B: [...ones(7), ...zeros(11)],
      C: [...ones(15), ...zeros(3)],
      D: [...Array(8).fill(2), ...ones(10)],
    });
  });

  // NGF 6.2b(i) s. 56: in formats where results are gross or net scores (and
  // match play compares net scores, Rules of Golf 3.2c(2)), «En spiller som
  // konkurrerer fra et utslagssted med en høyere par må få tilleggsslag for
  // runden, lik differansen mellom par». Here the ladies' par is 74 against
  // the men's 72 (par 5 for her on index 1 and 2), both on banehandicap 0.
  // The rule gives her two strokes, on index 1 and 2; her 5 on hole 1 is net
  // 4 and halves his 4. The engine gives no extra strokes (singlesMatchplay.ts
  // compares net strokes; par is only shown).
  it.fails('F17: ulik par i matchspill gir tilleggsslag lik forskjellen i par', () => {
    const holes: ScoringHole[] = PAR4_18.map((h) =>
      h.strokeIndex <= 2 ? { ...h, parByGender: { mens: 4, ladies: 5, juniors: 4 } } : h,
    );
    const result = computeSingles(
      ctx('singles_matchplay', SINGLES, [player('herre', 1, 0, 'mens'), player('dame', 2, 0, 'ladies')], holes, [
        { userId: 'herre', holeNumber: 1, gross: 4 },
        { userId: 'dame', holeNumber: 1, gross: 5 },
      ]),
    );
    expect(result.holes[0].result).toBe('tied');
  });
});
