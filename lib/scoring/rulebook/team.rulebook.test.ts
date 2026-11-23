// #2927 round 3: the rule book's team formats, scramble and patsome, run
// through the real engines (`ScoringContext` in, result out).
//
// Source (read 20.11.2026): NGF = Handicapreglene WHS 2024, Norges Golfforbund,
// https://www.golfforbundet.no/files/documents/handicapreglene-whs-2024.pdf
// (printed page numbers, equal to the PDF's). Vedlegg C s. 75: the recommended
// shares, among them
//   Four-Ball Stableford              85 %
//   Foursome                          50 % av sammenlagt spillehandicap
//   Greensome                         60 % av laveste + 40 % av høyeste
//   Scramble (4 spillere)             25 % / 20 % / 15 % / 10 % fra lavest til høyest
//   Scramble (3 spillere)             30 % / 20 % / 10 % fra lavest til høyest
//   Scramble (2 spillere)             35 % laveste / 15 % høyeste
// Vedlegg E s. 81: strokes by stroke index, index 1 first.
//
// The inputs are whole course handicaps, as the engines get them. A known
// deviation is an `it.fails` in «Kjent avvik» named after its row in
// docs/regelbok-gjennomgang.md (lib/scoring/AGENTS.md).

import { describe, expect, it } from 'vitest';
import { compute as computeAmbrose } from '../modes/ambrose';
import { compute as computeFlorida } from '../modes/floridaScramble';
import { compute as computePatsome } from '../modes/patsome';
import { compute as computeTexas } from '../modes/texasScramble';
import type {
  GameMode,
  GameModeConfig,
  ScoringContext,
  ScoringHole,
  ScoringHoleScore,
  ScoringPlayer,
} from '../modes/types';

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
  holes: ScoringHole[] = PAR4_18,
  scores: ScoringHoleScore[] = [],
): ScoringContext {
  return { game: { id: 'g', game_mode, mode_config }, players, holes, scores };
}

/** One team, team number 1, with the given course handicaps (users a, b, c, d). */
function team(...courseHandicaps: number[]): ScoringPlayer[] {
  return courseHandicaps.map((courseHandicap, i) => ({
    userId: 'abcd'[i],
    teamNumber: 1,
    flightNumber: null,
    courseHandicap,
  }));
}

const ones = (n: number) => Array(n).fill(1);
const zeros = (n: number) => Array(n).fill(0);

describe('Vedlegg E: lagets slag fordeles etter hullindeks', () => {
  // Two players on 20: the rule gives 35 % × 20 + 15 % × 20 = 10, and Texas'
  // 25 % of the sum 40 is 10 too. Ten strokes go on index 1-10.
  it('Texas med to spillere på 20: lag-handicap 10, ett slag på hullindeks 1-10', () => {
    const result = computeTexas(
      ctx('texas_scramble', { kind: 'texas_scramble', team_size: 2, teams_count: 1, team_handicap_pct: 25 }, team(20, 20)),
    );
    const line = result.teams[0];
    expect(line.teamHandicap).toBe(10);
    expect(line.holes.map((h) => h.teamExtraStrokes)).toEqual([...ones(10), ...zeros(8)]);
  });
});

describe('Patsome: greensome- og foursomes-delen etter vedlegg C', () => {
  // Patsome plays holes 1-6 as four-ball, 7-12 as greensome and 13-18 as
  // foursomes. The pair 10 and 18: greensome 0,6 × 10 + 0,4 × 18 = 13,2 → 13,
  // foursomes 0,5 × 28 = 14. Index 13 and 14 sit on holes 7 and 8, and 14 and
  // 15 on holes 13 and 14, so each pair of holes shows the team's number
  // (index 14 is on two holes on purpose; the engine reads it per hole).
  it('10 og 18 gir greensome 13 og foursomes 14', () => {
    const index = [1, 2, 3, 4, 5, 6, 13, 14, 7, 8, 9, 10, 14, 15, 11, 12, 16, 17];
    const holes = index.map((strokeIndex, i) => ({ number: i + 1, par: 4, strokeIndex }));
    const result = computePatsome(
      ctx(
        'patsome',
        { kind: 'patsome', team_size: 2, teams_count: 1, patsome_scoring: 'net' },
        team(10, 18),
        holes,
        // The one-ball holes are on the captain's row ('a'); a hole without a
        // score gets no strokes, so each checked hole has one.
        [7, 8, 13, 14].map((holeNumber) => ({ userId: 'a', holeNumber, gross: 5 })),
      ),
    );
    const extra = (holeNumber: number) =>
      result.teams[0].holes.find((h) => h.holeNumber === holeNumber)?.teamExtraStrokes;
    // Greensome 13: index 13 gets a stroke, 14 does not.
    expect([extra(7), extra(8)]).toEqual([1, 0]);
    // Foursomes 14: index 14 gets a stroke, 15 does not.
    expect([extra(13), extra(14)]).toEqual([1, 0]);
  });
});

describe('Kjent avvik', () => {
  // NGF vedlegg C s. 75, scramble (4 spillere): «25 % / 20 % / 15 % / 10 % fra
  // lavest til høyest spillehandicap». The four from C/2 (10, 18, 27, 39):
  // 2,5 + 3,6 + 4,05 + 3,9 = 14,05 → 14. Texas takes one share of the sum: its
  // start value for four is 10 % of 94 = 9,4 → 9 (teamHandicap.ts).
  it.fails('F23: Texas med fire spillere vekter etter vedlegg C: 10, 18, 27 og 39 gir 14', () => {
    const result = computeTexas(
      ctx(
        'texas_scramble',
        { kind: 'texas_scramble', team_size: 4, teams_count: 1, team_handicap_pct: 10 },
        team(10, 18, 27, 39),
      ),
    );
    expect(result.teams[0].teamHandicap).toBe(14);
  });

  // Scramble (2 spillere): «35 % laveste / 15 % høyeste spillehandicap».
  // 10 and 18: 3,5 + 2,7 = 6,2 → 6. Ambrose's start value for two is 25 % of
  // the sum: 7.
  it.fails('F23: Ambrose med to spillere vekter etter vedlegg C: 10 og 18 gir 6', () => {
    const result = computeAmbrose(
      ctx('ambrose', { kind: 'ambrose', team_size: 2, teams_count: 1, team_handicap_pct: 25 }, team(10, 18)),
    );
    expect(result.teams[0].teamHandicap).toBe(6);
  });

  // Scramble (3 spillere): «30 % / 20 % / 10 % fra lavest til høyest». 10, 18
  // and 27: 3 + 3,6 + 2,7 = 9,3 → 9. Florida's start value for three is 15 %
  // of 55 = 8,25 → 8.
  it.fails('F23: Florida med tre spillere vekter etter vedlegg C: 10, 18 og 27 gir 9', () => {
    const result = computeFlorida(
      ctx(
        'florida_scramble',
        { kind: 'florida_scramble', team_size: 3, teams_count: 1, team_handicap_pct: 15 },
        team(10, 18, 27),
      ),
    );
    expect(result.teams[0].teamHandicap).toBe(9);
  });

  // Patsome's holes 1-6 are four-ball stableford: each partner's points, the
  // best counts. Patsome is not in vedlegg C; its four-ball part is the
  // «Four-Ball Stableford 85 %» row, and its greensome and foursomes parts
  // already follow their rows. Banehandicap 20 at 85 % is 17: one stroke on
  // index 2, so a 5 on a par 4 is net 4. The engine gives the full 20 (two
  // strokes on index 2, net 3).
  it.fails('F24: patsomes four-ball-del gir 85 % av banehandicapet', () => {
    const holes = PAR4_18.map((h) => (h.number === 1 ? { ...h, strokeIndex: 2 } : h.number === 2 ? { ...h, strokeIndex: 1 } : h));
    const result = computePatsome(
      ctx(
        'patsome',
        { kind: 'patsome', team_size: 2, teams_count: 1, patsome_scoring: 'net' },
        team(20, 20),
        holes,
        [
          { userId: 'a', holeNumber: 1, gross: 5 },
          { userId: 'b', holeNumber: 1, gross: 5 },
        ],
      ),
    );
    const hole1 = result.teams[0].holes.find((h) => h.holeNumber === 1)!;
    expect(hole1.players.map((p) => p.netStrokes)).toEqual([4, 4]);
  });
});
