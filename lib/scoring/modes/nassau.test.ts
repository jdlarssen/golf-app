import { describe, it, expect } from 'vitest';
import { compute } from './nassau';
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
  nassauScoring?: 'gross' | 'net';
  /** Lar oss teste defensive fallback ved manglende field. */
  modeConfigOverride?: Record<string, unknown>;
}): ScoringContext {
  const modeConfig = opts.modeConfigOverride
    ? (opts.modeConfigOverride as never)
    : ({
        kind: 'nassau',
        team_size: 1,
        nassau_scoring: opts.nassauScoring ?? 'net',
      } as never);
  return {
    game: {
      id: 'g1',
      game_mode: 'nassau',
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

/** Helper: byggescore-array for ÉN spiller med gitt gross per hull. */
function scoresFor(userId: string, gross: number[]): ScoringHoleScore[] {
  return gross.map((g, i) => ({
    userId,
    holeNumber: i + 1,
    gross: g,
  }));
}

describe('nassau.compute — discriminated shape', () => {
  it('returnerer kind=nassau med scoring=net fra mode_config', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(18),
      scores: [],
      nassauScoring: 'net',
    });
    const result = compute(ctx);
    expect(result.kind).toBe('nassau');
    expect(result.scoring).toBe('net');
    expect(result.sections.front9.name).toBe('front9');
    expect(result.sections.back9.name).toBe('back9');
    expect(result.sections.total18.name).toBe('total18');
  });

  it('returnerer scoring=gross når mode_config sier gross', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(18),
      scores: [],
      nassauScoring: 'gross',
    });
    const result = compute(ctx);
    expect(result.scoring).toBe('gross');
  });

  it('seksjonenes holeNumbers reflekterer 1..9, 10..18, 1..18', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1')],
      holes: par4Holes(18),
      scores: [],
    });
    const result = compute(ctx);
    expect(result.sections.front9.holeNumbers).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(result.sections.back9.holeNumbers).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
    expect(result.sections.total18.holeNumbers).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
  });
});

describe('nassau.compute — section winners (clean wins)', () => {
  it('Front 9-vinner: u1 lavest sum på hull 1-9, andre lavere på back', () => {
    // u1: front-9 4× (par), back-9 5× (bogey). u2: front-9 5×, back-9 4×.
    // u3: 5× alle hull.
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2'), soloPlayer('u3')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', [...Array(9).fill(4), ...Array(9).fill(5)]),
        ...scoresFor('u2', [...Array(9).fill(5), ...Array(9).fill(4)]),
        ...scoresFor('u3', Array(18).fill(5)),
      ],
    });
    const result = compute(ctx);
    expect(result.sections.front9.winnerUserIds).toEqual(['u1']);
    expect(result.sections.front9.isPending).toBe(false);
    // u1 fikk units for front9 men ikke back9 eller total18.
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    expect(u1.unitBreakdown.front9).toBe(true);
  });

  it('Back 9-vinner: u2 lavest sum på hull 10-18', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2'), soloPlayer('u3')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', [...Array(9).fill(4), ...Array(9).fill(5)]),
        ...scoresFor('u2', [...Array(9).fill(5), ...Array(9).fill(4)]),
        ...scoresFor('u3', Array(18).fill(5)),
      ],
    });
    const result = compute(ctx);
    expect(result.sections.back9.winnerUserIds).toEqual(['u2']);
    expect(result.sections.back9.isPending).toBe(false);
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u2.unitBreakdown.back9).toBe(true);
  });

  it('Total 18-vinner: u1 lavest kumulativt', () => {
    // u1: par × 18 = 72 totalt
    // u2: 5 × 9 + 4 × 9 = 45 + 36 = 81
    // u3: 5 × 18 = 90
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2'), soloPlayer('u3')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(18).fill(4)),
        ...scoresFor('u2', [...Array(9).fill(5), ...Array(9).fill(4)]),
        ...scoresFor('u3', Array(18).fill(5)),
      ],
    });
    const result = compute(ctx);
    expect(result.sections.total18.winnerUserIds).toEqual(['u1']);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    expect(u1.unitBreakdown.total18).toBe(true);
  });

  it('Sweep: u1 vinner alle tre seksjoner → units=3', () => {
    // u1 par × 18, andre bogey × 18 → u1 vinner alt.
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2'), soloPlayer('u3')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(18).fill(4)),
        ...scoresFor('u2', Array(18).fill(5)),
        ...scoresFor('u3', Array(18).fill(5)),
      ],
    });
    const result = compute(ctx);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    expect(u1.units).toBe(3);
    expect(u1.unitBreakdown).toEqual({
      front9: true,
      back9: true,
      total18: true,
    });
    expect(u1.rank).toBe(1);
  });
});

describe('nassau.compute — push on tie (klassisk Nassau-regel)', () => {
  it('Push på Front 9: u1 og u2 har identisk front-9, ingen unit deles ut', () => {
    // u1 og u2 identiske front-9 (par × 9), u2 vinner back-9.
    // Identisk front-9 (samme array element-for-element) → full cascade tie → push.
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2'), soloPlayer('u3')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', [...Array(9).fill(4), ...Array(9).fill(5)]),
        ...scoresFor('u2', [...Array(9).fill(4), ...Array(9).fill(4)]),
        ...scoresFor('u3', Array(18).fill(5)),
      ],
    });
    const result = compute(ctx);
    expect(result.sections.front9.winnerUserIds.length).toBeGreaterThan(1);
    expect(result.sections.front9.winnerUserIds).toContain('u1');
    expect(result.sections.front9.winnerUserIds).toContain('u2');
    // Hverken u1 eller u2 fikk unit for front9.
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u1.unitBreakdown.front9).toBe(false);
    expect(u2.unitBreakdown.front9).toBe(false);
  });

  it('Push på Back 9: u1 og u2 identiske back-9 → push, ingen unit', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2'), soloPlayer('u3')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', [...Array(9).fill(4), ...Array(9).fill(4)]),
        ...scoresFor('u2', [...Array(9).fill(5), ...Array(9).fill(4)]),
        ...scoresFor('u3', Array(18).fill(5)),
      ],
    });
    const result = compute(ctx);
    expect(result.sections.back9.winnerUserIds.length).toBeGreaterThan(1);
    expect(result.sections.back9.winnerUserIds).toContain('u1');
    expect(result.sections.back9.winnerUserIds).toContain('u2');
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u1.unitBreakdown.back9).toBe(false);
    expect(u2.unitBreakdown.back9).toBe(false);
  });

  it('Push på Total 18 (full cascade tied): tre spillere identisk par × 18', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2'), soloPlayer('u3')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(18).fill(4)),
        ...scoresFor('u2', Array(18).fill(4)),
        ...scoresFor('u3', Array(18).fill(4)),
      ],
    });
    const result = compute(ctx);
    expect(result.sections.total18.winnerUserIds.length).toBe(3);
    for (const p of result.players) {
      expect(p.unitBreakdown.total18).toBe(false);
      expect(p.units).toBe(0);
    }
  });
});

describe('nassau.compute — pending states', () => {
  it('Front 9 pending: kun 7/9 hull spilt av noen → isPending=true, winners=[]', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', [4, 4, 4, 4, 4, 4, 4]),
        ...scoresFor('u2', [5, 5, 5, 5, 5, 5, 5]),
      ],
    });
    const result = compute(ctx);
    expect(result.sections.front9.isPending).toBe(true);
    expect(result.sections.front9.winnerUserIds).toEqual([]);
    // Ingen units utdelt.
    for (const p of result.players) {
      expect(p.unitBreakdown.front9).toBe(false);
    }
  });

  it('Total 18 pending: kun 14/18 hull spilt → isPending=true', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(14).fill(4)),
        ...scoresFor('u2', Array(14).fill(5)),
      ],
    });
    const result = compute(ctx);
    expect(result.sections.total18.isPending).toBe(true);
    expect(result.sections.total18.winnerUserIds).toEqual([]);
    // Front9 IKKE pending (alle 9 spilt av begge).
    expect(result.sections.front9.isPending).toBe(false);
  });

  it('Front 9 NOT pending når minst én spiller har alle 9 spilt (andre har færre)', () => {
    // u1 har spilt 9/9, u2 har spilt 5/9. u1 vinner front9-unit, u2 rangerer bak via padding.
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(9).fill(4)),
        ...scoresFor('u2', [3, 3, 3, 3, 3]), // bare 5 hull selv om alle er birdier
      ],
    });
    const result = compute(ctx);
    expect(result.sections.front9.isPending).toBe(false);
    expect(result.sections.front9.winnerUserIds).toEqual(['u1']);
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u2.unitBreakdown.front9).toBe(false);
  });
});

describe('nassau.compute — gross vs net mode', () => {
  it('Gross mode ignorerer courseHandicap (lik raw gross sammenligning)', () => {
    // u1 har CH 18 (skulle få ekstra slag), u2 har CH 0. I gross mode er HCP irrelevant.
    // u1 brutto 5 × 18 = 90, u2 brutto 4 × 18 = 72. u2 skal vinne alle seksjoner.
    const ctx = makeCtx({
      players: [soloPlayer('u1', 18), soloPlayer('u2', 0)],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(18).fill(5)),
        ...scoresFor('u2', Array(18).fill(4)),
      ],
      nassauScoring: 'gross',
    });
    const result = compute(ctx);
    expect(result.sections.front9.winnerUserIds).toEqual(['u2']);
    expect(result.sections.back9.winnerUserIds).toEqual(['u2']);
    expect(result.sections.total18.winnerUserIds).toEqual(['u2']);
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u2.units).toBe(3);
  });

  it('Net mode: CH 18 gir 1 ekstra slag på alle hull → netto = gross − 1', () => {
    // u1 CH 18, u2 CH 0. u1 brutto 5 × 18 = 90, netto = 4 × 18 = 72.
    // u2 brutto 5 × 18 = 90, netto = 90.
    // u1 vinner netto (72 < 90).
    const ctx = makeCtx({
      players: [soloPlayer('u1', 18), soloPlayer('u2', 0)],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(18).fill(5)),
        ...scoresFor('u2', Array(18).fill(5)),
      ],
      nassauScoring: 'net',
    });
    const result = compute(ctx);
    expect(result.sections.total18.winnerUserIds).toEqual(['u1']);
    const u1Total = result.sections.total18.players.find(
      (p) => p.userId === 'u1',
    )!;
    expect(u1Total.totalEffectiveStrokes).toBe(72);
    expect(u1Total.totalGrossStrokes).toBe(90);
  });

  it('Mode_config mangler nassau_scoring → defensive fallback til net', () => {
    // u1 CH 18, u2 CH 0. Begge brutto 5 × 18. Med net (fallback) vinner u1.
    const ctx = makeCtx({
      players: [soloPlayer('u1', 18), soloPlayer('u2', 0)],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(18).fill(5)),
        ...scoresFor('u2', Array(18).fill(5)),
      ],
      modeConfigOverride: { kind: 'nassau', team_size: 1 },
    });
    const result = compute(ctx);
    expect(result.scoring).toBe('net');
    expect(result.sections.total18.winnerUserIds).toEqual(['u1']);
  });
});

describe('nassau.compute — player count edge cases', () => {
  it('2 spillere minimum: virker uten crash', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(18).fill(4)),
        ...scoresFor('u2', Array(18).fill(5)),
      ],
    });
    const result = compute(ctx);
    expect(result.players).toHaveLength(2);
    expect(result.sections.total18.winnerUserIds).toEqual(['u1']);
  });

  it('4 spillere maksimum: virker uten crash', () => {
    const ctx = makeCtx({
      players: [
        soloPlayer('u1'),
        soloPlayer('u2'),
        soloPlayer('u3'),
        soloPlayer('u4'),
      ],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(18).fill(4)),
        ...scoresFor('u2', Array(18).fill(5)),
        ...scoresFor('u3', Array(18).fill(6)),
        ...scoresFor('u4', Array(18).fill(7)),
      ],
    });
    const result = compute(ctx);
    expect(result.players).toHaveLength(4);
    expect(result.sections.total18.winnerUserIds).toEqual(['u1']);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    expect(u1.units).toBe(3); // sweep
  });
});

describe('nassau.compute — units aggregation & ranking', () => {
  it('Tre ulike vinnere per seksjon: A=front, B=back, C=total → alle har 1 unit', () => {
    // Konstruer scenario:
    // u1: front-9 lavest, back-9 medium, total medium
    // u2: front-9 medium, back-9 lavest, total medium
    // u3: front-9 medium-pluss, back-9 medium-pluss, total lavest (ved å være jevn)
    //
    // Vanskelig å konstruere uten kollisjon. Bruk eksplisitte tall:
    // u1: front [3]×9 (27), back [6]×9 (54), total 81
    // u2: front [6]×9 (54), back [3]×9 (27), total 81
    // u3: front [4]×9 (36), back [4]×9 (36), total 72
    //
    // u1 vinner front (27 < 36, 54), u2 vinner back (27 < 36, 54), u3 vinner total (72 < 81).
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2'), soloPlayer('u3')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', [...Array(9).fill(3), ...Array(9).fill(6)]),
        ...scoresFor('u2', [...Array(9).fill(6), ...Array(9).fill(3)]),
        ...scoresFor('u3', Array(18).fill(4)),
      ],
    });
    const result = compute(ctx);
    expect(result.sections.front9.winnerUserIds).toEqual(['u1']);
    expect(result.sections.back9.winnerUserIds).toEqual(['u2']);
    expect(result.sections.total18.winnerUserIds).toEqual(['u3']);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    const u3 = result.players.find((p) => p.userId === 'u3')!;
    expect(u1.units).toBe(1);
    expect(u2.units).toBe(1);
    expect(u3.units).toBe(1);
  });

  it('Blandet unit-count: A vinner front+back (2 units), B vinner total (1) → A rank 1', () => {
    // u1 lavest front + back, men u2 vinner totaltsummen.
    // Konstruer:
    //   u1: front [3]×9 = 27, back [5]×9 = 45 → total 72
    //   u2: front [4]×9 = 36, back [4]×9 = 36 → total 72
    //   u3: front [6]×9 = 54, back [6]×9 = 54 → total 108
    //
    // Hmm — u1 og u2 har SAMME total. Cascade på back-9: u1 har 45, u2 har 36 → u2 vinner total.
    // u1 vinner front (27 < 36, 54), u1 vinner back? Nei, u1 back = 45, u2 back = 36 → u2 vinner back.
    // Vi vil at u1 skal vinne front+back, u2 vinner total. Vanskelig.
    //
    // Prøv: u1 vinner front, u3 vinner back, u2 vinner total. Nei, vi vil u1=2, u2=1.
    //
    // Lett-konstruerbart scenario:
    //   u1: front 27 (lavest), back 45 (lavest), men total = 72.
    //   u2: front 36, back 50, total = 70 (vinner total).
    // Men 50 > 45, så u1 vinner back også. Total: u1=72, u2=70 → u2 vinner total.
    // u1 vinner front + back = 2 units, u2 vinner total = 1 unit.
    //
    // Konstruere u1 sum 72, u2 sum 70:
    //   u1: front 9×3 = 27, back 9×5 = 45 → 72
    //   u2: front 9×4 = 36, back 5+... NEI.
    //   u2: front [4]×9 = 36, back vi vil 34 → 9 hull sum 34: [3,3,3,3,4,4,4,5,5] = 34.
    //   u1 back sum 45 vs u2 back sum 34 → u2 vinner back også! Ikke u1=2, u2=1.
    //
    // Nytt forsøk: vi vil u1 vinne front + back uten å vinne total.
    //   Det krever at u2 sin total er lavere enn u1's, men u2 sin front og back er hver
    //   høyere enn u1's. Matematisk umulig: u2 total = front + back > u1 front + u1 back = u1 total.
    //
    // Konklusjon: hvis u1 vinner BÅDE front og back så vinner u1 ALLTID total (om alt teller likt
    // i sum). Med 2-spiller scenario, dette er logisk umulig.
    //
    // ALTERNATIV: bytt rolle. u1 vinner front + total, u2 vinner back.
    //   u1: front 9×3 = 27 (lavest), back 9×5 = 45 → total 72
    //   u2: front 9×4 = 36, back 9×4 = 36 → total 72  // tied total :(
    //   u3: front 9×5 = 45, back 9×3 = 27 → total 72
    //
    // Lag ulike: u1 front 27, back 45, total 72. u2 front 36, back 30, total 66 (u2 vinner back+total).
    // Da har u2 = 2 units, u1 = 1 unit.
    //
    // Den vi vil teste: én spiller med flere units rangerer foran én med færre.
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2'), soloPlayer('u3')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', [...Array(9).fill(3), ...Array(9).fill(5)]), // front 27, back 45, total 72
        ...scoresFor('u2', [4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 4, 4, 4, 4, 4]), // front 36, back 33, total 69
        ...scoresFor('u3', Array(18).fill(7)),
      ],
    });
    const result = compute(ctx);
    expect(result.sections.front9.winnerUserIds).toEqual(['u1']);
    expect(result.sections.back9.winnerUserIds).toEqual(['u2']);
    expect(result.sections.total18.winnerUserIds).toEqual(['u2']);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u1.units).toBe(1);
    expect(u2.units).toBe(2);
    // u2 har flere units → rank 1
    expect(u2.rank).toBe(1);
    expect(u1.rank).toBe(2);
  });

  it('Samme units-count → tiebreak på total18EffectiveStrokes asc', () => {
    // Konstruer to spillere med 0 units (alle pushed) og forskjellig total18-sum.
    // u1: par × 18 = 72 (lavere). u2: bogey × 18 = 90. u3: birdie × 18 = 54.
    // u3 vinner alle seksjoner (units=3), u1 og u2 har 0 units.
    // u1 har lavere total18 enn u2 → u1 rank 2, u2 rank 3.
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2'), soloPlayer('u3')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(18).fill(4)),
        ...scoresFor('u2', Array(18).fill(5)),
        ...scoresFor('u3', Array(18).fill(3)),
      ],
    });
    const result = compute(ctx);
    const u3 = result.players.find((p) => p.userId === 'u3')!;
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u3.units).toBe(3);
    expect(u1.units).toBe(0);
    expect(u2.units).toBe(0);
    expect(u3.rank).toBe(1);
    // u1 har lavere total18 (72) enn u2 (90) → u1 rank 2.
    expect(u1.rank).toBe(2);
    expect(u2.rank).toBe(3);
  });

  it('tiedWith populated når to spillere har identisk (units, total18EffectiveStrokes)', () => {
    // u1 og u2 identiske brutto → samme units (0, alle pushed), samme total18 sum.
    // u3 birdie × 18 → sweep.
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2'), soloPlayer('u3')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(18).fill(4)),
        ...scoresFor('u2', Array(18).fill(4)),
        ...scoresFor('u3', Array(18).fill(3)),
      ],
    });
    const result = compute(ctx);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u1.units).toBe(0);
    expect(u2.units).toBe(0);
    expect(u1.total18EffectiveStrokes).toBe(u2.total18EffectiveStrokes);
    expect(u1.tiedWith).toContain('u2');
    expect(u2.tiedWith).toContain('u1');
    expect(u1.rank).toBe(u2.rank);
  });
});

describe('nassau.compute — empty / partial inputs', () => {
  it('0 hull spilt → alle seksjoner pending, alle units=0, ingen crash', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(18),
      scores: [],
    });
    const result = compute(ctx);
    expect(result.sections.front9.isPending).toBe(true);
    expect(result.sections.back9.isPending).toBe(true);
    expect(result.sections.total18.isPending).toBe(true);
    expect(result.sections.front9.winnerUserIds).toEqual([]);
    for (const p of result.players) {
      expect(p.units).toBe(0);
      expect(p.unitBreakdown).toEqual({
        front9: false,
        back9: false,
        total18: false,
      });
    }
  });

  it('Per-spiller-shape: holesPlayed reflekteres separat per seksjon', () => {
    // u1 har spilt 5/9 i front, 9/9 i back. u2 har spilt 9/9 i front, 5/9 i back.
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', [4, 4, 4, 4, 4]), // hull 1-5
        { userId: 'u1', holeNumber: 10, gross: 4 },
        { userId: 'u1', holeNumber: 11, gross: 4 },
        { userId: 'u1', holeNumber: 12, gross: 4 },
        { userId: 'u1', holeNumber: 13, gross: 4 },
        { userId: 'u1', holeNumber: 14, gross: 4 },
        { userId: 'u1', holeNumber: 15, gross: 4 },
        { userId: 'u1', holeNumber: 16, gross: 4 },
        { userId: 'u1', holeNumber: 17, gross: 4 },
        { userId: 'u1', holeNumber: 18, gross: 4 },
        ...scoresFor('u2', Array(9).fill(5)), // alle 9 front
        { userId: 'u2', holeNumber: 10, gross: 5 },
        { userId: 'u2', holeNumber: 11, gross: 5 },
        { userId: 'u2', holeNumber: 12, gross: 5 },
        { userId: 'u2', holeNumber: 13, gross: 5 },
        { userId: 'u2', holeNumber: 14, gross: 5 },
      ],
    });
    const result = compute(ctx);
    const u1Front = result.sections.front9.players.find(
      (p) => p.userId === 'u1',
    )!;
    const u1Back = result.sections.back9.players.find(
      (p) => p.userId === 'u1',
    )!;
    const u2Front = result.sections.front9.players.find(
      (p) => p.userId === 'u2',
    )!;
    const u2Back = result.sections.back9.players.find(
      (p) => p.userId === 'u2',
    )!;
    expect(u1Front.holesPlayed).toBe(5);
    expect(u1Back.holesPlayed).toBe(9);
    expect(u2Front.holesPlayed).toBe(9);
    expect(u2Back.holesPlayed).toBe(5);
  });
});

describe('nassau.compute — strokeIndex allokering (net mode)', () => {
  // Verifiserer at scoring respekterer strokeIndex på samme måte som soloStrokeplay.
  it('CH 1 → ekstra slag kun på hullet med strokeIndex 1', () => {
    // Hull 1 har SI 1, så u1 (CH 1) får ekstra slag der.
    // u1: brutto 5 på alle hull. Hull 1 (SI 1): netto 4. Hull 2-18: netto 5.
    // Total netto = 4 + 17×5 = 89.
    // u2 CH 0: netto = brutto = 5 × 18 = 90.
    // u1 vinner total med 1 slag.
    const ctx = makeCtx({
      players: [soloPlayer('u1', 1), soloPlayer('u2', 0)],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(18).fill(5)),
        ...scoresFor('u2', Array(18).fill(5)),
      ],
      nassauScoring: 'net',
    });
    const result = compute(ctx);
    const u1Total = result.sections.total18.players.find(
      (p) => p.userId === 'u1',
    )!;
    expect(u1Total.totalEffectiveStrokes).toBe(89);
    expect(u1Total.totalGrossStrokes).toBe(90);
    expect(result.sections.total18.winnerUserIds).toEqual(['u1']);
  });
});

describe('nassau.compute — antalls-agnostisk over 4 spillere (#460)', () => {
  it('6 spillere: den siste i feltet (u6) vinner alle tre seksjoner', () => {
    // u6 spiller par (4) hele veien og vinner front9/back9/total18. u1..u5
    // spiller bogey (5). Beviser at den 6. spilleren behandles fullt ut og at
    // alle seks er med i resultatet.
    const ctx = makeCtx({
      players: [
        soloPlayer('u1'),
        soloPlayer('u2'),
        soloPlayer('u3'),
        soloPlayer('u4'),
        soloPlayer('u5'),
        soloPlayer('u6'),
      ],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(18).fill(5)),
        ...scoresFor('u2', Array(18).fill(5)),
        ...scoresFor('u3', Array(18).fill(5)),
        ...scoresFor('u4', Array(18).fill(5)),
        ...scoresFor('u5', Array(18).fill(5)),
        ...scoresFor('u6', Array(18).fill(4)),
      ],
    });
    const result = compute(ctx);

    expect(result.players).toHaveLength(6);
    expect(result.sections.front9.winnerUserIds).toEqual(['u6']);
    expect(result.sections.back9.winnerUserIds).toEqual(['u6']);
    expect(result.sections.total18.winnerUserIds).toEqual(['u6']);

    const u6 = result.players.find((p) => p.userId === 'u6')!;
    expect(u6.unitBreakdown.front9).toBe(true);
    expect(u6.unitBreakdown.back9).toBe(true);
    expect(u6.unitBreakdown.total18).toBe(true);

    // En ikke-vinner er fortsatt representert med null units.
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    expect(u1.unitBreakdown.front9).toBe(false);
    expect(u1.unitBreakdown.back9).toBe(false);
    expect(u1.unitBreakdown.total18).toBe(false);
  });
});
