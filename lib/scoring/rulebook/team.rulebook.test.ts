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

// #3002 rettet F23 og F24. Nye spill får nøklene `team_handicap_rule:
// 'ngf_weighted'` (Texas og Florida) og `fourball_allowance_pct: 85`
// (patsome). Et spill uten nøkkel beholder tallene det ble laget med, så hver
// rad har en søstertest som låser dagens tall.
describe('Vedlegg C: scramble vekter hver spiller (F23, rettet i #3002)', () => {
  // NGF vedlegg C s. 75, scramble (4 spillere): «25 % / 20 % / 15 % / 10 % fra
  // lavest til høyest spillehandicap». The four from C/2 (10, 18, 27, 39):
  // 2,5 + 3,6 + 4,05 + 3,9 = 14,05 → 14.
  it('F23: Texas med fire spillere vekter etter vedlegg C: 10, 18, 27 og 39 gir 14', () => {
    const result = computeTexas(
      ctx(
        'texas_scramble',
        { kind: 'texas_scramble', team_size: 4, teams_count: 1, team_handicap_pct: 10, team_handicap_rule: 'ngf_weighted' },
        team(10, 18, 27, 39),
      ),
    );
    expect(result.teams[0].teamHandicap).toBe(14);
  });

  // A game without the key takes one share of the sum: 10 % of 94 = 9,4 → 9.
  it('F23: Texas uten nøkkel beholder én andel av summen: 9', () => {
    const result = computeTexas(
      ctx(
        'texas_scramble',
        { kind: 'texas_scramble', team_size: 4, teams_count: 1, team_handicap_pct: 10 },
        team(10, 18, 27, 39),
      ),
    );
    expect(result.teams[0].teamHandicap).toBe(9);
  });

  // Scramble (2 spillere): «35 % laveste / 15 % høyeste spillehandicap».
  // 10 and 18: 3,5 + 2,7 = 6,2 → 6. Ambrose keeps its formula (the owner,
  // 24.11), and its «Standard» is the formula (27.11, «B: formelen»): the
  // forms never give Ambrose the key (`offersNgfWeighting`). The engine still
  // weighs a scramble config with the key the same way for all three.
  it('F23: Ambrose med to spillere og vekting etter vedlegg C: 10 og 18 gir 6', () => {
    const result = computeAmbrose(
      ctx(
        'ambrose',
        { kind: 'ambrose', team_size: 2, teams_count: 1, team_handicap_pct: 25, team_handicap_rule: 'ngf_weighted' },
        team(10, 18),
      ),
    );
    expect(result.teams[0].teamHandicap).toBe(6);
  });

  // The Ambrose formula, 25 % of the sum for two: 7.
  it('F23: Ambrose uten nøkkel beholder Ambrose-formelen: 7', () => {
    const result = computeAmbrose(
      ctx('ambrose', { kind: 'ambrose', team_size: 2, teams_count: 1, team_handicap_pct: 25 }, team(10, 18)),
    );
    expect(result.teams[0].teamHandicap).toBe(7);
  });

  // Scramble (3 spillere): «30 % / 20 % / 10 % fra lavest til høyest». 10, 18
  // and 27: 3 + 3,6 + 2,7 = 9,3 → 9.
  it('F23: Florida med tre spillere vekter etter vedlegg C: 10, 18 og 27 gir 9', () => {
    const result = computeFlorida(
      ctx(
        'florida_scramble',
        { kind: 'florida_scramble', team_size: 3, teams_count: 1, team_handicap_pct: 15, team_handicap_rule: 'ngf_weighted' },
        team(10, 18, 27),
      ),
    );
    expect(result.teams[0].teamHandicap).toBe(9);
  });

  // 15 % of 55 = 8,25 → 8.
  it('F23: Florida uten nøkkel beholder én andel av summen: 8', () => {
    const result = computeFlorida(
      ctx(
        'florida_scramble',
        { kind: 'florida_scramble', team_size: 3, teams_count: 1, team_handicap_pct: 15 },
        team(10, 18, 27),
      ),
    );
    expect(result.teams[0].teamHandicap).toBe(8);
  });
});

describe('Vedlegg C: patsomes four-ball-del på 85 % (F24, rettet i #3002)', () => {
  // Patsome's holes 1-6 are four-ball stableford: each partner's points, the
  // best counts. Patsome is not in vedlegg C; its four-ball part is the
  // «Four-Ball Stableford 85 %» row, and its greensome and foursomes parts
  // already follow their rows. Banehandicap 20 at 85 % is 17: one stroke on
  // index 1-17 and none on 18, so a 5 on a par 4 is net 4 on index 17 and net
  // 5 on index 18. 80 % (16) would give no stroke on 17 and 90 % (18) one on
  // 18, so the pair pins 85 %.
  const holes = PAR4_18.map((h) =>
    h.number === 1 ? { ...h, strokeIndex: 17 } : h.number === 2 ? { ...h, strokeIndex: 18 } : h.number === 17 ? { ...h, strokeIndex: 1 } : h.number === 18 ? { ...h, strokeIndex: 2 } : h,
  );
  const fiveOnHoles1And2 = [1, 2].flatMap((holeNumber) => [
    { userId: 'a', holeNumber, gross: 5 },
    { userId: 'b', holeNumber, gross: 5 },
  ]);
  const netOnHoles1And2 = (mode_config: GameModeConfig) => {
    const result = computePatsome(ctx('patsome', mode_config, team(20, 20), holes, fiveOnHoles1And2));
    const net = (holeNumber: number) =>
      result.teams[0].holes.find((h) => h.holeNumber === holeNumber)!.players.map((p) => p.netStrokes);
    return [net(1), net(2)];
  };

  it('F24: patsomes four-ball-del gir 85 % av banehandicapet', () => {
    expect(
      netOnHoles1And2({ kind: 'patsome', team_size: 2, teams_count: 1, patsome_scoring: 'net', fourball_allowance_pct: 85 }),
    ).toEqual([
      [4, 4],
      [5, 5],
    ]);
  });

  // A game without the key gives the full 20: net 4 on both.
  it('F24: patsome uten nøkkel beholder hele banehandicapet på hull 1-6', () => {
    expect(
      netOnHoles1And2({ kind: 'patsome', team_size: 2, teams_count: 1, patsome_scoring: 'net' }),
    ).toEqual([
      [4, 4],
      [4, 4],
    ]);
  });
});
