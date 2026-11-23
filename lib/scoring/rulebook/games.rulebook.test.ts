// #2927 round 4: the pot and side games (Wolf, Nassau, Skins, Nines, Acey
// Deucey, Bingo Bango Bongo). The handicap rules have no row for them, so the
// check is parity: net is gross minus the strokes the course handicap gives on
// the hole by stroke index, exactly as in every other format, and the gross
// choice gives no strokes at all.
//
// Source (read 20.11.2026): NGF = Handicapreglene WHS 2024, Norges Golfforbund,
// https://www.golfforbundet.no/files/documents/handicapreglene-whs-2024.pdf
// (printed page numbers). Vedlegg E s. 81: strokes by stroke index, index 1
// first, and «hull indeks 1 som hull indeks 19»; vedlegg C s. 76: a plus
// handicap gives strokes back «ved å begynne med hullet som har hull-indeks 18».
//
// The same three players in every game, on two par-4 holes (index 1 and 18),
// each with a 5:
//   A, banehandicap 0:   5 and 5
//   B, banehandicap 19:  5 − 2 = 3 on index 1, 5 − 1 = 4 on index 18
//   C, banehandicap +2:  5 on index 1, 5 + 1 = 6 on index 18 (gives one back)
// Acey Deucey needs four players; D is banehandicap 0 like A.

import { describe, expect, it } from 'vitest';
import { compute as computeAceyDeucey } from '../modes/aceyDeucey';
import { compute as computeBingoBangoBongo } from '../modes/bingoBangoBongo';
import { compute as computeNassau } from '../modes/nassau';
import { compute as computeNines } from '../modes/nines';
import { compute as computeSkins } from '../modes/skins';
import type {
  GameMode,
  GameModeConfig,
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
} from '../modes/types';
import { compute as computeWolf } from '../modes/wolf';

const HOLES: ScoringHole[] = [
  { number: 1, par: 4, strokeIndex: 1 },
  { number: 2, par: 4, strokeIndex: 18 },
];

const HANDICAPS: Record<string, number> = { A: 0, B: 19, C: -2, D: 0 };

function ctx(game_mode: GameMode, mode_config: GameModeConfig, userIds: string[]): ScoringContext {
  const players: ScoringPlayer[] = userIds.map((userId, i) => ({
    userId,
    teamNumber: i + 1,
    flightNumber: null,
    courseHandicap: HANDICAPS[userId],
  }));
  const scores = userIds.flatMap((userId) =>
    HOLES.map((h) => ({ userId, holeNumber: h.number, gross: 5 })),
  );
  return { game: { id: 'g', game_mode, mode_config }, players, holes: HOLES, scores };
}

type HoleCells = { holeNumber: number; perPlayer: { userId: string; effective: number | null }[] }[];

/** Effective score per player, per hole in hole order: { A: [hole 1, hole 2], … }. */
function byPlayer(holes: HoleCells): Record<string, (number | null)[]> {
  const out: Record<string, (number | null)[]> = {};
  for (const h of [...holes].sort((a, b) => a.holeNumber - b.holeNumber)) {
    for (const c of h.perPlayer) (out[c.userId] ??= []).push(c.effective);
  }
  return out;
}

const NET_THREE = { A: [5, 5], B: [3, 4], C: [5, 6] };
const GROSS_THREE = { A: [5, 5], B: [5, 5], C: [5, 5] };

interface Game {
  name: string;
  mode: GameMode;
  config: (scoring: 'gross' | 'net') => GameModeConfig;
  players: string[];
  effective: (c: ScoringContext) => Record<string, (number | null)[]>;
}

const GAMES: Game[] = [
  {
    name: 'Wolf',
    mode: 'wolf',
    config: (s) => ({ kind: 'wolf', team_size: 1, teams_count: 3, wolf_scoring: s }),
    players: ['A', 'B', 'C'],
    effective: (c) =>
      byPlayer(
        computeWolf(c).holes.map((h) => ({
          holeNumber: h.holeNumber,
          perPlayer: h.players.map((p) => ({ userId: p.userId, effective: p.effectiveScore })),
        })),
      ),
  },
  {
    name: 'Nassau',
    mode: 'nassau',
    config: (s) => ({ kind: 'nassau', team_size: 1, nassau_scoring: s }),
    players: ['A', 'B', 'C'],
    effective: (c) =>
      byPlayer(
        computeNassau(c).holes.map((h) => ({
          holeNumber: h.holeNumber,
          perPlayer: h.perPlayer.map((p) => ({ userId: p.userId, effective: p.effective })),
        })),
      ),
  },
  {
    name: 'Skins',
    mode: 'skins',
    config: (s) => ({ kind: 'skins', team_size: 1, skins_scoring: s }),
    players: ['A', 'B', 'C'],
    effective: (c) =>
      byPlayer(
        computeSkins(c).holes.map((h) => ({
          holeNumber: h.holeNumber,
          perPlayer: h.perPlayer.map((p) => ({ userId: p.userId, effective: p.effectiveScore })),
        })),
      ),
  },
  {
    name: 'Nines',
    mode: 'nines',
    config: (s) => ({ kind: 'nines', team_size: 1, nines_variant: 'nines', nines_scoring: s }),
    players: ['A', 'B', 'C'],
    effective: (c) =>
      byPlayer(
        computeNines(c).holes.map((h) => ({
          holeNumber: h.holeNumber,
          perPlayer: h.perPlayer.map((p) => ({ userId: p.userId, effective: p.effectiveScore })),
        })),
      ),
  },
  {
    name: 'Acey Deucey',
    mode: 'acey_deucey',
    config: (s) => ({ kind: 'acey_deucey', team_size: 1, acey_deucey_scoring: s }),
    players: ['A', 'B', 'C', 'D'],
    effective: (c) =>
      byPlayer(
        computeAceyDeucey(c).holes.map((h) => ({
          holeNumber: h.holeNumber,
          perPlayer: h.perPlayer.map((p) => ({ userId: p.userId, effective: p.effectiveScore })),
        })),
      ),
  },
];

describe('Pottspillene: netto følger hullindeksen, brutto gir 0 slag', () => {
  it.each(GAMES)('$name: netto er brutto minus slagene etter hullindeks', (game) => {
    const expected: Record<string, number[]> = { ...NET_THREE };
    if (game.players.includes('D')) expected.D = [5, 5];
    expect(game.effective(ctx(game.mode, game.config('net'), game.players))).toEqual(expected);
  });

  it.each(GAMES)('$name: brutto-valget gir ingen slag', (game) => {
    const expected: Record<string, number[]> = { ...GROSS_THREE };
    if (game.players.includes('D')) expected.D = [5, 5];
    expect(game.effective(ctx(game.mode, game.config('gross'), game.players))).toEqual(expected);
  });

  // Bingo Bango Bongo gives points for three events on each hole (first on
  // the green, closest to the pin once all are on, first in the hole) and
  // never reads a score or a handicap. The same events give the same points
  // whatever the course handicaps are.
  it('Bingo Bango Bongo: banehandicapet endrer ingen poeng', () => {
    const events = [
      { holeNumber: 1, bingoUserId: 'A', bangoUserId: 'B', bongoUserId: 'C' },
      { holeNumber: 2, bingoUserId: 'B', bangoUserId: 'B', bongoUserId: 'A' },
    ];
    const run = (courseHandicap: number) =>
      computeBingoBangoBongo({
        ...ctx(
          'bingo_bango_bongo',
          { kind: 'bingo_bango_bongo', team_size: 1 },
          ['A', 'B', 'C'],
        ),
        players: ['A', 'B', 'C'].map((userId, i) => ({
          userId,
          teamNumber: i + 1,
          flightNumber: null,
          courseHandicap,
        })),
        bingoBangoBongoHoles: events,
      }).players.map((p) => [p.userId, p.totalPoints]);
    expect(run(36)).toEqual(run(0));
    expect(Object.fromEntries(run(0))).toEqual({ A: 2, B: 3, C: 1 });
  });
});
