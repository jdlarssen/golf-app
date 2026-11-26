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
import { MIXED_PAR_18 } from '../__fixtures__/mixedPar';
import { holesForSegment } from '../holeSegment';
import { compute as computeFourball } from '../modes/fourballMatchplay';
import { compute as computeFoursomes } from '../modes/foursomesMatchplay';
import { compute as computeGreensome } from '../modes/greensomeMatchplay';
import { compute as computeRoundRobin } from '../modes/roundRobin';
import { compute as computeSingles } from '../modes/singlesMatchplay';
import { compute as computeTexas } from '../modes/texasScramble';
import { patsomeTeamHandicaps } from '../modes/patsome';
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
/**
 * A four-ball match as created today (#2997): the lowest plays off 0 and the
 * others get the share of the difference (`match_strokes: 'difference'`). A
 * match created before keeps each player's own share.
 */
const fourballNew = (allowance_pct: number): GameModeConfig => ({
  kind: 'fourball_matchplay',
  team_size: 2,
  teams_count: 2,
  allowance_pct,
  match_strokes: 'difference',
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

describe('Vedlegg C: four-ball og Round Robin i matchspill (NGF s. 75-78, s. 8)', () => {
  // C/2 eksempel 2, four-ball at 90 %: «Spiller A får null (0) slag, spiller B
  // får 7 slag (90 % av differansen i Spillehandicap fra spiller A), spiller C
  // får 15 slag (90 % av 17) og spiller D får 26 slag (90 % av 29).» Fixed in
  // #2997; a match created before keeps 9, 16, 24 and 35.
  it('F15: four-ball gir 90 % av differansen til den laveste (C/2 eksempel 2)', () => {
    const result = computeFourball(
      ctx(
        'fourball_matchplay',
        fourballNew(90),
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
  // (90 % av 30).» Before #2997 the engine had A give 4 strokes back.
  it('F15: four-ball med plusshandicap: den laveste spiller på null (C/3)', () => {
    const result = computeFourball(
      ctx(
        'fourball_matchplay',
        fourballNew(90),
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

  // The share goes on the difference, not on each player's own handicap (NGF
  // s. 8, 2024: «prosentandelen blir anvendt på differansen, i stedet for på
  // enkeltspillerne»). At 85 % with 1 and 4, 85 % of 3 is 2,55, so B gets 3.
  // Each player's own share gives round(3,4) − round(0,85) = 3 − 1 = 2: a fix
  // that only subtracts the lowest player's strokes still fails here.
  it('F15: four-ball tar andelen av differansen, ikke forskjellen mellom egne andeler', () => {
    const result = computeFourball(
      ctx(
        'fourball_matchplay',
        fourballNew(85),
        [player('A', 1, 1), player('B', 1, 4), player('C', 2, 1), player('D', 2, 1)],
        PAR4_18,
      ),
    );
    expect(fourballStrokesBySi(result)).toEqual({
      A: zeros(18),
      B: [...ones(3), ...zeros(15)],
      C: zeros(18),
      D: zeros(18),
    });
  });

  // Round Robin is four-ball match play in three six-hole segments with
  // rotating partners. Appendix C has no row for it; the four-ball rule above
  // is the closest («den laveste ... med null handicapslag», the others the
  // share of the difference). C/2 eksempel 2's four at 90 %: 0, 7, 15 and 26.
  // Fixed in #2997 for a new Round Robin.
  it('F15: Round Robin gir andelen av differansen til den laveste, ikke egne slag', () => {
    const result = computeRoundRobin(
      ctx(
        'round_robin',
        { kind: 'round_robin', team_size: 1, teams_count: 4, allowance_pct: 90, match_strokes: 'difference' },
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
});

describe('Regel 6.2a, avklaring 6.2a/1: prosenten av det urundede banehandicapet (NGF s. 55)', () => {
  // «For å unngå dobbel avrunding ... legges prosentandelen til det
  // uavrundede tallet.» The start freezes the unrounded course handicap next
  // to the integer (#2997), and the team formats round once. Index 8,6 and
  // 10,3 on a tee where they give 9,513 and 11,394 (frozen as 10 and 11).
  const rawPlayer = (userId: string, teamNumber: number, ch: number, raw: number): ScoringPlayer => ({
    ...player(userId, teamNumber, ch),
    rawCourseHandicap: raw,
  });
  const pair = [rawPlayer('A', 1, 10, 9.513), rawPlayer('B', 1, 11, 11.394)];
  const scratch = [rawPlayer('C', 2, 0, 0), rawPlayer('D', 2, 0, 0)];

  it('F16: foursomes ved 50 %: 50 % av 20,907 er 10,45, altså 10 slag', () => {
    const result = computeFoursomes(
      ctx(
        'foursomes_matchplay',
        { kind: 'foursomes_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50 },
        [...pair, ...scratch],
        PAR4_18,
      ),
    );
    expect(result.sides.map((s) => s.effectiveExtraHandicap)).toEqual([10, 0]);
  });

  it('F16: greensome tar 60/40 uten å runde hver side først', () => {
    // 8,04/13,96 against 15,04/28,96: 10,408 and 20,608, a difference of
    // 10,2, so 10. Rounding each side first (10 and 21) gave 11.
    const result = computeGreensome(
      ctx(
        'greensome_matchplay',
        { kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100 },
        [rawPlayer('A', 1, 8, 8.04), rawPlayer('B', 1, 14, 13.96), rawPlayer('C', 2, 15, 15.04), rawPlayer('D', 2, 29, 28.96)],
        PAR4_18,
      ),
    );
    expect(result.sides.map((s) => s.effectiveExtraHandicap)).toEqual([0, 10]);
  });

  it('F16: four-ball ved 90 % runder differansen av de urundede tallene én gang', () => {
    // 90 % of 20,4 − 9,5 = 9,81 → 10. The integers 20 and 10 gave 9.
    const result = computeFourball(
      ctx(
        'fourball_matchplay',
        fourballNew(90),
        [rawPlayer('A', 1, 10, 9.5), rawPlayer('B', 1, 20, 20.4), rawPlayer('C', 2, 10, 9.5), rawPlayer('D', 2, 10, 9.5)],
        PAR4_18,
      ),
    );
    expect(result.sides[0].players.map((p) => p.effectiveHandicap)).toEqual([0, 10]);
  });

  it('F25: patsome-foursomes: 50 % av 20,907 gir 10, og greensome 60/40 av 8,4 og 14,4 gir 11', () => {
    expect(patsomeTeamHandicaps(pair, 'net').foursomes).toBe(10);
    expect(
      patsomeTeamHandicaps([rawPlayer('A', 1, 8, 8.4), rawPlayer('B', 1, 14, 14.4)], 'net').greensome,
    ).toBe(11);
  });

  it('F25: Texas med to ved 25 %: 25 % av 9,6 + 11,5 er 5,275, altså 5 slag', () => {
    const result = computeTexas(
      ctx(
        'texas_scramble',
        { kind: 'texas_scramble', team_size: 2, teams_count: 1, team_handicap_pct: 25 },
        [rawPlayer('A', 1, 10, 9.6), rawPlayer('B', 1, 12, 11.5)],
        PAR4_18,
      ),
    );
    expect(result.teams[0].teamHandicap).toBe(5);
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

describe('Regel 6.2b(i): ulik par i matchspill gir tilleggsslag (NGF s. 56-57, vedlegg C s. 76)', () => {
  // NGF 6.2b(i) s. 56: in formats where results are gross or net scores (and
  // match play compares net scores, Rules of Golf 3.2c(2)), «En spiller som
  // konkurrerer fra et utslagssted med en høyere par må få tilleggsslag for
  // runden, lik differansen mellom par», added as «Spillehandicap x
  // handicapgodtgjørelse + Forskjell i par»: whole strokes, after the
  // allowance. Vedlegg C s. 76: after the allowance «spiller den spilleren med
  // det laveste spillehandicapet med null handicapslag». Here the ladies' par
  // is 74 against the men's 72 (par 5 for her on index 1 and 2). A new match
  // carries `par_strokes: 'difference'` (#2941); a match created before gives
  // no extra strokes and is never recalculated.
  const MIXED = MIXED_PAR_18;
  const SINGLES_PAR: GameModeConfig = { ...SINGLES, par_strokes: 'difference' } as GameModeConfig;
  const herre = (userId: string, teamNumber: number, ch: number) => player(userId, teamNumber, ch, 'mens');
  const dame = (userId: string, teamNumber: number, ch: number) => player(userId, teamNumber, ch, 'ladies');

  // Both on banehandicap 0. The rule gives her two strokes, on index 1 and 2;
  // her 5 on hole 1 is net 4 and halves his 4.
  it('F17: ulik par i matchspill gir tilleggsslag lik forskjellen i par', () => {
    const result = computeSingles(
      ctx('singles_matchplay', SINGLES_PAR, [herre('herre', 1, 0), dame('dame', 2, 0)], MIXED, [
        { userId: 'herre', holeNumber: 1, gross: 4 },
        { userId: 'dame', holeNumber: 1, gross: 5 },
      ]),
    );
    expect(result.holes[0].result).toBe('tied');
    expect(result.holes.map((h) => h.side2Extra)).toEqual([...ones(2), ...zeros(16)]);
    expect(result.holes.every((h) => h.side1Extra === 0)).toBe(true);
  });

  it('F17: en match opprettet før merket gir ingen tilleggsslag', () => {
    const result = computeSingles(
      ctx('singles_matchplay', SINGLES, [herre('herre', 1, 0), dame('dame', 2, 0)], MIXED, [
        { userId: 'herre', holeNumber: 1, gross: 4 },
        { userId: 'dame', holeNumber: 1, gross: 5 },
      ]),
    );
    expect(result.holes[0].result).toBe('side1_wins');
  });

  // Vedlegg C s. 76: the lowest playing handicap plays off zero. Her 10 + 2
  // = 12 against his 14: she plays off 0, and he gets 2, on index 1 and 2.
  it('F17: har damen lavest handicap, spiller hun på null og herren får differansen', () => {
    const result = computeSingles(ctx('singles_matchplay', SINGLES_PAR, [dame('dame', 1, 10), herre('herre', 2, 14)], MIXED));
    expect(result.holes.map((h) => h.side1Extra)).toEqual(zeros(18));
    expect(result.holes.map((h) => h.side2Extra)).toEqual([...ones(2), ...zeros(16)]);
  });

  // C/2 example 2 at 90 %, with D on the ladies' tee: 0, 7, 15 and 26 + 2.
  // The two strokes are whole strokes after the allowance, not 90 % of 2.
  it('F17: four-ball ved 90 % gir damen to hele slag utover andelen av differansen', () => {
    const result = computeFourball(
      ctx(
        'fourball_matchplay',
        { ...fourballNew(90), par_strokes: 'difference' } as GameModeConfig,
        [herre('A', 1, 10), herre('B', 1, 18), herre('C', 2, 27), dame('D', 2, 39)],
        MIXED,
      ),
    );
    expect(result.sides.flatMap((s) => s.players.map((p) => p.effectiveHandicap))).toEqual([0, 7, 15, 28]);
  });

  // Equal sides at 50 %: no strokes from the handicaps. The side's par is its
  // captain's tee (lex-min userId), as the hole rows show it: C and D on the
  // ladies' tee get 2 whole strokes, not 50 % of 2.
  it('F17: foursomes ved 50 % gir damesiden to slag og herresiden null', () => {
    const result = computeFoursomes(
      ctx(
        'foursomes_matchplay',
        { kind: 'foursomes_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50, par_strokes: 'difference' } as GameModeConfig,
        [herre('A', 1, 10), herre('B', 1, 10), dame('C', 2, 10), dame('D', 2, 10)],
        MIXED,
      ),
    );
    expect(result.sides.map((s) => s.effectiveExtraHandicap)).toEqual([0, 2]);
    expect(result.holes.map((h) => h.side2Extra)).toEqual([...ones(2), ...zeros(16)]);
  });

  it('F17: Round Robin gir hver dame to slag', () => {
    const result = computeRoundRobin(
      ctx(
        'round_robin',
        {
          kind: 'round_robin',
          team_size: 1,
          teams_count: 4,
          allowance_pct: 90,
          match_strokes: 'difference',
          par_strokes: 'difference',
        } as GameModeConfig,
        [herre('A', 1, 0), dame('B', 2, 0), herre('C', 3, 0), dame('D', 4, 0)],
        MIXED,
      ),
    );
    const total: Record<string, number> = {};
    for (const row of result.holes) {
      for (const cell of [...row.side1Players, ...row.side2Players]) {
        total[cell.userId] = (total[cell.userId] ?? 0) + cell.extraStrokes;
      }
    }
    expect(total).toEqual({ A: 0, B: 2, C: 0, D: 2 });
  });

  // Regel 6.1b and 6.2b together: the difference is the par over the nine
  // holes played. On the back nine both play par 36, so no extra strokes.
  it('F17: på siste ni teller bare forskjellen i par over hull 10-18', () => {
    const front = computeSingles(
      ctx('singles_matchplay', SINGLES_PAR, [herre('herre', 1, 0), dame('dame', 2, 0)], holesForSegment(MIXED, 'front9')),
    );
    const back = computeSingles(
      ctx('singles_matchplay', SINGLES_PAR, [herre('herre', 1, 0), dame('dame', 2, 0)], holesForSegment(MIXED, 'back9')),
    );
    expect(front.holes.reduce((sum, h) => sum + h.side2Extra, 0)).toBe(2);
    expect(back.holes.reduce((sum, h) => sum + h.side2Extra, 0)).toBe(0);
  });
});
