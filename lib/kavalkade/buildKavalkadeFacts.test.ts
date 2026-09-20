import { describe, it, expect } from 'vitest';
import type { HoleScore } from '@/lib/stats/achievements';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import { KAVALKADE_CUTOFF, KAVALKADE_YEAR } from './release';
import {
  buildKavalkadeFacts,
  KAVALKADE_ROUNDS_NEEDED,
  type KavalkadeGame,
  type KavalkadePlayerRound,
} from './buildKavalkadeFacts';

const ME = 'user-me';
const PAR = 4;

/** 18 hull à par 4. `strokes` settes per hull av overstyringene. */
function holes(overrides: Record<number, number | null> = {}): HoleScore[] {
  return Array.from({ length: 18 }, (_, i) => {
    const holeNumber = i + 1;
    const override = Object.prototype.hasOwnProperty.call(overrides, holeNumber)
      ? overrides[holeNumber]
      : PAR;
    return { holeNumber, strokes: override, par: PAR };
  });
}

/** Runde der hvert hull gikk på `strokes` slag. 18 × 4 = 72 brutto. */
function flatRound(strokes: number): HoleScore[] {
  return Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    strokes,
    par: PAR,
  }));
}

function player(
  userId: string,
  opts: Partial<KavalkadePlayerRound> = {},
): KavalkadePlayerRound {
  return {
    userId,
    name: userId,
    withdrawnAt: null,
    resultSummary: null,
    courseHandicap: null,
    holes: holes(),
    ...opts,
  };
}

function placement(rank: number, fieldSize = 4): ResultSummary {
  return { kind: 'placement', rank, fieldSize, isTeam: false };
}

let gameCounter = 0;
function game(opts: Partial<KavalkadeGame> = {}): KavalkadeGame {
  gameCounter += 1;
  const playedAt = opts.playedAt ?? new Date('2026-06-01T08:00:00Z');
  return {
    gameId: `game-${String(gameCounter).padStart(3, '0')}`,
    gameName: 'Torsdagsrunden',
    courseName: 'Losby',
    year: KAVALKADE_YEAR,
    endedAt: opts.endedAt ?? playedAt,
    playedAt,
    players: [player(ME)],
    ...opts,
  };
}

function build(games: KavalkadeGame[], viewerUserId = ME) {
  return buildKavalkadeFacts({
    viewerUserId,
    year: KAVALKADE_YEAR,
    cutoff: KAVALKADE_CUTOFF,
    games,
  });
}

/** Tre likegyldige runder — nok til å komme over terskelen. */
function threeRounds(): KavalkadeGame[] {
  return [
    game({ playedAt: new Date('2026-05-01T08:00:00Z') }),
    game({ playedAt: new Date('2026-06-01T08:00:00Z') }),
    game({ playedAt: new Date('2026-07-01T08:00:00Z') }),
  ];
}

describe('terskelen på tre runder', () => {
  it('holds the personal cards back below the threshold', () => {
    const facts = build([game(), game()]);
    expect(facts.rounds).toBe(2);
    expect(facts.roundsNeeded).toBe(KAVALKADE_ROUNDS_NEEDED);
    expect(facts.personal).toBeNull();
  });

  it('still builds the gang cavalcade below the threshold', () => {
    const facts = build([
      game({ players: [player(ME), player('user-b')] }),
    ]);
    expect(facts.personal).toBeNull();
    expect(facts.gang).not.toBeNull();
    expect(facts.gang?.members).toBe(2);
  });

  it('opens the personal cards at exactly three finished rounds', () => {
    const facts = build(threeRounds());
    expect(facts.rounds).toBe(3);
    expect(facts.personal).not.toBeNull();
  });

  it('counts finished rounds, not only complete 18-hole ones', () => {
    const nineHoles = holes().slice(0, 9);
    const facts = build([
      game({ players: [player(ME, { holes: nineHoles })] }),
      game({ players: [player(ME, { holes: nineHoles })] }),
      game({ players: [player(ME, { holes: nineHoles })] }),
    ]);
    expect(facts.rounds).toBe(3);
    expect(facts.personal).not.toBeNull();
    expect(facts.personal?.bestRound).toBeNull();
  });

  it('is empty all round when the year has no finished games', () => {
    const facts = build([]);
    expect(facts).toMatchObject({
      year: KAVALKADE_YEAR,
      rounds: 0,
      personal: null,
      gang: null,
    });
    expect(facts.cutoff).toBe(KAVALKADE_CUTOFF.toISOString());
  });
});

describe('frysegrensen', () => {
  const justBefore = new Date(KAVALKADE_CUTOFF.getTime() - 1);
  const justAfter = new Date(KAVALKADE_CUTOFF.getTime() + 1);

  it('includes a round that ended one millisecond before the cutoff', () => {
    const facts = build([
      game({ playedAt: justBefore, endedAt: justBefore }),
    ]);
    expect(facts.rounds).toBe(1);
  });

  it('excludes a round that ended one millisecond after the cutoff', () => {
    const facts = build([game({ playedAt: justAfter, endedAt: justAfter })]);
    expect(facts.rounds).toBe(0);
    expect(facts.gang).toBeNull();
  });

  it('excludes a round that ended exactly at the cutoff', () => {
    const facts = build([
      game({ playedAt: KAVALKADE_CUTOFF, endedAt: new Date(KAVALKADE_CUTOFF) }),
    ]);
    expect(facts.rounds).toBe(0);
  });

  it('keeps a Christmas Eve round out even when the rest of the year is in', () => {
    const facts = build([
      ...threeRounds(),
      game({
        gameName: 'Julaftenrunden',
        playedAt: justAfter,
        endedAt: justAfter,
        players: [player(ME, { holes: flatRound(2) })], // ville vært årets beste
      }),
    ]);
    expect(facts.rounds).toBe(3);
    expect(facts.personal?.bestRound?.gameName).not.toBe('Julaftenrunden');
  });

  it('excludes a round with no end time at all', () => {
    const facts = build([game({ endedAt: null })]);
    expect(facts.rounds).toBe(0);
  });

  it('excludes rounds from another year', () => {
    const facts = build([
      game({ year: 2025, playedAt: new Date('2025-06-01T08:00:00Z') }),
    ]);
    expect(facts.rounds).toBe(0);
  });
});

describe('beste runde', () => {
  it('picks the lowest complete 18-hole gross of the year', () => {
    const facts = build([
      game({
        gameName: 'Mai',
        playedAt: new Date('2026-05-01T08:00:00Z'),
        players: [player(ME, { holes: flatRound(5) })], // 90
      }),
      game({
        gameName: 'Juni',
        playedAt: new Date('2026-06-01T08:00:00Z'),
        players: [player(ME, { holes: flatRound(4) })], // 72
      }),
      game({
        gameName: 'Juli',
        playedAt: new Date('2026-07-01T08:00:00Z'),
        players: [player(ME, { holes: flatRound(6) })], // 108
      }),
    ]);
    expect(facts.personal?.bestRound).toMatchObject({
      gameName: 'Juni',
      courseName: 'Losby',
      brutto: 72,
      playedAt: '2026-06-01T08:00:00.000Z',
    });
  });

  it('keeps the earliest round when two share the record', () => {
    const facts = build([
      game({
        gameName: 'Først',
        playedAt: new Date('2026-05-01T08:00:00Z'),
        players: [player(ME, { holes: flatRound(4) })],
      }),
      game({
        gameName: 'Senere',
        playedAt: new Date('2026-06-01T08:00:00Z'),
        players: [player(ME, { holes: flatRound(4) })],
      }),
      game({ playedAt: new Date('2026-07-01T08:00:00Z') }),
    ]);
    expect(facts.personal?.bestRound?.gameName).toBe('Først');
  });

  it('ignores an incomplete round even when its partial total is lower', () => {
    const nine = flatRound(3).slice(0, 9); // 27 slag, men bare 9 hull
    const facts = build([
      game({ players: [player(ME, { holes: nine })] }),
      game({ players: [player(ME, { holes: flatRound(5) })] }), // 90
      game({ players: [player(ME, { holes: flatRound(5) })] }),
    ]);
    expect(facts.personal?.bestRound?.brutto).toBe(90);
  });
});

describe('årets totaler', () => {
  it('reports the season the same way the history hub does', () => {
    const facts = build([
      game({
        playedAt: new Date('2026-05-01T08:00:00Z'),
        players: [player(ME, { holes: flatRound(5) })], // 90
      }),
      game({
        playedAt: new Date('2026-06-01T08:00:00Z'),
        players: [player(ME, { holes: holes({ 1: 3, 2: 8 }) })], // 72 − 1 + 4 = 75
      }),
      game({
        playedAt: new Date('2026-07-01T08:00:00Z'),
        players: [player(ME, { holes: flatRound(4) })], // 72
      }),
    ]);
    expect(facts.personal?.season).toEqual({
      year: KAVALKADE_YEAR,
      rounds: 3,
      grossAverage: 79, // (90 + 75 + 72) / 3 = 79
      bestRound: 72,
      achievements: {
        holeInOne: 0,
        eagle: 0,
        birdie: 1,
        turkey: 0,
        snowman: 1,
      },
    });
  });

  it('agrees with the best-round card — one number, two homes', () => {
    const facts = build([
      game({ players: [player(ME, { holes: flatRound(5) })] }),
      game({ players: [player(ME, { holes: flatRound(4) })] }),
      game({ players: [player(ME, { holes: flatRound(6) })] }),
    ]);
    expect(facts.personal?.season?.bestRound).toBe(facts.personal?.bestRound?.brutto);
  });

  it('counts every finished round but averages only the complete ones', () => {
    const facts = build([
      game({ players: [player(ME, { holes: flatRound(4).slice(0, 9) })] }),
      game({ players: [player(ME, { holes: flatRound(5) })] }), // 90
      game({ players: [player(ME, { holes: flatRound(5) })] }), // 90
    ]);
    expect(facts.personal?.season).toMatchObject({
      rounds: 3,
      grossAverage: 90,
      bestRound: 90,
    });
  });
});

describe('nemesis-hullet', () => {
  it('finds the hole with the worst average against par', () => {
    // Hull 7 går på 8 slag hver gang (+4), hull 3 på 6 slag (+2).
    const bad = () => holes({ 7: 8, 3: 6 });
    const facts = build([
      game({ players: [player(ME, { holes: bad() })] }),
      game({ players: [player(ME, { holes: bad() })] }),
      game({ players: [player(ME, { holes: bad() })] }),
    ]);
    expect(facts.personal?.nemesisHole).toEqual({
      holeNumber: 7,
      played: 3,
      averageToPar: 4,
      worstStrokes: 8,
    });
  });

  it('needs at least three visits before a hole can be the nemesis', () => {
    // Hull 12 er grusomt, men bare spilt to ganger; hull 5 er nest verst × 3.
    const withTwelve = holes({ 12: 10, 5: 6 });
    const withoutTwelve = holes({ 12: null, 5: 6 });
    const facts = build([
      game({ players: [player(ME, { holes: withTwelve })] }),
      game({ players: [player(ME, { holes: withTwelve })] }),
      game({ players: [player(ME, { holes: withoutTwelve })] }),
    ]);
    expect(facts.personal?.nemesisHole?.holeNumber).toBe(5);
    expect(facts.personal?.nemesisHole?.played).toBe(3);
  });

  it('breaks a tie on visits first, then on the lower hole number', () => {
    const both = holes({ 4: 6, 9: 6 });
    const facts = build([
      game({ players: [player(ME, { holes: both })] }),
      game({ players: [player(ME, { holes: both })] }),
      game({ players: [player(ME, { holes: both })] }),
    ]);
    expect(facts.personal?.nemesisHole?.holeNumber).toBe(4);
  });

  it('is null when no hole has been played three times', () => {
    const facts = build([
      game({ players: [player(ME, { holes: holes().slice(0, 6) })] }),
      game({ players: [player(ME, { holes: holes().slice(6, 12) })] }),
      game({ players: [player(ME, { holes: holes().slice(12, 18) })] }),
    ]);
    expect(facts.personal?.nemesisHole).toBeNull();
  });
});

describe('rival-regnskapet', () => {
  it('picks the player met most often and tallies the head-to-head', () => {
    const rounds = [
      game({
        playedAt: new Date('2026-05-01T08:00:00Z'),
        players: [
          player(ME, { resultSummary: placement(1) }),
          player('user-rival', { resultSummary: placement(2) }),
        ],
      }),
      game({
        playedAt: new Date('2026-06-01T08:00:00Z'),
        players: [
          player(ME, { resultSummary: placement(2) }),
          player('user-rival', { resultSummary: placement(1) }),
        ],
      }),
      game({
        playedAt: new Date('2026-07-01T08:00:00Z'),
        players: [
          player(ME, { resultSummary: placement(1) }),
          player('user-rival', { resultSummary: placement(1) }),
          player('user-sjelden', { resultSummary: placement(3) }),
        ],
      }),
    ];
    expect(build(rounds).personal?.rival).toEqual({
      userId: 'user-rival',
      name: 'user-rival',
      met: 3,
      decided: 3,
      wins: 1,
      losses: 1,
      ties: 1,
    });
  });

  it('counts a shared round as a meeting even when the outcome is missing', () => {
    const rounds = [
      game({ players: [player(ME), player('user-rival')] }),
      game({
        players: [
          player(ME, { resultSummary: placement(1) }),
          player('user-rival', { resultSummary: placement(2) }),
        ],
      }),
      game({ players: [player(ME), player('user-rival')] }),
    ];
    expect(build(rounds).personal?.rival).toMatchObject({
      met: 3,
      decided: 1,
      wins: 1,
      losses: 0,
      ties: 0,
    });
  });

  it('reads a matchplay result on its own scale', () => {
    const matchplay = (outcome: 'win' | 'loss' | 'tie'): ResultSummary => ({
      kind: 'matchplay',
      outcome,
      margin: outcome === 'tie' ? null : '3&2',
    });
    const rounds = [
      game({
        players: [
          player(ME, { resultSummary: matchplay('win') }),
          player('user-rival', { resultSummary: matchplay('loss') }),
        ],
      }),
      game({
        players: [
          player(ME, { resultSummary: matchplay('loss') }),
          player('user-rival', { resultSummary: matchplay('win') }),
        ],
      }),
      game({
        players: [
          player(ME, { resultSummary: matchplay('tie') }),
          player('user-rival', { resultSummary: matchplay('tie') }),
        ],
      }),
    ];
    expect(build(rounds).personal?.rival).toMatchObject({
      decided: 3,
      wins: 1,
      losses: 1,
      ties: 1,
    });
  });

  it('never measures a placement against a matchplay outcome', () => {
    const rounds = [
      game({
        players: [
          player(ME, { resultSummary: placement(1) }),
          player('user-rival', {
            resultSummary: { kind: 'matchplay', outcome: 'win', margin: '2 up' },
          }),
        ],
      }),
      game({ players: [player(ME), player('user-rival')] }),
      game({ players: [player(ME), player('user-rival')] }),
    ];
    expect(build(rounds).personal?.rival).toMatchObject({ met: 3, decided: 0 });
  });

  it('breaks a tie on meetings with the most recent partner', () => {
    const rounds = [
      game({
        playedAt: new Date('2026-05-01T08:00:00Z'),
        players: [player(ME), player('user-a')],
      }),
      game({
        playedAt: new Date('2026-06-01T08:00:00Z'),
        players: [player(ME), player('user-b')],
      }),
      game({
        playedAt: new Date('2026-07-01T08:00:00Z'),
        players: [player(ME), player('user-b')],
      }),
      game({
        playedAt: new Date('2026-08-01T08:00:00Z'),
        players: [player(ME), player('user-a')],
      }),
    ];
    expect(build(rounds).personal?.rival?.userId).toBe('user-a');
  });

  it('is null when every round was played alone', () => {
    expect(build(threeRounds()).personal?.rival).toBeNull();
  });

  it('ignores a player who withdrew from the round', () => {
    const rounds = threeRounds().map((g) => ({
      ...g,
      players: [player(ME), player('user-trakk-seg', { withdrawnAt: '2026-06-01T09:00:00Z' })],
    }));
    expect(build(rounds).personal?.rival).toBeNull();
  });
});

describe('formtoppen', () => {
  it('finds the best three-round stretch of the year', () => {
    const rounds = [
      game({
        playedAt: new Date('2026-04-01T08:00:00Z'),
        players: [player(ME, { holes: flatRound(6) })], // 108
      }),
      game({
        playedAt: new Date('2026-05-01T08:00:00Z'),
        players: [player(ME, { holes: flatRound(4) })], // 72
      }),
      game({
        playedAt: new Date('2026-06-01T08:00:00Z'),
        players: [player(ME, { holes: flatRound(4) })], // 72
      }),
      game({
        playedAt: new Date('2026-07-01T08:00:00Z'),
        players: [player(ME, { holes: flatRound(5) })], // 90
      }),
    ];
    expect(build(rounds).personal?.formPeak.stretch).toEqual({
      rounds: 3,
      averageBrutto: 78,
      fromDate: '2026-05-01T08:00:00.000Z',
      toDate: '2026-07-01T08:00:00.000Z',
    });
  });

  it('summarises the season start, now and best alongside it', () => {
    const rounds = [
      game({
        playedAt: new Date('2026-04-01T08:00:00Z'),
        players: [player(ME, { holes: flatRound(5), courseHandicap: 10 })], // 90 / 80
      }),
      game({
        playedAt: new Date('2026-05-01T08:00:00Z'),
        players: [player(ME, { holes: flatRound(4), courseHandicap: 10 })], // 72 / 62
      }),
      game({
        playedAt: new Date('2026-06-01T08:00:00Z'),
        players: [player(ME, { holes: flatRound(6), courseHandicap: 10 })], // 108 / 98
      }),
    ];
    expect(build(rounds).personal?.formPeak.season).toEqual({
      brutto: { start: 90, now: 108, best: 72 },
      netto: { start: 80, now: 98, best: 62 },
    });
  });

  it('has no stretch when fewer than three rounds were complete', () => {
    const nine = flatRound(4).slice(0, 9);
    const rounds = [
      game({ players: [player(ME, { holes: flatRound(5) })] }),
      game({ players: [player(ME, { holes: flatRound(4) })] }),
      game({ players: [player(ME, { holes: nine })] }),
    ];
    const formPeak = build(rounds).personal?.formPeak;
    expect(formPeak?.stretch).toBeNull();
    expect(formPeak?.season).not.toBeNull();
  });

  it('is empty both ways when no round was complete', () => {
    const nine = flatRound(4).slice(0, 9);
    const rounds = threeRounds().map((g) => ({
      ...g,
      players: [player(ME, { holes: nine })],
    }));
    expect(build(rounds).personal?.formPeak).toEqual({ stretch: null, season: null });
  });
});

describe('gjengen', () => {
  it('counts the circle as everyone who finished a round with you', () => {
    const facts = build([
      game({ players: [player(ME), player('user-a')] }),
      game({ players: [player(ME), player('user-b'), player('user-c')] }),
    ]);
    expect(facts.gang).toMatchObject({ members: 4, games: 2 });
  });

  it('crowns the player with the most wins', () => {
    const facts = build([
      game({
        players: [
          player(ME, { resultSummary: placement(2) }),
          player('user-a', { resultSummary: placement(1) }),
        ],
      }),
      game({
        players: [
          player(ME, { resultSummary: placement(2) }),
          player('user-a', { resultSummary: placement(1) }),
        ],
      }),
      game({
        players: [
          player(ME, { resultSummary: placement(1) }),
          player('user-a', { resultSummary: placement(2) }),
        ],
      }),
    ]);
    expect(facts.gang?.topWinner).toEqual({
      userId: 'user-a',
      name: 'user-a',
      count: 2,
    });
  });

  it('leaves the winner card empty when nobody has a stored result', () => {
    expect(build(threeRounds()).gang?.topWinner).toBeNull();
  });

  it('counts birdies across the circle', () => {
    // user-a får tre birdier per runde, jeg får én.
    const facts = build([
      game({
        players: [
          player(ME, { holes: holes({ 1: 3 }) }),
          player('user-a', { holes: holes({ 1: 3, 2: 3, 3: 3 }) }),
        ],
      }),
    ]);
    expect(facts.gang?.mostBirdies).toEqual({
      userId: 'user-a',
      name: 'user-a',
      count: 3,
    });
  });

  it('crowns the snowman of the year', () => {
    const facts = build([
      game({
        players: [
          player(ME, { holes: holes({ 4: 8 }) }),
          player('user-a', { holes: holes({ 4: 8, 5: 8 }) }),
        ],
      }),
    ]);
    expect(facts.gang?.mostSnowmen).toMatchObject({ userId: 'user-a', count: 2 });
  });

  it('leaves the snowman card empty when nobody blew up', () => {
    expect(build(threeRounds()).gang?.mostSnowmen).toBeNull();
  });

  it('finds the tightest finish by stroke margin', () => {
    const facts = build([
      game({
        gameName: 'Blowout',
        playedAt: new Date('2026-05-01T08:00:00Z'),
        players: [
          player(ME, { holes: flatRound(4) }), // 72
          player('user-a', { holes: flatRound(6) }), // 108
        ],
      }),
      game({
        gameName: 'Thriller',
        playedAt: new Date('2026-06-01T08:00:00Z'),
        players: [
          player(ME, { holes: flatRound(5) }), // 90
          player('user-a', { holes: holes({ 1: 6 }) }), // 74
        ],
      }),
      game({
        gameName: 'Fotofinish',
        playedAt: new Date('2026-07-01T08:00:00Z'),
        players: [
          player(ME, { holes: flatRound(4) }), // 72
          player('user-a', { holes: holes({ 1: 5 }) }), // 73
        ],
      }),
    ]);
    expect(facts.gang?.tightestFinish).toMatchObject({
      gameName: 'Fotofinish',
      strokeMargin: 1,
      leader: { userId: ME, brutto: 72 },
      runnerUp: { userId: 'user-a', brutto: 73 },
    });
  });

  it('reports a shared lead as a margin of zero', () => {
    const facts = build([
      game({
        players: [
          player(ME, { holes: flatRound(4) }),
          player('user-a', { holes: flatRound(4) }),
        ],
      }),
    ]);
    expect(facts.gang?.tightestFinish?.strokeMargin).toBe(0);
  });

  it('needs two complete rounds in the same game', () => {
    const facts = build([
      game({
        players: [
          player(ME, { holes: flatRound(4) }),
          player('user-a', { holes: flatRound(4).slice(0, 9) }),
        ],
      }),
    ]);
    expect(facts.gang?.tightestFinish).toBeNull();
  });

  it('leaves out players who withdrew', () => {
    const facts = build([
      game({
        players: [
          player(ME),
          player('user-a', { withdrawnAt: '2026-06-01T09:00:00Z' }),
        ],
      }),
    ]);
    expect(facts.gang?.members).toBe(1);
  });

  it('ignores a game the viewer was not part of', () => {
    const facts = build([
      game({ players: [player('user-a'), player('user-b')] }),
    ]);
    expect(facts.rounds).toBe(0);
    expect(facts.gang).toBeNull();
  });

  it('ignores a game the viewer withdrew from', () => {
    const facts = build([
      game({
        players: [
          player(ME, { withdrawnAt: '2026-06-01T09:00:00Z' }),
          player('user-a'),
        ],
      }),
    ]);
    expect(facts.rounds).toBe(0);
    expect(facts.gang).toBeNull();
  });
});
