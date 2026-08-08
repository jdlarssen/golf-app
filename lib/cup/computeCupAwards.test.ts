import { describe, it, expect } from 'vitest';
import {
  computeCupMvp,
  computeCupUnderperformer,
  MIN_HOLES_FOR_UNDERPERFORMER,
  type CupPerformanceGame,
} from './computeCupAwards';
import type { CupPlayerPointsResult } from './computeCupPlayerPoints';
import type { CupRoster } from './getCupSnapshot';

// Type A (ren logikk, TDD) — cupens to seremonikåringer (#1508).
//
// MVP GJENBRUKER radene fra computeCupPlayerPoints (#1497) og regner aldri
// poeng på nytt — den plukker bare toppen på tvers av begge lag.
//
// «Dro ned mest» måler netto mot par summert over hull spilleren har PERSONLIG
// ført score på. Netto = brutto − strokesForHole(full course_handicap, SI); det
// er bevisst det fulle handicapet, ikke det allowance-justerte (allowance er en
// matchplay-rettferdighetsmekanisme, ikke et prestasjonsmål).
//
// Begge deler kåringen ved likhet (eierbeslutning), og begge returnerer null
// når det ikke finnes noe å kåre.

function roster(overrides: Partial<CupRoster> = {}): CupRoster {
  return {
    team1: [
      { userId: 'p1', name: 'Per', nickname: null },
      { userId: 'p2', name: 'Pål', nickname: null },
    ],
    team2: [
      { userId: 'k1', name: 'Knut', nickname: null },
      { userId: 'k2', name: 'Kari', nickname: null },
    ],
    ...overrides,
  };
}

/** Poeng-rader uten bidragslisten — MVP leser kun `points`. */
function points(rows: Array<[userId: string, displayName: string, pts: number]>, team: 1 | 2) {
  return rows.map(([userId, displayName, pts]) => ({
    userId,
    displayName,
    team,
    points: pts,
    contributions: [],
  }));
}

function playerPoints(
  team1: Array<[string, string, number]>,
  team2: Array<[string, string, number]>,
): CupPlayerPointsResult {
  return { team1: points(team1, 1), team2: points(team2, 2) };
}

/** 9 hull, par 4, SI 1–9 — enkelt regnestykke: netto mot par = brutto − slag − 4. */
function holes9(startHole = 1) {
  return Array.from({ length: 9 }, (_, i) => ({
    number: startHole + i,
    par: 4,
    strokeIndex: i + 1,
  }));
}

/** Én score-rad per hull for én spiller. */
function scoresFor(userId: string, holeNumbers: number[], strokes: number | null) {
  return holeNumbers.map((holeNumber) => ({ userId, holeNumber, strokes }));
}

function game(overrides: Partial<CupPerformanceGame> = {}): CupPerformanceGame {
  return {
    gameId: 'g1',
    holes: holes9(),
    players: [{ userId: 'p1', courseHandicap: 0 }],
    scores: scoresFor('p1', [1, 2, 3, 4, 5, 6, 7, 8, 9], 5),
    ...overrides,
  };
}

describe('computeCupMvp', () => {
  it('kårer spilleren med flest poeng på tvers av begge lag', () => {
    const result = computeCupMvp(
      playerPoints(
        [
          ['p1', 'Per', 2],
          ['p2', 'Pål', 1],
        ],
        [
          ['k1', 'Knut', 3],
          ['k2', 'Kari', 0.5],
        ],
      ),
    );

    // Vinneren ligger på LAG 2 — beviser at kåringen ser på tvers av lagene og
    // ikke bare tar toppen av lag 1.
    expect(result).toEqual({ names: ['Knut'], points: 3 });
  });

  it('deler kåringen ved poenglikhet, med deterministisk navnerekkefølge', () => {
    const result = computeCupMvp(
      playerPoints(
        [
          ['p2', 'Pål', 2.5],
          ['p1', 'Per', 2.5],
        ],
        [
          ['k1', 'Åse', 2.5],
          ['k2', 'Kari', 1],
        ],
      ),
    );

    // Navn asc med norsk collator: Å sorterer SIST i bokmål (ikke som «A»).
    expect(result).toEqual({ names: ['Per', 'Pål', 'Åse'], points: 2.5 });
  });

  it('returnerer null når toppsummen er 0 (ingenting å kåre)', () => {
    expect(
      computeCupMvp(
        playerPoints(
          [
            ['p1', 'Per', 0],
            ['p2', 'Pål', 0],
          ],
          [['k1', 'Knut', 0]],
        ),
      ),
    ).toBeNull();
  });

  it('returnerer null for en cup uten spillere i det hele tatt', () => {
    expect(computeCupMvp(playerPoints([], []))).toBeNull();
  });
});

describe('computeCupUnderperformer', () => {
  it('summerer netto mot par over de personlig førte hullene', () => {
    // Scratch-spiller (CH 0), 9 hull på par 4, brutto 5 hvert hull → +1 per
    // hull = +9 totalt.
    const result = computeCupUnderperformer({ games: [game()], roster: roster() });

    expect(result).toEqual({ names: ['Per'], overPar: 9 });
  });

  it('trekker fra tildelte slag: netto, ikke brutto, måles mot par', () => {
    // CH 9 → ett slag på hvert av SI 1–9. Brutto 5 på par 4 blir netto 4 =
    // nøyaktig på handicapet → ingen underprestasjon, ingen kåring.
    const scratch = computeCupUnderperformer({
      games: [game({ players: [{ userId: 'p1', courseHandicap: 9 }] })],
      roster: roster(),
    });
    expect(scratch).toBeNull();

    // Samme spiller, ett slag mer per hull → netto +1 per hull.
    const worse = computeCupUnderperformer({
      games: [
        game({
          players: [{ userId: 'p1', courseHandicap: 9 }],
          scores: scoresFor('p1', [1, 2, 3, 4, 5, 6, 7, 8, 9], 6),
        }),
      ],
      roster: roster(),
    });
    expect(worse).toEqual({ names: ['Per'], overPar: 9 });
  });

  it('summerer på tvers av flere spill for samme spiller', () => {
    const result = computeCupUnderperformer({
      games: [
        game({ gameId: 'g1', scores: scoresFor('p1', [1, 2, 3, 4, 5], 5) }),
        game({
          gameId: 'g2',
          holes: holes9(10),
          scores: scoresFor('p1', [10, 11, 12, 13], 6),
        }),
      ],
      roster: roster(),
    });

    // g1: 5 hull × +1 = 5. g2: 4 hull × +2 = 8. Til sammen 9 hull, +13.
    expect(result).toEqual({ names: ['Per'], overPar: 13 });
  });

  it(`krever minst ${MIN_HOLES_FOR_UNDERPERFORMER} førte hull — 8 hull kvalifiserer ikke`, () => {
    const result = computeCupUnderperformer({
      games: [game({ scores: scoresFor('p1', [1, 2, 3, 4, 5, 6, 7, 8], 8) })],
      roster: roster(),
    });

    expect(result).toBeNull();
  });

  it(`kvalifiserer på nøyaktig ${MIN_HOLES_FOR_UNDERPERFORMER} hull (grensen er inklusiv)`, () => {
    expect(MIN_HOLES_FOR_UNDERPERFORMER).toBe(9);
    const result = computeCupUnderperformer({ games: [game()], roster: roster() });

    expect(result).toEqual({ names: ['Per'], overPar: 9 });
  });

  it('velger den med høyest diff blant flere kvalifiserte', () => {
    const result = computeCupUnderperformer({
      games: [
        game({
          players: [
            { userId: 'p1', courseHandicap: 0 },
            { userId: 'k1', courseHandicap: 0 },
          ],
          scores: [
            ...scoresFor('p1', [1, 2, 3, 4, 5, 6, 7, 8, 9], 5),
            ...scoresFor('k1', [1, 2, 3, 4, 5, 6, 7, 8, 9], 7),
          ],
        }),
      ],
      roster: roster(),
    });

    // Knut: +3 per hull × 9 = 27 mot Pers 9.
    expect(result).toEqual({ names: ['Knut'], overPar: 27 });
  });

  it('deler kåringen ved lik diff, med deterministisk navnerekkefølge', () => {
    const result = computeCupUnderperformer({
      games: [
        game({
          players: [
            { userId: 'k1', courseHandicap: 0 },
            { userId: 'p1', courseHandicap: 0 },
          ],
          scores: [
            ...scoresFor('k1', [1, 2, 3, 4, 5, 6, 7, 8, 9], 5),
            ...scoresFor('p1', [1, 2, 3, 4, 5, 6, 7, 8, 9], 5),
          ],
        }),
      ],
      roster: roster(),
    });

    expect(result).toEqual({ names: ['Knut', 'Per'], overPar: 9 });
  });

  it('returnerer null når toppdiffen er ≤ 0 (alle spilte til eller bedre enn handicapet)', () => {
    const result = computeCupUnderperformer({
      games: [game({ scores: scoresFor('p1', [1, 2, 3, 4, 5, 6, 7, 8, 9], 4) })],
      roster: roster(),
    });

    expect(result).toBeNull();
  });

  it('hopper over hull uten registrert score — teller verken i diff eller hulltellingen', () => {
    // Plukket ball i best ball: 3 hull uten score. 6 førte hull < 9 → ingen
    // kåring, selv om de førte hullene alle er over par.
    const result = computeCupUnderperformer({
      games: [
        game({
          scores: [
            ...scoresFor('p1', [1, 2, 3, 4, 5, 6], 6),
            ...scoresFor('p1', [7, 8, 9], null),
          ],
        }),
      ],
      roster: roster(),
    });

    expect(result).toBeNull();
  });

  it('ignorerer score-rader utenfor spillets hull-segment', () => {
    // Back9-spill (hull 10–18) med gjenliggende front9-rader i score-settet:
    // kun segmentets hull skal telle.
    const result = computeCupUnderperformer({
      games: [
        game({
          holes: holes9(10),
          scores: [
            ...scoresFor('p1', [10, 11, 12, 13, 14, 15, 16, 17, 18], 5),
            ...scoresFor('p1', [1, 2, 3], 10),
          ],
        }),
      ],
      roster: roster(),
    });

    // Bare de 9 segment-hullene: +1 hver. Front9-radene ville gitt +6 hver.
    expect(result).toEqual({ names: ['Per'], overPar: 9 });
  });

  it('hopper over scores fra spillere som ikke står i rosteret', () => {
    const result = computeCupUnderperformer({
      games: [
        game({
          players: [
            { userId: 'p1', courseHandicap: 0 },
            { userId: 'gjest', courseHandicap: 0 },
          ],
          scores: [
            ...scoresFor('p1', [1, 2, 3, 4, 5, 6, 7, 8, 9], 5),
            ...scoresFor('gjest', [1, 2, 3, 4, 5, 6, 7, 8, 9], 9),
          ],
        }),
      ],
      roster: roster(),
    });

    expect(result).toEqual({ names: ['Per'], overPar: 9 });
  });

  it('hopper over scores uten en tilhørende spiller-rad (mangler course_handicap)', () => {
    const result = computeCupUnderperformer({
      games: [
        game({
          players: [{ userId: 'p1', courseHandicap: 0 }],
          scores: [
            ...scoresFor('p1', [1, 2, 3, 4, 5, 6, 7, 8, 9], 5),
            ...scoresFor('k1', [1, 2, 3, 4, 5, 6, 7, 8, 9], 9),
          ],
        }),
      ],
      roster: roster(),
    });

    expect(result).toEqual({ names: ['Per'], overPar: 9 });
  });

  it('returnerer null uten personlig førte spill (f.eks. ren greensome-cup)', () => {
    expect(computeCupUnderperformer({ games: [], roster: roster() })).toBeNull();
  });

  it('teller samme hullnummer i to ULIKE spill hver for seg', () => {
    // To-dagers cup: samme spiller spiller hull 1–9 begge dagene. Begge
    // rundene er ekte prestasjoner og skal begge telle — derfor deduper
    // aggregatoren ALDRI på (spiller, hull).
    //
    // Vernet mot dobbelttelling på splittet cup-dag (#1441 — host og avledet
    // deler ett scoresett) ligger derfor der forskjellen faktisk er kjent:
    // getCupSnapshot slipper kun host-spill inn i performance-inputen. Se
    // dobbelttellings-testen i getCupSnapshot.test.ts.
    const result = computeCupUnderperformer({
      games: [game({ gameId: 'dag1' }), game({ gameId: 'dag2' })],
      roster: roster(),
    });

    expect(result).toEqual({ names: ['Per'], overPar: 18 });
  });

  it('bruker kallenavn foran navn, samme regel som poengregnskapet', () => {
    const result = computeCupUnderperformer({
      games: [game()],
      roster: roster({ team1: [{ userId: 'p1', name: 'Per', nickname: 'Pelle' }] }),
    });

    expect(result).toEqual({ names: ['Pelle'], overPar: 9 });
  });
});
