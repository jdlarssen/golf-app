import { describe, it, expect } from 'vitest';
import {
  computeCupBestBallAward,
  type CupBestBallAwardInput,
} from './computeCupBestBallAward';
import { compute as bestBallCompute } from '@/lib/scoring/modes/bestBall';
import type { ScoringContext } from '@/lib/scoring/modes/types';

// Type-A unit-test for splittet-cup-dagens best-ball-cup-poeng (#1441, D4).
// Ren funksjon over holes+scores+sides — netto lagtotal (lavest vinner), IKKE
// hull-for-hull som matchplay-familien. Funksjonen tar ingen stilling til
// games.status ('finished') — det er kallerens ansvar (getCupSnapshot, F3b),
// se kontrakt-kommentaren i selve fila.
//
// #1539/#1551: funksjonen anvender ingen allowance selv. `courseHandicap` er
// det frosne banehandicapet, der `games.hcp_allowance_pct` alt er trukket fra.

function holes(n: number, startingAt = 10) {
  return Array.from({ length: n }, (_, i) => ({
    number: startingAt + i,
    strokeIndex: i + 1,
  }));
}

function score(userId: string, holeNumber: number, gross: number | null) {
  return { userId, holeNumber, gross };
}

describe('computeCupBestBallAward', () => {
  it('side 1 vinner på lavere netto lagtotal, formatert som «side1–side2»', () => {
    const h = holes(2);
    const input: CupBestBallAwardInput = {
      side1: [
        { userId: 'a1', courseHandicap: 0 },
        { userId: 'a2', courseHandicap: 0 },
      ],
      side2: [
        { userId: 'b1', courseHandicap: 0 },
        { userId: 'b2', courseHandicap: 0 },
      ],
      holes: h,
      scores: [
        score('a1', 10, 4),
        score('a2', 10, 6),
        score('a1', 11, 4),
        score('a2', 11, 6),
        score('b1', 10, 5),
        score('b2', 10, 7),
        score('b1', 11, 5),
        score('b2', 11, 7),
      ],
    };
    const result = computeCupBestBallAward(input);
    expect(result).toEqual({ winnerSide: 1, formatted: '8–10' });
  });

  it('lik netto lagtotal → winnerSide "tied"', () => {
    const h = holes(2);
    const input: CupBestBallAwardInput = {
      side1: [
        { userId: 'a1', courseHandicap: 0 },
        { userId: 'a2', courseHandicap: 0 },
      ],
      side2: [
        { userId: 'b1', courseHandicap: 0 },
        { userId: 'b2', courseHandicap: 0 },
      ],
      holes: h,
      scores: [
        score('a1', 10, 5),
        score('a2', 10, 6),
        score('a1', 11, 5),
        score('a2', 11, 6),
        score('b1', 10, 5),
        score('b2', 10, 6),
        score('b1', 11, 5),
        score('b2', 11, 6),
      ],
    };
    const result = computeCupBestBallAward(input);
    expect(result).toEqual({ winnerSide: 'tied', formatted: '10–10' });
  });

  it('bruker det frosne banehandicapet rått — ingen allowance trekkes her', () => {
    // Frosset CH 15 = 18 spilt på 85 %, allerede trukket fra ved start.
    // 15 gir 1 slag på SI 1-2 → netto 4 per hull → 8 total mot side2s 10.
    // Trakk funksjonen 85 % en gang til (15 → 13), ville side1 fortsatt fått
    // 1 slag på SI 1-2 her — derfor er det den EKSPLISITTE grensen under som
    // faktisk fanger dobbelttrekket.
    const h = holes(2);
    const input: CupBestBallAwardInput = {
      side1: [
        { userId: 'a1', courseHandicap: 15 },
        { userId: 'a2', courseHandicap: 15 },
      ],
      side2: [
        { userId: 'b1', courseHandicap: 0 },
        { userId: 'b2', courseHandicap: 0 },
      ],
      holes: h,
      scores: [
        score('a1', 10, 5),
        score('a2', 10, 5),
        score('a1', 11, 5),
        score('a2', 11, 5),
        score('b1', 10, 5),
        score('b2', 10, 5),
        score('b1', 11, 5),
        score('b2', 11, 5),
      ],
    };
    expect(computeCupBestBallAward(input)).toEqual({
      winnerSide: 1,
      formatted: '8–10',
    });
  });

  it('Ryder Cup 2026-regresjonen: frosset CH 37 gir 18 slag på 9 hull, ikke 15', () => {
    // #1551, målt i prod: Kristoffer hadde banehandicap 44, frosset til 37
    // (85 %). Cup-poenget trakk så 85 % igjen → 31, som gir 15 slag over ni
    // hull i stedet for 18. Her spiller side1 alene mot scratch-motstand:
    // med 37 får a1 slag på ALLE ni hull (37 ≥ 9 → minst ett per hull, to på
    // SI 1-9 der 37-18=19 rekker), med 31 ville hull med SI 7-9 fått ett
    // slag mindre. Nettoen skiller derfor de to.
    const h = holes(9);
    const scores = [
      ...h.flatMap((hole) => [
        score('a1', hole.number, 6),
        score('a2', hole.number, 9),
        score('b1', hole.number, 5),
        score('b2', hole.number, 9),
      ]),
    ];
    const input: CupBestBallAwardInput = {
      side1: [
        { userId: 'a1', courseHandicap: 37 },
        { userId: 'a2', courseHandicap: 0 },
      ],
      side2: [
        { userId: 'b1', courseHandicap: 0 },
        { userId: 'b2', courseHandicap: 0 },
      ],
      holes: h,
      scores,
    };
    // Låst eksakt verdi, ikke bare «side1 vinner»: med det frosne 37 blir
    // lagtotalen 35. Trekker funksjonen 85 % en gang til (37 → 31) blir den
    // 36, og testen går rød. Det er nettopp det dobbelttrekket #1551
    // beskriver — en løsere assertion ville passert i begge tilfeller.
    expect(computeCupBestBallAward(input)?.formatted).toBe('35–45');
  });

  // #1539/#1551, kriterium K5: kampens egen tavle (motorens `compute()`) og
  // cup-poenget må regne med SAMME effektive banehandicap. De to gjorde det
  // ikke før: `compute()` brukte den frosne verdien, cup-poenget la en ny
  // allowance oppå. Testen sammenligner de to lagene direkte.
  describe('samme effektive handicap som kampens egen tavle', () => {
    it('lagtotalene fra bestBall.compute() er identiske med cup-poengets', () => {
      const h = holes(9);
      const frozen = { a1: 37, a2: 4, b1: 9, b2: 2 };
      const gross: Record<string, number> = { a1: 6, a2: 5, b1: 5, b2: 6 };
      const flatScores = h.flatMap((hole) =>
        (['a1', 'a2', 'b1', 'b2'] as const).map((id) =>
          score(id, hole.number, gross[id]),
        ),
      );

      const ctx: ScoringContext = {
        game: {
          id: 'g1',
          game_mode: 'best_ball',
          mode_config: { kind: 'best_ball', team_size: 2, teams_count: 2 },
        },
        players: [
          { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: frozen.a1 },
          { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: frozen.a2 },
          { userId: 'b1', teamNumber: 2, flightNumber: 1, courseHandicap: frozen.b1 },
          { userId: 'b2', teamNumber: 2, flightNumber: 1, courseHandicap: frozen.b2 },
        ],
        holes: h.map((hole) => ({ number: hole.number, par: 4, strokeIndex: hole.strokeIndex })),
        scores: flatScores.map((s) => ({
          userId: s.userId,
          holeNumber: s.holeNumber,
          gross: s.gross,
        })),
      };

      const engine = bestBallCompute(ctx);
      const team1 = engine.teams.find((t) => t.teamNumber === 1);
      const team2 = engine.teams.find((t) => t.teamNumber === 2);

      const award = computeCupBestBallAward({
        side1: [
          { userId: 'a1', courseHandicap: frozen.a1 },
          { userId: 'a2', courseHandicap: frozen.a2 },
        ],
        side2: [
          { userId: 'b1', courseHandicap: frozen.b1 },
          { userId: 'b2', courseHandicap: frozen.b2 },
        ],
        holes: h,
        scores: flatScores,
      });

      expect(award?.formatted).toBe(`${team1?.total}–${team2?.total}`);
    });
  });

  it('manglende scores på ETT hull for én side → null (partial sum kan ikke sammenlignes)', () => {
    const h = holes(3);
    const input: CupBestBallAwardInput = {
      side1: [
        { userId: 'a1', courseHandicap: 0 },
        { userId: 'a2', courseHandicap: 0 },
      ],
      side2: [
        { userId: 'b1', courseHandicap: 0 },
        { userId: 'b2', courseHandicap: 0 },
      ],
      holes: h,
      scores: [
        score('a1', 10, 4),
        score('a2', 10, 5),
        score('a1', 11, 4),
        score('a2', 11, 5),
        score('a1', 12, 4),
        score('a2', 12, 5),
        score('b1', 10, 5),
        score('b2', 10, 6),
        score('b1', 11, 5),
        score('b2', 11, 6),
        // hole 12: side2 has no scores at all → missingHoles for side2
      ],
    };
    expect(computeCupBestBallAward(input)).toBeNull();
  });

  it('feil antall spillere per side (ikke 2+2) → null', () => {
    const h = holes(1);
    const input: CupBestBallAwardInput = {
      side1: [{ userId: 'a1', courseHandicap: 0 }],
      side2: [
        { userId: 'b1', courseHandicap: 0 },
        { userId: 'b2', courseHandicap: 0 },
      ],
      holes: h,
      scores: [score('a1', 10, 4), score('b1', 10, 5), score('b2', 10, 6)],
    };
    expect(computeCupBestBallAward(input)).toBeNull();
  });

  it('ingen hull i scope → null', () => {
    const input: CupBestBallAwardInput = {
      side1: [
        { userId: 'a1', courseHandicap: 0 },
        { userId: 'a2', courseHandicap: 0 },
      ],
      side2: [
        { userId: 'b1', courseHandicap: 0 },
        { userId: 'b2', courseHandicap: 0 },
      ],
      holes: [],
      scores: [],
    };
    expect(computeCupBestBallAward(input)).toBeNull();
  });
});
