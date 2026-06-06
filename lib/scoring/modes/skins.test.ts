import { describe, it, expect } from 'vitest';
import { compute } from './skins';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
} from './types';

function par4Holes(count: number): ScoringHole[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
  }));
}

function makeCtx(opts: {
  players: ScoringPlayer[];
  holes: ScoringHole[];
  scores: ScoringHoleScore[];
  skinsScoring?: 'gross' | 'net';
  /** Lar oss teste defensive fallback ved manglende field. */
  modeConfigOverride?: Record<string, unknown>;
}): ScoringContext {
  const modeConfig = opts.modeConfigOverride
    ? (opts.modeConfigOverride as never)
    : ({
        kind: 'skins',
        team_size: 1,
        skins_scoring: opts.skinsScoring ?? 'net',
      } as never);
  return {
    game: {
      id: 'g1',
      game_mode: 'skins',
      mode_config: modeConfig,
    },
    players: opts.players,
    holes: opts.holes,
    scores: opts.scores,
  };
}

function soloPlayer(userId: string, courseHandicap = 0): ScoringPlayer {
  return {
    userId,
    teamNumber: null,
    flightNumber: null,
    courseHandicap,
  };
}

/** Helper: bygg score-array for ÉN spiller med gitt gross per hull (hull 1..n). */
function scoresFor(userId: string, gross: number[]): ScoringHoleScore[] {
  return gross.map((g, i) => ({
    userId,
    holeNumber: i + 1,
    gross: g,
  }));
}

/** Plukk en hull-rad fra resultatet på hullnummer. */
function holeRow(
  result: ReturnType<typeof compute>,
  holeNumber: number,
) {
  return result.holes.find((h) => h.holeNumber === holeNumber)!;
}

describe('skins.compute — discriminated shape', () => {
  it('returnerer kind=skins med scoring=net fra mode_config', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(18),
      scores: [],
      skinsScoring: 'net',
    });
    const result = compute(ctx);
    expect(result.kind).toBe('skins');
    expect(result.scoring).toBe('net');
    expect(result.holes).toHaveLength(18);
    expect(result.players).toHaveLength(2);
  });

  it('returnerer scoring=gross når mode_config sier gross', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(18),
      scores: [],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    expect(result.scoring).toBe('gross');
  });

  it('mangler skins_scoring → defensive fallback til net', () => {
    // u1 CH 18 (1 slag/hull), u2 CH 0. Begge brutto 5. Med net (fallback)
    // vinner u1 alle hull (netto 4 < 5).
    const ctx = makeCtx({
      players: [soloPlayer('u1', 18), soloPlayer('u2', 0)],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(18).fill(5)),
        ...scoresFor('u2', Array(18).fill(5)),
      ],
      modeConfigOverride: { kind: 'skins', team_size: 1 },
    });
    const result = compute(ctx);
    expect(result.scoring).toBe('net');
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    expect(u1.totalSkins).toBe(18);
  });

  it('holes er sortert på holeNumber selv om scores/holes er ute av rekkefølge', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: [
        { number: 3, par: 4, strokeIndex: 3 },
        { number: 1, par: 4, strokeIndex: 1 },
        { number: 2, par: 4, strokeIndex: 2 },
      ],
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 5 },
        { userId: 'u1', holeNumber: 2, gross: 4 },
        { userId: 'u2', holeNumber: 2, gross: 5 },
        { userId: 'u1', holeNumber: 3, gross: 4 },
        { userId: 'u2', holeNumber: 3, gross: 5 },
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    expect(result.holes.map((h) => h.holeNumber)).toEqual([1, 2, 3]);
  });
});

describe('skins.compute — single unique winner takes the skin', () => {
  it('Friskt hull, unik vinner: atStake=1, skinsAwarded=1, outcome=won', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 5 },
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = holeRow(result, 1);
    expect(h1.carriedIn).toBe(0);
    expect(h1.atStake).toBe(1);
    expect(h1.outcome).toBe('won');
    expect(h1.winnerUserId).toBe('u1');
    expect(h1.skinsAwarded).toBe(1);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    expect(u1.totalSkins).toBe(1);
    expect(u1.holesWon).toBe(1);
    expect(result.carriedPot).toBe(0);
  });

  it('perPlayer.isWinner og effectiveScore korrekt (gross)', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2'), soloPlayer('u3')],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = holeRow(result, 1);
    const cell = (id: string) => h1.perPlayer.find((p) => p.userId === id)!;
    expect(cell('u1').effectiveScore).toBe(3);
    expect(cell('u1').gross).toBe(3);
    expect(cell('u1').isWinner).toBe(true);
    expect(cell('u2').effectiveScore).toBe(4);
    expect(cell('u2').isWinner).toBe(false);
    expect(cell('u3').effectiveScore).toBe(5);
    expect(cell('u3').isWinner).toBe(false);
  });

  it('Hver spiller vinner ett hull hver → totalSkins=1 begge', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(2),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u1', holeNumber: 2, gross: 5 },
        { userId: 'u2', holeNumber: 2, gross: 4 },
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    expect(holeRow(result, 1).winnerUserId).toBe('u1');
    expect(holeRow(result, 2).winnerUserId).toBe('u2');
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u1.totalSkins).toBe(1);
    expect(u2.totalSkins).toBe(1);
    expect(result.carriedPot).toBe(0);
  });
});

describe('skins.compute — ties produce carryover', () => {
  it('2-veis delt → carryover; neste hull atStake=2', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(2),
      scores: [
        // Hull 1: begge 4 → delt.
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        // Hull 2: u1 vinner.
        { userId: 'u1', holeNumber: 2, gross: 3 },
        { userId: 'u2', holeNumber: 2, gross: 4 },
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = holeRow(result, 1);
    expect(h1.outcome).toBe('carryover');
    expect(h1.winnerUserId).toBeNull();
    expect(h1.atStake).toBe(1);
    expect(h1.skinsAwarded).toBe(0);

    const h2 = holeRow(result, 2);
    expect(h2.carriedIn).toBe(1);
    expect(h2.atStake).toBe(2);
    expect(h2.outcome).toBe('won');
    expect(h2.winnerUserId).toBe('u1');
    expect(h2.skinsAwarded).toBe(2);

    const u1 = result.players.find((p) => p.userId === 'u1')!;
    expect(u1.totalSkins).toBe(2);
    expect(u1.holesWon).toBe(1);
    expect(result.carriedPot).toBe(0);
  });

  it.each([
    {
      label: '3-veis delt',
      players: ['u1', 'u2', 'u3'],
      grosses: { u1: 4, u2: 4, u3: 4 },
    },
    {
      label: '4-veis delt',
      players: ['u1', 'u2', 'u3', 'u4'],
      grosses: { u1: 4, u2: 4, u3: 4, u4: 4 },
    },
  ])('$label → carryover, ingen vinner, ingen skins delt ut', ({
    players,
    grosses,
  }) => {
    const ctx = makeCtx({
      players: players.map((id) => soloPlayer(id)),
      holes: par4Holes(1),
      scores: players.map((id) => ({
        userId: id,
        holeNumber: 1,
        gross: (grosses as Record<string, number>)[id],
      })),
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = holeRow(result, 1);
    expect(h1.outcome).toBe('carryover');
    expect(h1.winnerUserId).toBeNull();
    expect(h1.skinsAwarded).toBe(0);
    for (const p of result.players) {
      expect(p.totalSkins).toBe(0);
      expect(p.holesWon).toBe(0);
    }
    // Siste hull delt → potten henger.
    expect(result.carriedPot).toBe(1);
  });

  it('partiell tie (2 av 3 deler lavest) → fortsatt carryover', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2'), soloPlayer('u3')],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = holeRow(result, 1);
    expect(h1.outcome).toBe('carryover');
    expect(h1.winnerUserId).toBeNull();
    // Begge laveste flagges som "winner" i perPlayer (delte lavest).
    expect(h1.perPlayer.find((p) => p.userId === 'u1')!.isWinner).toBe(true);
    expect(h1.perPlayer.find((p) => p.userId === 'u2')!.isWinner).toBe(true);
    expect(h1.perPlayer.find((p) => p.userId === 'u3')!.isWinner).toBe(false);
  });
});

describe('skins.compute — multi-tied carryover sequence (issue-scenario)', () => {
  it('"carryover vunnet på hull 4": hull 1-3 delt → hull 4 scooper 4 skins', () => {
    // Hull 1-3: alle 4 → tre carryover-hull. Hull 4: u1 unik vinner (3 < 4).
    // atStake på hull 4 = 3 (carried) + 1 = 4. u1 totalSkins = 4.
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(4),
      scores: [
        ...scoresFor('u1', [4, 4, 4, 3]),
        ...scoresFor('u2', [4, 4, 4, 4]),
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    expect(holeRow(result, 1).outcome).toBe('carryover');
    expect(holeRow(result, 1).atStake).toBe(1);
    expect(holeRow(result, 2).outcome).toBe('carryover');
    expect(holeRow(result, 2).carriedIn).toBe(1);
    expect(holeRow(result, 2).atStake).toBe(2);
    expect(holeRow(result, 3).outcome).toBe('carryover');
    expect(holeRow(result, 3).carriedIn).toBe(2);
    expect(holeRow(result, 3).atStake).toBe(3);

    const h4 = holeRow(result, 4);
    expect(h4.carriedIn).toBe(3);
    expect(h4.atStake).toBe(4);
    expect(h4.outcome).toBe('won');
    expect(h4.winnerUserId).toBe('u1');
    expect(h4.skinsAwarded).toBe(4);

    const u1 = result.players.find((p) => p.userId === 'u1')!;
    expect(u1.totalSkins).toBe(4);
    expect(u1.holesWon).toBe(1);
    expect(result.carriedPot).toBe(0);
  });

  it('carryover resetter etter avgjort hull (potten tømmes)', () => {
    // Hull 1 delt (carry 1), hull 2 u1 scooper 2 (reset), hull 3 friskt → atStake 1.
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(3),
      scores: [
        ...scoresFor('u1', [4, 3, 3]),
        ...scoresFor('u2', [4, 4, 4]),
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    expect(holeRow(result, 2).atStake).toBe(2);
    expect(holeRow(result, 2).skinsAwarded).toBe(2);
    const h3 = holeRow(result, 3);
    expect(h3.carriedIn).toBe(0);
    expect(h3.atStake).toBe(1);
    expect(h3.skinsAwarded).toBe(1);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    expect(u1.totalSkins).toBe(3);
    expect(u1.holesWon).toBe(2);
  });
});

describe('skins.compute — pending holes stop resolution', () => {
  it('Hull mangler én spillers score → pending, ingen award, senere hull også pending', () => {
    // Hull 1 avgjort (u1 vinner). Hull 2 mangler u2-score → pending. Hull 3 spilt
    // men skal også være pending (sekvensiell carryover stopper).
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(3),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        // Hull 2: kun u1.
        { userId: 'u1', holeNumber: 2, gross: 4 },
        // Hull 3: begge (men skal ikke resolve fordi hull 2 henger).
        { userId: 'u1', holeNumber: 3, gross: 3 },
        { userId: 'u2', holeNumber: 3, gross: 4 },
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    expect(holeRow(result, 1).outcome).toBe('won');
    expect(holeRow(result, 1).winnerUserId).toBe('u1');

    const h2 = holeRow(result, 2);
    expect(h2.outcome).toBe('pending');
    expect(h2.winnerUserId).toBeNull();
    expect(h2.skinsAwarded).toBe(0);

    const h3 = holeRow(result, 3);
    expect(h3.outcome).toBe('pending');
    expect(h3.winnerUserId).toBeNull();
    expect(h3.skinsAwarded).toBe(0);

    const u1 = result.players.find((p) => p.userId === 'u1')!;
    expect(u1.totalSkins).toBe(1);
    expect(u1.holesWon).toBe(1);
  });

  it('Ingen scores i det hele tatt → alle hull pending, ingen skins', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(18),
      scores: [],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    for (const h of result.holes) {
      expect(h.outcome).toBe('pending');
      expect(h.skinsAwarded).toBe(0);
    }
    for (const p of result.players) {
      expect(p.totalSkins).toBe(0);
      expect(p.holesWon).toBe(0);
    }
    // carriedPot frosset på 0 → ingen henger.
    expect(result.carriedPot).toBe(0);
  });

  it('Carry fryses ved pending: hull 1 delt, hull 2 pending → carriedPot=1 (rå pott eksponert)', () => {
    // Hull 1 delt (carry 1). Hull 2 mangler u2 → pending, potten fryses ved
    // freeze-punktet. Modulen eksponerer den RÅ hengende potten (1); det er
    // SkinsView (med gameStatus) som avgjør om dette er «i potten» (live) eller
    // «ikke vunnet» (finished). Scoring-modulen forblir ren.
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(2),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u1', holeNumber: 2, gross: 3 },
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    expect(holeRow(result, 1).outcome).toBe('carryover');
    expect(holeRow(result, 2).outcome).toBe('pending');
    // Rå pott (1) eksponert ved freeze-punktet — ikke nullstilt.
    expect(result.carriedPot).toBe(1);
  });

  it('Tidlig avslutning på delt hull + trailing uspilte hull → carriedPot eksponerer rå pott (#303)', () => {
    // Det rapporterte tilfellet: hull 1 delt (carry 1), hull 2 delt (carry 2),
    // hull 3 pending (admin avsluttet før noen rakk å spille). Tidligere ga
    // `frozen ? 0 : carriedPot` = 0 → henger-banneret forsvant. Nå eksponeres
    // den rå potten (2) slik at SkinsView kan vise «2 skins ikke vunnet» når
    // gameStatus === 'finished'.
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(3),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u1', holeNumber: 2, gross: 5 },
        { userId: 'u2', holeNumber: 2, gross: 5 },
        // Hull 3: ingen scores → pending, potten fryses på freeze-punktet.
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    expect(holeRow(result, 1).outcome).toBe('carryover');
    expect(holeRow(result, 2).outcome).toBe('carryover');
    expect(holeRow(result, 3).outcome).toBe('pending');
    // Rå hengende pott fra siste delte spilte hull = 2 (ikke 0).
    expect(result.carriedPot).toBe(2);
    for (const p of result.players) {
      expect(p.totalSkins).toBe(0);
    }
  });
});

describe('skins.compute — hanging / unwon skins at round end', () => {
  it('Delt siste hull → carriedPot > 0, ingen får dem', () => {
    // Hull 1 u1 vinner, hull 2 delt → potten (1) henger ved rundeslutt.
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(2),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u1', holeNumber: 2, gross: 4 },
        { userId: 'u2', holeNumber: 2, gross: 4 },
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    expect(holeRow(result, 2).outcome).toBe('carryover');
    expect(result.carriedPot).toBe(1);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u1.totalSkins).toBe(1);
    expect(u2.totalSkins).toBe(0);
  });

  it('To delte hull på slutten → carriedPot=2', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(2),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u1', holeNumber: 2, gross: 4 },
        { userId: 'u2', holeNumber: 2, gross: 4 },
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    expect(result.carriedPot).toBe(2);
    for (const p of result.players) {
      expect(p.totalSkins).toBe(0);
    }
  });
});

describe('skins.compute — gross vs net', () => {
  it('Samme grosses, ulik HCP/SI flipper vinneren under net', () => {
    // Hull 1 har SI 1. Begge brutto 4. u1 CH 1 (slag på SI 1) → netto 3.
    // u2 CH 0 → netto 4. Under net vinner u1; under gross blir det delt.
    const grossScores = [
      { userId: 'u1', holeNumber: 1, gross: 4 },
      { userId: 'u2', holeNumber: 1, gross: 4 },
    ];
    const netCtx = makeCtx({
      players: [soloPlayer('u1', 1), soloPlayer('u2', 0)],
      holes: par4Holes(1),
      scores: grossScores,
      skinsScoring: 'net',
    });
    const netResult = compute(netCtx);
    const netH1 = holeRow(netResult, 1);
    expect(netH1.outcome).toBe('won');
    expect(netH1.winnerUserId).toBe('u1');
    expect(netH1.perPlayer.find((p) => p.userId === 'u1')!.effectiveScore).toBe(3);
    expect(netH1.perPlayer.find((p) => p.userId === 'u2')!.effectiveScore).toBe(4);

    const grossCtx = makeCtx({
      players: [soloPlayer('u1', 1), soloPlayer('u2', 0)],
      holes: par4Holes(1),
      scores: grossScores,
      skinsScoring: 'gross',
    });
    const grossResult = compute(grossCtx);
    const grossH1 = holeRow(grossResult, 1);
    expect(grossH1.outcome).toBe('carryover');
    expect(grossH1.winnerUserId).toBeNull();
    expect(grossH1.perPlayer.find((p) => p.userId === 'u1')!.effectiveScore).toBe(4);
  });

  it('Net: CH 18 gir 1 slag på alle hull → effectiveScore = gross − 1', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1', 18), soloPlayer('u2', 0)],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 5 },
        { userId: 'u2', holeNumber: 1, gross: 5 },
      ],
      skinsScoring: 'net',
    });
    const result = compute(ctx);
    const h1 = holeRow(result, 1);
    expect(h1.perPlayer.find((p) => p.userId === 'u1')!.effectiveScore).toBe(4);
    expect(h1.perPlayer.find((p) => p.userId === 'u2')!.effectiveScore).toBe(5);
    expect(h1.winnerUserId).toBe('u1');
  });
});

describe('skins.compute — player counts', () => {
  it('2-spiller Skins fungerer (lavest vinner, delt = carry)', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(3),
      scores: [
        ...scoresFor('u1', [3, 4, 4]),
        ...scoresFor('u2', [4, 4, 3]),
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    expect(holeRow(result, 1).winnerUserId).toBe('u1'); // u1 vinner
    expect(holeRow(result, 2).outcome).toBe('carryover'); // delt
    expect(holeRow(result, 3).winnerUserId).toBe('u2'); // u2 scooper 2
    expect(holeRow(result, 3).skinsAwarded).toBe(2);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u1.totalSkins).toBe(1);
    expect(u2.totalSkins).toBe(2);
  });

  it('4-spiller Skins fungerer', () => {
    const ctx = makeCtx({
      players: [
        soloPlayer('u1'),
        soloPlayer('u2'),
        soloPlayer('u3'),
        soloPlayer('u4'),
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
        { userId: 'u4', holeNumber: 1, gross: 6 },
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    expect(result.players).toHaveLength(4);
    expect(holeRow(result, 1).winnerUserId).toBe('u1');
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    expect(u1.totalSkins).toBe(1);
  });
});

describe('skins.compute — ranking & tiebreak', () => {
  it('totalSkins desc bestemmer rank', () => {
    // u1 vinner hull 1+2 (2 skins), u2 vinner hull 3 (1 skin).
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(3),
      scores: [
        ...scoresFor('u1', [3, 3, 5]),
        ...scoresFor('u2', [4, 4, 4]),
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u1.totalSkins).toBe(2);
    expect(u2.totalSkins).toBe(1);
    expect(u1.rank).toBe(1);
    expect(u2.rank).toBe(2);
  });

  it('Lik totalSkins, ulik holesWon → flere holesWon rangerer foran', () => {
    // u1: vinner 2 friske hull (2 skins, 2 holesWon).
    // u2: scooper én 2-skins-pott (2 skins, 1 holesWon).
    // Lik totalSkins (2), u1 har flere holesWon → u1 rank 1.
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(4),
      scores: [
        // Hull 1: u1 vinner (friskt). Hull 2: u1 vinner (friskt).
        // Hull 3: delt. Hull 4: u2 scooper 2.
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u1', holeNumber: 2, gross: 3 },
        { userId: 'u2', holeNumber: 2, gross: 4 },
        { userId: 'u1', holeNumber: 3, gross: 4 },
        { userId: 'u2', holeNumber: 3, gross: 4 },
        { userId: 'u1', holeNumber: 4, gross: 5 },
        { userId: 'u2', holeNumber: 4, gross: 3 },
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u1.totalSkins).toBe(2);
    expect(u2.totalSkins).toBe(2);
    expect(u1.holesWon).toBe(2);
    expect(u2.holesWon).toBe(1);
    expect(u1.rank).toBe(1);
    expect(u2.rank).toBe(2);
  });

  it('Helt lik (totalSkins + holesWon) → delt rank, tiedWith populert', () => {
    // u1 og u2 vinner ett hull hver (1 skin, 1 holesWon hver). Likt → delt rank 1.
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(2),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u1', holeNumber: 2, gross: 4 },
        { userId: 'u2', holeNumber: 2, gross: 3 },
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u1.totalSkins).toBe(1);
    expect(u2.totalSkins).toBe(1);
    expect(u1.rank).toBe(u2.rank);
    expect(u1.tiedWith).toContain('u2');
    expect(u2.tiedWith).toContain('u1');
  });

  it('players returneres sortert på rank (best først)', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2'), soloPlayer('u3')],
      holes: par4Holes(3),
      scores: [
        // u3 vinner alle tre (3 skins). u1, u2 ingen.
        ...scoresFor('u1', [5, 5, 5]),
        ...scoresFor('u2', [5, 5, 5]),
        ...scoresFor('u3', [3, 3, 3]),
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);
    expect(result.players[0].userId).toBe('u3');
    expect(result.players[0].rank).toBe(1);
    expect(result.players[0].totalSkins).toBe(3);
  });
});

describe('skins.compute — antalls-agnostisk over 4 spillere (#460)', () => {
  it('6 spillere: fem distinkte vinnere + uavgjort på siste hull → carryover', () => {
    // Gross-skins, 6 hull. u1..u5 vinner hvert sitt hull (gross 3 mot 5).
    // Hull 6: u1 og u2 deler laveste → ingen unik vinner → skinnet bæres, og
    // siden det er siste hull ender det uvunnet (carriedPot 1, jf. #303).
    const ctx = makeCtx({
      players: [
        soloPlayer('u1'),
        soloPlayer('u2'),
        soloPlayer('u3'),
        soloPlayer('u4'),
        soloPlayer('u5'),
        soloPlayer('u6'),
      ],
      holes: par4Holes(6),
      scores: [
        ...scoresFor('u1', [3, 5, 5, 5, 5, 3]),
        ...scoresFor('u2', [5, 3, 5, 5, 5, 3]),
        ...scoresFor('u3', [5, 5, 3, 5, 5, 5]),
        ...scoresFor('u4', [5, 5, 5, 3, 5, 5]),
        ...scoresFor('u5', [5, 5, 5, 5, 3, 5]),
        ...scoresFor('u6', [5, 5, 5, 5, 5, 5]),
      ],
      skinsScoring: 'gross',
    });
    const result = compute(ctx);

    // Alle seks spillere er med i resultatet — ingen kuttes over 4.
    expect(result.players).toHaveLength(6);

    const byId = Object.fromEntries(result.players.map((p) => [p.userId, p]));
    for (const id of ['u1', 'u2', 'u3', 'u4', 'u5']) {
      expect(byId[id].totalSkins).toBe(1);
      expect(byId[id].holesWon).toBe(1);
    }
    // u6 vant ingenting, men er fortsatt representert.
    expect(byId['u6'].totalSkins).toBe(0);
    expect(byId['u6'].holesWon).toBe(0);

    // Siste hull var uavgjort mellom u1 og u2 → potten bæres uvunnet.
    expect(result.carriedPot).toBe(1);
  });
});
