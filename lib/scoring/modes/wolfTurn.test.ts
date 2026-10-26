import { describe, it, expect } from 'vitest';
import {
  catchUpStartHole,
  wolfCatchUpGap,
  wolfFixedHolesForSlot,
  wolfForHole,
  wolfPointsBeforeHole,
  wolfRotationRule,
  wolfUpcoming,
  type WolfRotationRule,
  type WolfTurnPlayer,
} from './wolfTurn';

// #2314: hvem er ulv på et hull. `trailing` er regelen spill laget før #2314
// har (den som ligger sist tar de siste hullene, uansett avstand). `catch_up`
// er regelen nye spill stemples med: den som ligger sist er ulv på de siste
// hullene bare når den ligger minst n poeng bak lederen.

function playersN(n: number): WolfTurnPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ userId: `p${i + 1}`, teamNumber: i + 1 }));
}

function points(entries: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(entries));
}

/**
 * Dagens regel slik `determineWolfForHole` hadde den før #2314, kopiert inn
 * som orakel: `trailing` skal gi nøyaktig samme svar.
 */
function legacyWolf(
  holeNumber: number,
  players: WolfTurnPlayer[],
  pointsByUser: Map<string, number>,
): string | null {
  if (players.length === 0) return null;
  const n = players.length;
  const R = Math.floor(18 / n) * n;
  if (holeNumber >= 1 && holeNumber <= R) {
    const slot = ((holeNumber - 1) % n) + 1;
    return players.find((p) => p.teamNumber === slot)?.userId ?? null;
  }
  const sorted = [...players].sort((a, b) => {
    const ta = pointsByUser.get(a.userId) ?? 0;
    const tb = pointsByUser.get(b.userId) ?? 0;
    if (ta !== tb) return ta - tb;
    return a.teamNumber - b.teamNumber;
  });
  return sorted[0]?.userId ?? null;
}

describe('catchUpStartHole', () => {
  it.each<[number, WolfRotationRule, number]>([
    [3, 'trailing', 19],
    [4, 'trailing', 17],
    [5, 'trailing', 16],
    [3, 'catch_up', 16],
    [4, 'catch_up', 17],
    [5, 'catch_up', 16],
  ])('n=%i, %s → hull %i', (n, rule, expected) => {
    expect(catchUpStartHole(n, rule)).toBe(expected);
  });
});

describe('wolfRotationRule', () => {
  it('leser flagget fra mode_config', () => {
    expect(wolfRotationRule({ wolf_rotation: 'catch_up' })).toBe('catch_up');
  });
  it.each([[{}], [null], [undefined], [{ wolf_rotation: 'noe annet' }]])(
    'uten flagget (%j) er regelen trailing',
    (config) => {
      expect(wolfRotationRule(config)).toBe('trailing');
    },
  );
});

describe('wolfForHole — catch_up, terskelen', () => {
  it.each<[number, number, number, boolean]>([
    // n, hull, avstand mellom leder og sist, catch-up?
    [3, 16, 3, true],
    [3, 16, 2, false],
    [4, 17, 4, true],
    [4, 17, 3, false],
    [5, 16, 5, true],
    [5, 16, 4, false],
  ])('n=%i, hull %i, avstand %i → catch-up %s', (n, hole, gap, catchUp) => {
    const players = playersN(n);
    // Siste plass (team_number n) ligger `gap` bak lederen (p1).
    const pts: Record<string, number> = {};
    for (const p of players) pts[p.userId] = 10;
    pts.p1 = 10 + gap;
    pts[`p${n}`] = 10;
    // Et mellomlag så lederen er eneste leder og p_n eneste sist.
    for (let i = 2; i < n; i += 1) pts[`p${i}`] = 10 + Math.min(1, gap);
    const result = wolfForHole({
      holeNumber: hole,
      players,
      pointsBefore: points(pts),
      rule: 'catch_up',
    });
    const rotationWolf = `p${((hole - 1) % n) + 1}`;
    expect(result).toEqual(
      catchUp ? { userId: `p${n}`, catchUp: true } : { userId: rotationWolf, catchUp: false },
    );
  });

  it('hullet før catch-up-starten følger rundgangen uansett avstand', () => {
    const players = playersN(4);
    const result = wolfForHole({
      holeNumber: 16,
      players,
      pointsBefore: points({ p1: 30, p2: 0, p3: 0, p4: 0 }),
      rule: 'catch_up',
    });
    expect(result).toEqual({ userId: 'p4', catchUp: false });
  });

  it('likt sist: lavest team_number blir ulv', () => {
    const result = wolfForHole({
      holeNumber: 17,
      players: playersN(4),
      pointsBefore: points({ p1: 2, p2: 12, p3: 2, p4: 2 }),
      rule: 'catch_up',
    });
    expect(result).toEqual({ userId: 'p1', catchUp: true });
  });

  it('alle likt: ingen avstand, rundgangen går videre', () => {
    const result = wolfForHole({
      holeNumber: 18,
      players: playersN(4),
      pointsBefore: new Map(),
      rule: 'catch_up',
    });
    expect(result).toEqual({ userId: 'p2', catchUp: false });
  });

  it('n=4 uten catch-up: hull 17 → plass 1, hull 18 → plass 2', () => {
    const players = playersN(4);
    const pts = points({ p1: 5, p2: 4, p3: 3, p4: 2 });
    expect(wolfForHole({ holeNumber: 17, players, pointsBefore: pts, rule: 'catch_up' })).toEqual({
      userId: 'p1',
      catchUp: false,
    });
    expect(wolfForHole({ holeNumber: 18, players, pointsBefore: pts, rule: 'catch_up' })).toEqual({
      userId: 'p2',
      catchUp: false,
    });
  });
});

describe('wolfForHole — regneeksempelet i kontrakten, n=3', () => {
  // Jørgen plass 1 (p1), kompis plass 2 (p2), Jussa plass 3 (p3). Terskel 3.
  const players = playersN(3);
  it.each<[number, Record<string, number>, string, boolean]>([
    [16, { p1: 20, p2: 19, p3: 12 }, 'p3', true],
    [17, { p1: 20, p2: 19, p3: 15 }, 'p3', true],
    [18, { p1: 20, p2: 19, p3: 18 }, 'p3', false],
  ])('hull %i, stilling %j → %s (catch-up %s)', (hole, pts, wolf, catchUp) => {
    expect(
      wolfForHole({ holeNumber: hole, players, pointsBefore: points(pts), rule: 'catch_up' }),
    ).toEqual({ userId: wolf, catchUp });
  });

  it('eierens 20 · 19 · 18 før hull 16: avstand 2, rundgangen gir plass 1', () => {
    expect(
      wolfForHole({
        holeNumber: 16,
        players,
        pointsBefore: points({ p1: 20, p2: 19, p3: 18 }),
        rule: 'catch_up',
      }),
    ).toEqual({ userId: 'p1', catchUp: false });
  });

  it('samme spiller kan bli catch-up-ulv på alle tre hullene', () => {
    const pts = points({ p1: 30, p2: 25, p3: 10 });
    for (const hole of [16, 17, 18]) {
      expect(wolfForHole({ holeNumber: hole, players, pointsBefore: pts, rule: 'catch_up' })).toEqual({
        userId: 'p3',
        catchUp: true,
      });
    }
  });

  it('trailing med tre spillere har ingen sluttdel: hull 16–18 er rundgang', () => {
    const pts = points({ p1: 30, p2: 25, p3: 10 });
    expect(
      [16, 17, 18].map((hole) =>
        wolfForHole({ holeNumber: hole, players, pointsBefore: pts, rule: 'trailing' }),
      ),
    ).toEqual([
      { userId: 'p1', catchUp: false },
      { userId: 'p2', catchUp: false },
      { userId: 'p3', catchUp: false },
    ]);
  });
});

describe('wolfForHole — lagret rad', () => {
  it('en lagret rad vinner over rundgangen', () => {
    expect(
      wolfForHole({
        holeNumber: 1,
        players: playersN(4),
        pointsBefore: new Map(),
        explicitWolf: 'p3',
        rule: 'catch_up',
      }),
    ).toEqual({ userId: 'p3', catchUp: false });
  });

  it('en lagret rad vinner over catch-up', () => {
    expect(
      wolfForHole({
        holeNumber: 17,
        players: playersN(4),
        pointsBefore: points({ p1: 20, p2: 0, p3: 10, p4: 10 }),
        explicitWolf: 'p3',
        rule: 'catch_up',
      }),
    ).toEqual({ userId: 'p3', catchUp: false });
  });

  it('en lagret rad med catch-up-ulven beholder merket', () => {
    expect(
      wolfForHole({
        holeNumber: 17,
        players: playersN(4),
        pointsBefore: points({ p1: 20, p2: 0, p3: 10, p4: 10 }),
        explicitWolf: 'p2',
        rule: 'catch_up',
      }),
    ).toEqual({ userId: 'p2', catchUp: true });
  });

  it('en ukjent lagret ulv ignoreres', () => {
    expect(
      wolfForHole({
        holeNumber: 2,
        players: playersN(4),
        pointsBefore: new Map(),
        explicitWolf: 'ukjent',
        rule: 'catch_up',
      }),
    ).toEqual({ userId: 'p2', catchUp: false });
  });
});

describe('wolfForHole — kanttilfeller', () => {
  it('ingen spillere → null', () => {
    expect(
      wolfForHole({ holeNumber: 1, players: [], pointsBefore: new Map(), rule: 'catch_up' }),
    ).toBeNull();
  });

  it('hull i rundgangen uten spiller på plassen → null', () => {
    const gapped = [
      { userId: 'p1', teamNumber: 1 },
      { userId: 'p3', teamNumber: 3 },
      { userId: 'p4', teamNumber: 4 },
      { userId: 'p5', teamNumber: 5 },
    ];
    expect(
      wolfForHole({ holeNumber: 2, players: gapped, pointsBefore: new Map(), rule: 'catch_up' }),
    ).toBeNull();
  });
});

describe('wolfForHole — trailing gir nøyaktig dagens svar', () => {
  const standings: Array<(n: number) => Record<string, number>> = [
    () => ({}),
    (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i + 1}`, i])),
    (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i + 1}`, 20 - 3 * i])),
    (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i + 1}`, i % 2 === 0 ? 4 : 1])),
    () => ({ p1: 0, p2: 0, p3: 9 }),
  ];
  for (const n of [3, 4, 5]) {
    for (const [index, build] of standings.entries()) {
      it(`n=${n}, stilling ${index}: alle 18 hull`, () => {
        const players = playersN(n);
        const pts = points(build(n));
        for (let hole = 1; hole <= 18; hole += 1) {
          expect(
            wolfForHole({ holeNumber: hole, players, pointsBefore: pts, rule: 'trailing' })?.userId ??
              null,
          ).toBe(legacyWolf(hole, players, pts));
        }
      });
    }
  }
});

describe('wolfPointsBeforeHole og wolfCatchUpGap', () => {
  const rows: Array<{ holeNumber: number; pointsByPlayer: Record<string, number> }> = [
    { holeNumber: 1, pointsByPlayer: { p1: 2, p2: 2 } },
    { holeNumber: 2, pointsByPlayer: { p3: 3 } },
    { holeNumber: 3, pointsByPlayer: { p1: 4 } },
  ];
  it('summerer bare hullene før', () => {
    expect(wolfPointsBeforeHole(rows, 3)).toEqual(points({ p1: 2, p2: 2, p3: 3 }));
    expect(wolfPointsBeforeHole(rows, 1)).toEqual(new Map());
    expect(wolfPointsBeforeHole(undefined, 5)).toEqual(new Map());
  });
  it('avstanden er lederen minus den som ligger sist', () => {
    expect(wolfCatchUpGap(playersN(3), points({ p1: 20, p2: 19, p3: 12 }))).toBe(8);
    expect(wolfCatchUpGap(playersN(3), new Map())).toBe(0);
    expect(wolfCatchUpGap([], new Map())).toBe(0);
  });
});

describe('wolfFixedHolesForSlot', () => {
  it.each<[number, number, WolfRotationRule, number[]]>([
    [1, 4, 'trailing', [1, 5, 9, 13]],
    [4, 4, 'trailing', [4, 8, 12, 16]],
    [1, 3, 'trailing', [1, 4, 7, 10, 13, 16]],
    [3, 3, 'trailing', [3, 6, 9, 12, 15, 18]],
    [1, 3, 'catch_up', [1, 4, 7, 10, 13]],
    [3, 3, 'catch_up', [3, 6, 9, 12, 15]],
    [1, 4, 'catch_up', [1, 5, 9, 13]],
    [5, 5, 'catch_up', [5, 10, 15]],
  ])('plass %i, n=%i, %s → %j', (slot, n, rule, expected) => {
    expect(wolfFixedHolesForSlot(slot, n, rule)).toEqual(expected);
  });
});

describe('wolfUpcoming', () => {
  const players = playersN(4);

  it('kjente hull i rundgangen, fire om gangen', () => {
    expect(
      wolfUpcoming({
        fromHole: 7,
        count: 4,
        players,
        pointsBefore: new Map(),
        choices: [],
        rule: 'catch_up',
      }),
    ).toEqual([
      { hole: 7, wolfUserId: 'p3', catchUp: false },
      { hole: 8, wolfUserId: 'p4', catchUp: false },
      { hole: 9, wolfUserId: 'p1', catchUp: false },
      { hole: 10, wolfUserId: 'p2', catchUp: false },
    ]);
  });

  it('catch-up-hull som ikke er fromHole: avgjøres etter forrige hull', () => {
    expect(
      wolfUpcoming({
        fromHole: 15,
        count: 4,
        players,
        pointsBefore: new Map(),
        choices: [],
        rule: 'catch_up',
      }),
    ).toEqual([
      { hole: 15, wolfUserId: 'p3', catchUp: false },
      { hole: 16, wolfUserId: 'p4', catchUp: false },
      { hole: 17, settlesAfterHole: 16 },
      { hole: 18, settlesAfterHole: 17 },
    ]);
  });

  it('slutter ved hull 18, og fromHole er alltid kjent', () => {
    expect(
      wolfUpcoming({
        fromHole: 17,
        count: 4,
        players,
        pointsBefore: points({ p1: 10, p2: 6, p3: 6, p4: 6 }),
        choices: [],
        rule: 'catch_up',
      }),
    ).toEqual([
      { hole: 17, wolfUserId: 'p2', catchUp: true },
      { hole: 18, settlesAfterHole: 17 },
    ]);
  });

  it('en lagret rad gjør et catch-up-hull kjent', () => {
    expect(
      wolfUpcoming({
        fromHole: 16,
        count: 4,
        players,
        pointsBefore: new Map(),
        choices: [{ holeNumber: 18, wolfUserId: 'p3' }],
        rule: 'catch_up',
      }),
    ).toEqual([
      { hole: 16, wolfUserId: 'p4', catchUp: false },
      { hole: 17, settlesAfterHole: 16 },
      { hole: 18, wolfUserId: 'p3', catchUp: false },
    ]);
  });

  it('en lagret rad vinner også i rundgangen', () => {
    expect(
      wolfUpcoming({
        fromHole: 1,
        count: 2,
        players,
        pointsBefore: new Map(),
        choices: [{ holeNumber: 2, wolfUserId: 'p4' }],
        rule: 'catch_up',
      })[1],
    ).toEqual({ hole: 2, wolfUserId: 'p4', catchUp: false });
  });

  it('gamle spill med fire spillere: 17–18 avgjøres også', () => {
    expect(
      wolfUpcoming({
        fromHole: 16,
        count: 4,
        players,
        pointsBefore: new Map(),
        choices: [],
        rule: 'trailing',
      }),
    ).toEqual([
      { hole: 16, wolfUserId: 'p4', catchUp: false },
      { hole: 17, settlesAfterHole: 16 },
      { hole: 18, settlesAfterHole: 17 },
    ]);
  });

  it('gamle spill med tre spillere: alle hull er kjent', () => {
    expect(
      wolfUpcoming({
        fromHole: 16,
        count: 4,
        players: playersN(3),
        pointsBefore: new Map(),
        choices: [],
        rule: 'trailing',
      }),
    ).toEqual([
      { hole: 16, wolfUserId: 'p1', catchUp: false },
      { hole: 17, wolfUserId: 'p2', catchUp: false },
      { hole: 18, wolfUserId: 'p3', catchUp: false },
    ]);
  });
});
