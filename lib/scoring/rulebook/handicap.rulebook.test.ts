// #2927: the handicap rules' own examples, run through the real functions.
//
// Sources (read 20.11.2026):
//   NGF = Handicapreglene WHS 2024, Norges Golfforbund,
//         https://www.golfforbundet.no/files/documents/handicapreglene-whs-2024.pdf
//         (page numbers below are the printed ones, equal to the PDF's).
//   R&A = Rules of Handicapping, https://www.randa.org/roh/
//
// NGF calls the app's «banehandicap» (100 %) «spillehandicap», and the app's
// «spillehandicap» (after the share) «redusert spillehandicap». The test
// names use the app's words. A known deviation is an `it.fails` in
// «Kjent avvik» named after its row in docs/regelbok-gjennomgang.md; the PR
// that fixes it turns the test red and must flip it to `it`
// (lib/scoring/AGENTS.md).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HCP_MAX } from '@/lib/users/profileInput';
import {
  calculateCourseHandicap,
  playingHandicap,
  playingHandicapFromRaw,
  rawCourseHandicap,
} from '../courseHandicap';
import { computeScoreDifferential, type DifferentialHole } from '../scoreDifferential';
import { computeStablefordPoints } from '../modes/stableford';
import { strokesForHole } from '../strokeAllocation';

const SI_1_TO_18 = Array.from({ length: 18 }, (_, i) => i + 1);

/** Strokes on stroke index 1..18, in index order. */
function allocation(courseHandicap: number): number[] {
  return SI_1_TO_18.map((si) => strokesForHole(courseHandicap, si));
}

/**
 * 18 par-4 holes with stroke index = hole number, every hole scored `base`
 * except the hole with stroke index `si`, scored `strokes`.
 */
function roundWithOneHole(base: number, si: number, strokes: number): DifferentialHole[] {
  return SI_1_TO_18.map((n) => ({ par: 4, strokeIndex: n, strokes: n === si ? strokes : base }));
}

describe('Regel 6.1a: banehandicap (NGF s. 54)', () => {
  // NGF 6.2a/1, s. 55-56: course rating 71,0, slope 125, par 71. The book
  // prints 9,5132 and 11,3939; the formula gives 9,51327 and 11,39381.
  it('handicap × slope / 113 + (baneverdi − par): 8,6 og 10,3 gir 9,51 og 11,39', () => {
    const tee = { slope: 125, courseRating: 71.0, par: 71 };
    expect(rawCourseHandicap({ hcpIndex: 8.6, ...tee })).toBeCloseTo(9.513, 3);
    expect(rawCourseHandicap({ hcpIndex: 10.3, ...tee })).toBeCloseTo(11.394, 3);
  });

  // NGF 6.1a anm. 2: «Avrunding til nærmeste heltall er det siste steget».
  it('avrundingen er siste steg: 8,6 og 10,3 gir banehandicap 10 og 11', () => {
    const tee = { slope: 125, courseRating: 71.0, par: 71 };
    expect(calculateCourseHandicap({ hcpIndex: 8.6, ...tee })).toBe(10);
    expect(calculateCourseHandicap({ hcpIndex: 10.3, ...tee })).toBe(11);
  });

  // NGF 6.1a anm. 1: a 9-hole course played twice uses the 9-hole slope and
  // 2 × the 9-hole rating and par. The course form asks for 18-hole numbers
  // (CR × 2, slope as is) and sums par over 18 rows, so the app's inputs are
  // the rule's.
  it('anm. 1: 9-hullsbane spilt to ganger gir regelens tall med CR og par doblet', () => {
    const nine = { slope: 120, courseRating: 35.4, par: 36 };
    const rule = 20.0 * (nine.slope / 113) + (2 * nine.courseRating - 2 * nine.par);
    expect(
      calculateCourseHandicap({
        hcpIndex: 20.0,
        slope: nine.slope,
        courseRating: 2 * nine.courseRating,
        par: 2 * nine.par,
      }),
    ).toBe(Math.round(rule));
    expect(Math.round(rule)).toBe(20);
  });
});

describe('Regel 5.3: høyeste handicap 54,0 (NGF s. 45)', () => {
  it('indeksen kan ikke settes over 54,0', () => {
    expect(HCP_MAX).toBe(54);
  });
});

describe('Regel 6.2a: handicapgodtgjørelse (NGF s. 55-56)', () => {
  it('avklaring 6.2a/1: 8,6 og 10,3 ved 85 % gir 8 og 10, ikke 9 og 9', () => {
    const game = { slope: 125, courseRating: 71.0, par: 71, allowancePct: 85 };
    expect(playingHandicap({ hcpIndex: 8.6, ...game })).toBe(8);
    expect(playingHandicap({ hcpIndex: 10.3, ...game })).toBe(10);
  });

  // «Det beregnede reduserte spillehandicapet avrundes til nærmeste heltall,
  // hvor 0,5 avrundes oppover.» 10,0 on 113/72,0/72 is 10 exactly; 75 % is 7,5.
  it('0,5 avrundes oppover: 75 % av 10 gir 8', () => {
    expect(
      playingHandicap({ hcpIndex: 10.0, slope: 113, courseRating: 72.0, par: 72, allowancePct: 75 }),
    ).toBe(8);
  });

  // NGF vedlegg C s. 76: «Når handicapgodtgjørelse legges til, beveger en
  // spiller med et pluss spillehandicap seg mot null, inkludert avrunding.»
  it('plusshandicap: halvparten av +5 er +2,5 og rundes mot null til +2', () => {
    expect(playingHandicapFromRaw(-5, 50)).toBe(-2);
  });

  // NGF vedlegg C/3 s. 77-78 (the book applies the share to the rounded
  // course handicap «for ease of illustration», R&A C/2 note 2): four-ball
  // stroke play is the app's best ball.
  it.each([
    ['+4', -4, -3],
    ['16', 16, 14],
    ['7', 7, 6],
    ['26', 26, 22],
  ])('vedlegg C/3: banehandicap %s ved 85 %% gir %i', (_label, courseHandicap, expected) => {
    expect(playingHandicapFromRaw(courseHandicap, 85)).toBe(expected);
  });

  // R&A appendix C, clarification C/2 example 1: individual stroke play at
  // 95 % (the R&A's recommendation; NGF's table says 100 % in Norway). Course
  // handicaps 10, 18, 27 and 39 from the same clarification's table.
  it.each([
    [10, 10],
    [18, 17],
    [27, 26],
    [39, 37],
  ])('R&A C/2 eksempel 1: banehandicap %i ved 95 %% gir %i slag', (courseHandicap, expected) => {
    expect(playingHandicapFromRaw(courseHandicap, 95)).toBe(expected);
  });
});

describe('Regel 7.2a: høyeste spillehandicap (NGF s. 65), ligaflighten 75 % og tak 32', () => {
  // The league tee: slope 125, course rating 70,0, par 72.
  const league = { slope: 125, courseRating: 70.0, par: 72, allowancePct: 75, maxStrokes: 32 };

  it.each([
    ['54,0', 54.0, 32],
    ['40,0', 40.0, 32],
    ['30,0', 30.0, 23],
    ['+2,0', -2.0, -3],
  ])('indeks %s gir spillehandicap %i', (_label, hcpIndex, expected) => {
    expect(playingHandicap({ hcpIndex, ...league })).toBe(expected);
  });
});

describe('Vedlegg E og C: slagfordeling etter hullindeks (NGF s. 76 og 81)', () => {
  // Vedlegg E: «Når en spiller får mer enn 18 slag, brukes den samme
  // tildelingsrekkefølgen med hull indeks 1 som hull indeks 19, 37, 55».
  // Vedlegg C: a plus player gives strokes back «ved å begynne med hullet som
  // har hull-indeks 18».
  const ones = (n: number) => Array(n).fill(1);
  const zeros = (n: number) => Array(n).fill(0);
  it.each<[string, number, number[]]>([
    ['0', 0, zeros(18)],
    ['1', 1, [1, ...zeros(17)]],
    ['17', 17, [...ones(17), 0]],
    ['18', 18, ones(18)],
    ['19 (hullindeks 1 er også 19)', 19, [2, ...ones(17)]],
    ['36', 36, Array(18).fill(2)],
    ['37 (hullindeks 1 er også 37)', 37, [3, ...Array(17).fill(2)]],
    ['55 (hullindeks 1 er også 55)', 55, [4, ...Array(17).fill(3)]],
    ['+2 (gir tilbake på hullindeks 18 og 17)', -2, [...zeros(16), -1, -1]],
    ['+3', -3, [...zeros(15), -1, -1, -1]],
  ])('banehandicap %s', (_label, courseHandicap, expected) => {
    expect(allocation(courseHandicap)).toEqual(expected);
    expect(expected.reduce((a, b) => a + b, 0)).toBe(courseHandicap);
  });

  // NGF 6.1b s. 55: the 18-hole handicap is spread over all 18 holes by index,
  // and a 9-hole round gets the strokes that fall on its nine. Stroke index
  // from NGF's own example, vedlegg E s. 82; banehandicap 12 on the back nine.
  it('6.1b: ni hull får slagene som faller på de ni hullene etter 18-hullsindeksen', () => {
    const backNineIndex = [8, 16, 6, 12, 2, 14, 4, 18, 10];
    expect(backNineIndex.map((si) => strokesForHole(12, si))).toEqual([1, 0, 1, 1, 1, 0, 1, 0, 1]);
  });
});

describe('Regel 3.1b: netto dobbeltbogey (NGF s. 30-31)', () => {
  // Slope 113 and course rating 72,0 make the differential AGS − 72, so the
  // hole cap reads straight off the result: par 4 everywhere, one bad hole.
  const flat = { slope: 113, courseRating: 72.0 };

  it('uten slag på hullet: taket er par + 2', () => {
    const holes = roundWithOneHole(4, 1, 9);
    expect(computeScoreDifferential({ holes, courseHandicap: 0, ...flat })).toBe(2);
  });

  it('med ett slag på hullet: taket er par + 3', () => {
    const holes = roundWithOneHole(4, 1, 9);
    expect(computeScoreDifferential({ holes, courseHandicap: 18, ...flat })).toBe(3);
  });

  it('plusshandicap gir tilbake på hullet: +1 har taket par + 1 på hullindeks 18', () => {
    const holes = roundWithOneHole(4, 18, 9);
    expect(computeScoreDifferential({ holes, courseHandicap: -1, ...flat })).toBe(1);
  });

  it('banehandicap 54 gir tre slag og taket par + 5', () => {
    const holes = roundWithOneHole(4, 1, 12);
    expect(computeScoreDifferential({ holes, courseHandicap: 54, ...flat })).toBe(5);
  });

  // «En netto dobbel bogey er lik den laveste scoren på et hull hvor
  // spilleren ville fått null Stableford-poeng.»
  it.each([-2, 0, 5, 18, 23, 36, 54])(
    'netto dobbeltbogey er laveste score som gir 0 stableford-poeng (banehandicap %i)',
    (courseHandicap) => {
      for (const par of [3, 4, 5]) {
        for (const si of SI_1_TO_18) {
          const received = strokesForHole(courseHandicap, si);
          const cap = par + 2 + received;
          expect(computeStablefordPoints({ par, netStrokes: cap - received })).toBe(0);
          expect(computeStablefordPoints({ par, netStrokes: cap - 1 - received })).toBe(1);
        }
      }
    },
  );

  // The league example behind F1, with the full course handicap the rule asks
  // for: index 30,0 on 125/70,0/72 is banehandicap 31, two strokes on index
  // 1-13. A 9 on the par 4 with index 6 is capped at 8; the other 17 holes are
  // bogeys. AGS 93, differential 113/125 × (93 − 70) = 20,8.
  it('fullt banehandicap: indeks 30,0 med en 9-er på hullindeks 6 gir differensial 20,8', () => {
    const tee = { slope: 125, courseRating: 70.0, par: 72 };
    const courseHandicap = calculateCourseHandicap({ hcpIndex: 30.0, ...tee });
    expect(courseHandicap).toBe(31);
    const holes = roundWithOneHole(5, 6, 9);
    expect(
      computeScoreDifferential({ holes, courseHandicap, slope: tee.slope, courseRating: tee.courseRating }),
    ).toBe(20.8);
  });
});

describe('Kjent avvik', () => {
  // F1 lives in the two callers, outside lib/scoring: both pass
  // `game_players.course_handicap`, the number frozen after the game's share
  // and cap. NGF 3.1b (s. 31): «Spillerens fulle spillehandicap (100 %) skal
  // brukes for alle netto dobbel bogey justeringer», and 7.2a (s. 65) says the
  // same for a capped competition. The league example above gives 20,8 with
  // the rule and 19,9 with the frozen 23. A fix changes the argument, the
  // assertion holds, and the test turns red. One test per caller, so a fix of
  // one site cannot hide behind the other. Not caught: a fix that feeds the
  // full number into `course_handicap` upstream (the history page and the
  // app's roundHistory.ts build the input) or changes what the column stores;
  // such a fix flips these tests by hand.
  it.fails('F1: differensialen ved avslutning får fullt banehandicap til netto dobbeltbogey', () => {
    const caller = readFileSync('lib/games/persistScoreDifferentials.ts', 'utf8');
    expect(caller).not.toMatch(/courseHandicap:\s*player\.course_handicap\b/);
  });

  it.fails('F1: differensialen historikken fryser selv får fullt banehandicap til netto dobbeltbogey', () => {
    const caller = readFileSync('lib/stats/roundDifferentials.ts', 'utf8');
    expect(caller).not.toMatch(/courseHandicap:\s*game\.course_handicap\b/);
  });

  // NGF 3.1b (s. 31): «Når et spillehandicap er beregnet til mer enn 54 og en
  // spiller får 4 eller flere slag på et hull, er maksimal hullscore par + 5».
  // Banehandicap 56 gets four strokes on index 1 and 2; a 12 there counts 9.
  it.fails('F2: over 54 er hulltaket par + 5 når spilleren får fire slag eller flere', () => {
    const holes = roundWithOneHole(4, 1, 12);
    expect(
      computeScoreDifferential({ holes, courseHandicap: 56, slope: 113, courseRating: 72.0 }),
    ).toBe(5);
  });

  // NGF 6.2a (s. 55): «0,5 avrundes oppover». Index 45,0 on 113/72,0/72 is 45
  // exactly and 70 % of it is 31,5, but 45 × 0,7 is 31,499999999999996 in
  // floating point, which rounds down.
  it.fails('F3: 0,5 avrundes oppover også når flyttallet havner like under', () => {
    expect(
      playingHandicap({ hcpIndex: 45.0, slope: 113, courseRating: 72.0, par: 72, allowancePct: 70 }),
    ).toBe(32);
  });
});
