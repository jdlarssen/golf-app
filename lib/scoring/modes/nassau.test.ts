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

// -----------------------------------------------------------------------------
// Tiebreaker-fix: issue #684 — rå delsum belønnet færre hull (asc raw sum →
// lavere sum for den som pick-uppet/ikke spilte). Riktig tiebreaker er den
// padded total18-seksjonrangen (allerede beregnet av rankTeams med 999 for
// uspilte hull), slik at en spiller som IKKE fullførte runden rangeres BAKOVER.
// -----------------------------------------------------------------------------
describe('nassau.compute — tiebreaker bruker padded seksjonrang, ikke rå delsum (#684)', () => {
  it('to spillere tied 0 units: den med fullstendig runde slår den med færre hull', () => {
    // Scenario: u3 vinner alle tre seksjoner (units=3). u1 og u2 har 0 units.
    //
    // u1: spiller BARE hull 1–9 med score 5 (bogey) → rå total18-sum = 45.
    //     Hull 10–18 er uspilte → paddes med 999 i cascade.
    //
    // u2: spiller ALLE 18 hull med score 4 (par) → rå total18-sum = 72.
    //     Alle hull spilt → ingen padding.
    //
    // u3: par 3 × 18 → vinner front9/back9/total18, units=3, rank=1.
    //
    // Uten fix (rå sum): u1.total18EffectiveStrokes=45 < u2=72 → u1 rank 2 (FEIL).
    // Med fix (padded rank): cascade hull 1 → u1=5, u2=4 → u2 rangerer foran u1
    //   i total18-seksjon → u2 rank 2, u1 rank 3 (riktig).
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2'), soloPlayer('u3')],
      holes: par4Holes(18),
      scores: [
        // u1 spiller kun front 9, score 5 per hull
        ...scoresFor('u1', Array(9).fill(5)),
        // u2 spiller alle 18, score 4 per hull
        ...scoresFor('u2', Array(18).fill(4)),
        // u3 spiller alle 18, score 3 → vinner alle seksjoner
        ...scoresFor('u3', Array(18).fill(3)),
      ],
      nassauScoring: 'gross',
    });
    const result = compute(ctx);

    // Forutsetninger: u3 har alle seksjonene, u1 og u2 har 0 units.
    const u3 = result.players.find((p) => p.userId === 'u3')!;
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u3.units).toBe(3);
    expect(u1.units).toBe(0);
    expect(u2.units).toBe(0);

    // Kjerne-assertion (#684): u2 (fullstendig runde) skal rangeres FORAN u1
    // (færre hull). u1 skal IKKE ha lavere rank enn u2 bare fordi rå delsum er lavere.
    expect(u2.rank).toBeLessThan(u1.rank);
  });
});

// -----------------------------------------------------------------------------
// Per-hull-eksponering (epic #496, PR 7). `result.holes` mater den format-
// bevisste «Hull for hull»-flaten (NassauHolesView) og H2H-momentum-strippen.
// Additivt felt — eksisterende cases over forblir grønne.
// -----------------------------------------------------------------------------
describe('nassau.compute — per-hull holes-eksponering (#496)', () => {
  it('eksponerer 18 sorterte hull-rader med par, strokeIndex og seksjon', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(18).fill(4)),
        ...scoresFor('u2', Array(18).fill(5)),
      ],
    });
    const result = compute(ctx);
    expect(result.holes).toHaveLength(18);
    expect(result.holes.map((h) => h.holeNumber)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 1),
    );
    expect(result.holes[0].par).toBe(4);
    expect(result.holes[0].strokeIndex).toBe(1);
    // Hull 1-9 = front9, 10-18 = back9 (total er unionen, ikke en hull-seksjon).
    expect(result.holes.slice(0, 9).every((h) => h.section === 'front9')).toBe(
      true,
    );
    expect(result.holes.slice(9).every((h) => h.section === 'back9')).toBe(
      true,
    );
  });

  it('perPlayer har gross + effective; net-modus trekker fra tildelte slag', () => {
    // u1 hcp 18 → 1 slag på hvert hull (SI 1-18). gross 5 → effective 4.
    const ctx = makeCtx({
      players: [soloPlayer('u1', 18), soloPlayer('u2', 0)],
      holes: par4Holes(18),
      scores: [
        ...scoresFor('u1', Array(18).fill(5)),
        ...scoresFor('u2', Array(18).fill(4)),
      ],
      nassauScoring: 'net',
    });
    const result = compute(ctx);
    const hole1 = result.holes[0];
    const u1Cell = hole1.perPlayer.find((c) => c.userId === 'u1')!;
    const u2Cell = hole1.perPlayer.find((c) => c.userId === 'u2')!;
    expect(u1Cell.gross).toBe(5);
    expect(u1Cell.effective).toBe(4); // 5 − 1 tildelt slag
    expect(u2Cell.gross).toBe(4);
    expect(u2Cell.effective).toBe(4); // hcp 0 → ingen slag
  });

  it('gross-modus ignorerer handicap (effective === gross)', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1', 18)],
      holes: par4Holes(18),
      scores: [...scoresFor('u1', Array(18).fill(5))],
      nassauScoring: 'gross',
    });
    const result = compute(ctx);
    const cell = result.holes[0].perPlayer.find((c) => c.userId === 'u1')!;
    expect(cell.gross).toBe(5);
    expect(cell.effective).toBe(5); // hcp ignorert i gross-modus
  });

  it('bestUserIds = lavest effective; én vinner, delt ved lik, tom ved uspilt', () => {
    // Hull 1: u1=4 vinner alene. Hull 2: u1=u2=4 delt. Hull 3: ingen spilte.
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(18),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 5 },
        { userId: 'u1', holeNumber: 2, gross: 4 },
        { userId: 'u2', holeNumber: 2, gross: 4 },
        // hull 3: ingen score
      ],
    });
    const result = compute(ctx);
    expect(result.holes[0].bestUserIds).toEqual(['u1']);
    expect([...result.holes[1].bestUserIds].sort()).toEqual(['u1', 'u2']);
    expect(result.holes[2].bestUserIds).toEqual([]);
  });

  it('uspilt hull gir null effective/gross (ikke 999-padding-verdien)', () => {
    const ctx = makeCtx({
      players: [soloPlayer('u1'), soloPlayer('u2')],
      holes: par4Holes(18),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        // u2 har ikke spilt hull 1
      ],
    });
    const result = compute(ctx);
    const u2Cell = result.holes[0].perPlayer.find((c) => c.userId === 'u2')!;
    expect(u2Cell.gross).toBeNull();
    expect(u2Cell.effective).toBeNull();
    // bestUserIds ser bort fra uspilte → kun u1.
    expect(result.holes[0].bestUserIds).toEqual(['u1']);
  });
});

// ---------------------------------------------------------------------------
// #2625 part 2: new Nassau games carry `ranking: 'net_to_par'` in mode_config.
// Each section ranks on strokes against par over the holes each player has
// played in it, instead of padding the unplayed holes. Units, push and sweep
// follow the new order as before. Games without the flag keep today's rule.
// ---------------------------------------------------------------------------

describe('nassau.compute — ranking: net_to_par (#2625)', () => {
  const PLAIN = { kind: 'nassau', team_size: 1, nassau_scoring: 'net' };
  const FLAGGED = { ...PLAIN, ranking: 'net_to_par' };
  /** Gross per hole number, in order from hole `from`. */
  const card = (userId: string, gross: number[], from = 1): ScoringHoleScore[] =>
    gross.map((g, i) => ({ userId, holeNumber: from + i, gross: g }));

  // The issue's shape on the front nine: A −3 after 3 holes, B −2 after all
  // nine. Par 4 everywhere.
  const frontExample = {
    players: [soloPlayer('A'), soloPlayer('B')],
    holes: par4Holes(18),
    scores: [...card('A', [3, 3, 3]), ...card('B', [3, 3, 4, 4, 4, 4, 4, 4, 4])],
  };

  it('the issue shape: A (−3 after 3) leads the front nine ahead of B (−2 after 9) with the flag', () => {
    const result = compute(makeCtx({ ...frontExample, modeConfigOverride: FLAGGED }));
    const front = result.sections.front9;
    expect(front.players.map((p) => [p.userId, p.rank, p.toPar])).toEqual([
      ['A', 1, -3],
      ['B', 2, -2],
    ]);
    expect(front.winnerUserIds).toEqual(['A']);
    expect(result.players.map((p) => [p.userId, p.rank, p.units])).toEqual([
      ['A', 1, 1],
      ['B', 2, 0],
    ]);
    expect(result.ranking).toBe('net_to_par');
  });

  it('without the flag the same round keeps today’s order (B, who finished the nine)', () => {
    const result = compute(makeCtx({ ...frontExample, modeConfigOverride: PLAIN }));
    expect(result.sections.front9.players.map((p) => [p.userId, p.rank, p.tiedWith])).toEqual([
      ['B', 1, []],
      ['A', 2, []],
    ]);
    expect(result.sections.front9.winnerUserIds).toEqual(['B']);
    expect(result.players.map((p) => [p.userId, p.rank, p.units])).toEqual([
      ['B', 1, 1],
      ['A', 2, 0],
    ]);
    expect(result.ranking).toBe('net_total');
  });

  it('toPar per section is Σ (effective − own par) over played holes, null without a hole, also without the flag', () => {
    // Hole 1 is a par 5 from the ladies' tee: L's 5 there is par (0). Hole 10
    // is a par 4 for everyone: 5 is +1. M has not started.
    const holes = par4Holes(18).map((h) =>
      h.number === 1 ? { ...h, parByGender: { mens: 4, ladies: 5, juniors: 4 } } : h,
    );
    const result = compute(
      makeCtx({
        players: [{ ...soloPlayer('L'), teeGender: 'ladies' }, soloPlayer('M')],
        holes,
        scores: [
          { userId: 'L', holeNumber: 1, gross: 5 },
          { userId: 'L', holeNumber: 10, gross: 5 },
        ],
        modeConfigOverride: PLAIN,
      }),
    );
    const toPar = (section: 'front9' | 'back9' | 'total18', userId: string) =>
      result.sections[section].players.find((p) => p.userId === userId)!.toPar;
    expect([toPar('front9', 'L'), toPar('back9', 'L'), toPar('total18', 'L')]).toEqual([0, 1, 1]);
    expect([toPar('front9', 'M'), toPar('back9', 'M'), toPar('total18', 'M')]).toEqual([null, null, null]);
  });

  it('a player without a hole in a section still ranks last in it with the flag (#635)', () => {
    // A has played hole 10 at +4; B has played the front nine only.
    const result = compute(
      makeCtx({
        players: [soloPlayer('B'), soloPlayer('A')],
        holes: par4Holes(18),
        scores: [...card('A', [8], 10), ...card('B', [4, 4, 4])],
        modeConfigOverride: FLAGGED,
      }),
    );
    expect(result.sections.back9.players.map((p) => [p.userId, p.rank, p.toPar])).toEqual([
      ['A', 1, 4],
      ['B', 2, null],
    ]);
  });

  it('a finished round gives the same sections and units with and without the flag when everyone plays tees with the same par', () => {
    // P1 and P3 tie the front nine (push). P1 and P2 tie the back nine on
    // total and P2 is better on the last six: still a push, since a section
    // is decided on its total and the 18-hole tie-break steps only reach the
    // back nine in the total. P1 takes the total alone.
    const opts = {
      players: [soloPlayer('P1'), soloPlayer('P2'), soloPlayer('P3')],
      holes: par4Holes(18),
      scores: [
        ...card('P1', [4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 4, 4, 4, 4, 4, 4]),
        ...card('P2', [5, 5, 5, 5, 5, 5, 5, 5, 5, 4, 4, 4, 3, 3, 3, 4, 4, 4]),
        ...card('P3', [4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5]),
      ],
    };
    const shape = (r: ReturnType<typeof compute>) => ({
      sections: (['front9', 'back9', 'total18'] as const).map((name) => ({
        name,
        winners: [...r.sections[name].winnerUserIds].sort(),
        players: r.sections[name].players.map(({ userId, rank, tiedWith }) => ({ userId, rank, tiedWith })),
      })),
      players: r.players.map(({ userId, units, unitBreakdown, rank, tiedWith }) => ({
        userId,
        units,
        unitBreakdown,
        rank,
        tiedWith,
      })),
    });

    const withFlag = shape(compute(makeCtx({ ...opts, modeConfigOverride: FLAGGED })));
    expect(withFlag).toEqual(shape(compute(makeCtx({ ...opts, modeConfigOverride: PLAIN }))));
    expect(withFlag.sections.map((s) => s.winners)).toEqual([['P1', 'P3'], ['P1', 'P2'], ['P1']]);
    expect(withFlag.players.map((p) => [p.userId, p.units])).toEqual([
      ['P1', 1],
      ['P2', 0],
      ['P3', 0],
    ]);
  });

  it('a finished round on mixed tees ranks each player against their own par (WHS), so a section can go the other way', () => {
    // Holes 1–3 are par 5 from the ladies' tee. M (men's tee) and L (ladies'
    // tee) both score 4 on every hole: the same 36 / 36 / 72 strokes, a push
    // on every section by the sum. Against her own par L is −3, so with the
    // flag she takes the front nine and the 18, and the units move with it.
    const holes = par4Holes(18).map((h) =>
      h.number <= 3 ? { ...h, parByGender: { mens: 4, ladies: 5, juniors: 4 } } : h,
    );
    const opts = {
      players: [soloPlayer('M'), { ...soloPlayer('L'), teeGender: 'ladies' as const }],
      holes,
      scores: [...card('M', Array(18).fill(4)), ...card('L', Array(18).fill(4))],
    };
    const flagged = compute(makeCtx({ ...opts, modeConfigOverride: FLAGGED }));
    expect(flagged.sections.front9.winnerUserIds).toEqual(['L']);
    expect([...flagged.sections.back9.winnerUserIds].sort()).toEqual(['L', 'M']);
    expect(flagged.sections.total18.winnerUserIds).toEqual(['L']);
    expect(flagged.players.map((p) => [p.userId, p.units])).toEqual([
      ['L', 2],
      ['M', 0],
    ]);

    // The hole rows agree with the sections: with the flag L wins holes 1–3
    // against her own par (4 on her par 5), and the rest are shared.
    expect(flagged.holes.slice(0, 4).map((h) => h.bestUserIds)).toEqual([['L'], ['L'], ['L'], ['M', 'L']]);
    // Each cell carries the player's own par, so a hole card can order its
    // rows on the same measure.
    expect(flagged.holes[0].perPlayer.map((c) => [c.userId, c.par])).toEqual([
      ['M', 4],
      ['L', 5],
    ]);

    const plain = compute(makeCtx({ ...opts, modeConfigOverride: PLAIN }));
    // Without the flag a hole is won on the lowest effective strokes, as before.
    expect(plain.holes[0].bestUserIds).toEqual(['M', 'L']);
    expect(plain.sections.front9.winnerUserIds).toHaveLength(2);
    expect(plain.sections.total18.winnerUserIds).toHaveLength(2);
    expect(plain.players.map((p) => p.units)).toEqual([0, 0]);
  });

  it('ranks the 18 on to par in a part-played round on mixed pars: a shared place at E, +1 split on the back nine', () => {
    const PARS = [5, 3, 4, 4, 4, 3, 5, 3, 4, 5, 4, 4, 3, 4, 5, 4, 4, 4];
    const holes: ScoringHole[] = PARS.map((par, i) => ({ number: i + 1, par, strokeIndex: i + 1 }));
    const deltaCard = (userId: string, from: number, deltas: number[]): ScoringHoleScore[] =>
      deltas.map((d, i) => ({ userId, holeNumber: from + i, gross: PARS[from + i - 1] + d }));
    const result = compute(
      makeCtx({
        players: ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => soloPlayer(id)),
        holes,
        scores: [
          ...deltaCard('p1', 1, [1, 0, 0, 0, 0]),
          ...deltaCard('p2', 1, [0, 0, 0, 0, 0, 0, 0, 0, -1]),
          ...deltaCard('p3', 10, [1, 0, 0]),
          ...deltaCard('p4', 1, [1, -1]),
          ...deltaCard('p5', 1, [0, 0, 0]),
        ],
        modeConfigOverride: FLAGGED,
      }),
    );
    expect(
      [...result.sections.total18.players]
        .sort((a, b) => a.rank - b.rank || a.userId.localeCompare(b.userId))
        .map((p) => [p.userId, p.toPar, p.rank, p.tiedWith]),
    ).toEqual([
      ['p2', -1, 1, []],
      ['p4', 0, 2, ['p5']],
      ['p5', 0, 2, ['p4']],
      ['p1', 1, 4, []],
      ['p3', 1, 5, []],
    ]);
  });
});
