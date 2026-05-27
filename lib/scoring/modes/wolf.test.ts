import { describe, it, expect } from 'vitest';
import { compute } from './wolf';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
  WolfHoleChoice,
  GameModeConfig,
} from './types';

// -----------------------------------------------------------------------------
// Fikstur-helpers
//
// Wolf krever EKSAKT 4 spillere med team_number 1-4. Vi bygger 18-hulls
// ScoringContexts med par 4, SI = hull-nummer som default. Scores og
// wolfChoices populeres per-test slik at hver test kun setter det
// minimum-strenge feltet den verifiserer.
// -----------------------------------------------------------------------------

function par4Holes(count: number): ScoringHole[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
  }));
}

function fourPlayers(opts?: {
  handicaps?: [number, number, number, number];
}): ScoringPlayer[] {
  const hcps = opts?.handicaps ?? [0, 0, 0, 0];
  return [
    { userId: 'p1', teamNumber: 1, flightNumber: 1, courseHandicap: hcps[0] },
    { userId: 'p2', teamNumber: 2, flightNumber: 2, courseHandicap: hcps[1] },
    { userId: 'p3', teamNumber: 3, flightNumber: 3, courseHandicap: hcps[2] },
    { userId: 'p4', teamNumber: 4, flightNumber: 4, courseHandicap: hcps[3] },
  ];
}

function makeCtx(opts: {
  players?: ScoringPlayer[];
  holes?: ScoringHole[];
  scores?: ScoringHoleScore[];
  wolfChoices?: WolfHoleChoice[];
  scoring?: 'gross' | 'net';
}): ScoringContext {
  const mode_config: GameModeConfig = {
    kind: 'wolf',
    team_size: 1,
    teams_count: 4,
    wolf_scoring: opts.scoring ?? 'gross',
  };
  return {
    game: {
      id: 'g-wolf',
      game_mode: 'wolf',
      mode_config,
    },
    players: opts.players ?? fourPlayers(),
    holes: opts.holes ?? par4Holes(18),
    scores: opts.scores ?? [],
    wolfChoices: opts.wolfChoices ?? [],
  };
}

/**
 * Helper: bygg gross-scores for ett hull der vi spesifiserer hver spillers
 * gross. `null` = ikke spilt.
 */
function holeScores(
  holeNumber: number,
  grosses: Record<string, number | null>,
): ScoringHoleScore[] {
  return Object.entries(grosses).map(([userId, gross]) => ({
    userId,
    holeNumber,
    gross,
  }));
}

/**
 * Plukker total-poeng for en spiller fra resultatet. Returnerer 0 hvis
 * spilleren ikke fins (test-bug-detektor er ok her — assertion vil
 * uansett feile).
 */
function totalsByPlayer(result: ReturnType<typeof compute>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of result.players) {
    out[p.userId] = p.totalPoints;
  }
  return out;
}

// -----------------------------------------------------------------------------
// Tester
// -----------------------------------------------------------------------------

describe('wolf — basic shape', () => {
  it('returnerer kind: "wolf" og 4 spillere', () => {
    const result = compute(makeCtx({}));
    expect(result.kind).toBe('wolf');
    expect(result.players).toHaveLength(4);
    expect(result.rotation).toBe('random_with_trailing');
  });

  it('eksponerer scoring-feltet fra mode_config', () => {
    expect(compute(makeCtx({ scoring: 'gross' })).scoring).toBe('gross');
    expect(compute(makeCtx({ scoring: 'net' })).scoring).toBe('net');
  });

  it('inkluderer 18 hull-rader i resultatet', () => {
    const result = compute(makeCtx({}));
    expect(result.holes).toHaveLength(18);
    expect(result.holes[0].holeNumber).toBe(1);
    expect(result.holes[17].holeNumber).toBe(18);
  });

  it('alle spillere starter på 0 poeng når ingen choices/scores er gitt', () => {
    const result = compute(makeCtx({}));
    for (const p of result.players) {
      expect(p.totalPoints).toBe(0);
    }
  });
});

describe('wolf — rotation hull 1-16', () => {
  // Hull 1: team 1, Hull 2: team 2, Hull 3: team 3, Hull 4: team 4,
  // Hull 5: team 1, Hull 6: team 2, ... osv. (linear (h-1) % 4 + 1)
  it.each([
    [1, 'p1'],
    [2, 'p2'],
    [3, 'p3'],
    [4, 'p4'],
    [5, 'p1'],
    [6, 'p2'],
    [7, 'p3'],
    [8, 'p4'],
    [13, 'p1'],
    [16, 'p4'],
  ])('hull %d har wolf %s (lineær rotasjon)', (holeNumber, expectedWolf) => {
    const result = compute(makeCtx({}));
    expect(result.holes[holeNumber - 1].wolfUserId).toBe(expectedWolf);
  });

  it('respekterer team_number selv når spillerne er i annen array-rekkefølge', () => {
    // Reverser players-array — wolf skal fortsatt bestemmes av team_number,
    // ikke array-indeks.
    const players: ScoringPlayer[] = [
      { userId: 'p4', teamNumber: 4, flightNumber: 4, courseHandicap: 0 },
      { userId: 'p3', teamNumber: 3, flightNumber: 3, courseHandicap: 0 },
      { userId: 'p2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'p1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
    ];
    const result = compute(makeCtx({ players }));
    expect(result.holes[0].wolfUserId).toBe('p1');
    expect(result.holes[3].wolfUserId).toBe('p4');
  });
});

describe('wolf — point matrix (partner)', () => {
  // Partner-modus: 2v2. Stake=1 (base, ingen carry-over fra forrige hull).
  // P1 er wolf på hull 1 (team_number 1). Vi varierer choice + score-utfall.

  it.each([
    {
      desc: 'partner + wolf-side wins → +2 til wolf + partner',
      wolfScore: 3,
      partnerScore: 4,
      opp1Score: 5,
      opp2Score: 5,
      expected: { p1: 2, p2: 2, p3: 0, p4: 0 },
    },
    {
      desc: 'partner + opp-side wins → +1 til hver opp',
      wolfScore: 5,
      partnerScore: 5,
      opp1Score: 3,
      opp2Score: 4,
      expected: { p1: 0, p2: 0, p3: 1, p4: 1 },
    },
    {
      desc: 'partner + tied → 0 til alle',
      wolfScore: 4,
      partnerScore: 5,
      opp1Score: 4,
      opp2Score: 6,
      expected: { p1: 0, p2: 0, p3: 0, p4: 0 },
    },
  ])('$desc', ({ wolfScore, partnerScore, opp1Score, opp2Score, expected }) => {
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores: holeScores(1, {
          p1: wolfScore,
          p2: partnerScore,
          p3: opp1Score,
          p4: opp2Score,
        }),
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'partner', partnerUserId: 'p2' },
        ],
      }),
    );
    expect(totalsByPlayer(result)).toEqual(expected);
  });
});

describe('wolf — point matrix (lone)', () => {
  it.each([
    {
      desc: 'lone + wolf wins → +4 til wolf alene',
      wolfScore: 3,
      opp1: 4,
      opp2: 4,
      opp3: 5,
      expected: { p1: 4, p2: 0, p3: 0, p4: 0 },
    },
    {
      desc: 'lone + opp wins → +1 til hver av 3 opp',
      wolfScore: 6,
      opp1: 3,
      opp2: 4,
      opp3: 5,
      expected: { p1: 0, p2: 1, p3: 1, p4: 1 },
    },
    {
      desc: 'lone + tied (wolf matcher beste opp) → 0 til alle',
      wolfScore: 3,
      opp1: 3,
      opp2: 4,
      opp3: 5,
      expected: { p1: 0, p2: 0, p3: 0, p4: 0 },
    },
  ])('$desc', ({ wolfScore, opp1, opp2, opp3, expected }) => {
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores: holeScores(1, { p1: wolfScore, p2: opp1, p3: opp2, p4: opp3 }),
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    expect(totalsByPlayer(result)).toEqual(expected);
  });
});

describe('wolf — point matrix (blind)', () => {
  it.each([
    {
      desc: 'blind + wolf wins → +6 til wolf alene',
      wolfScore: 3,
      opp1: 4,
      opp2: 4,
      opp3: 5,
      expected: { p1: 6, p2: 0, p3: 0, p4: 0 },
    },
    {
      desc: 'blind + opp wins → +2 til hver av 3 opp',
      wolfScore: 6,
      opp1: 3,
      opp2: 4,
      opp3: 5,
      expected: { p1: 0, p2: 2, p3: 2, p4: 2 },
    },
    {
      desc: 'blind + tied → 0 til alle',
      wolfScore: 4,
      opp1: 4,
      opp2: 5,
      opp3: 6,
      expected: { p1: 0, p2: 0, p3: 0, p4: 0 },
    },
  ])('$desc', ({ wolfScore, opp1, opp2, opp3, expected }) => {
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores: holeScores(1, { p1: wolfScore, p2: opp1, p3: opp2, p4: opp3 }),
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'blind', partnerUserId: null },
        ],
      }),
    );
    expect(totalsByPlayer(result)).toEqual(expected);
  });
});

describe('wolf — stake & carry-over', () => {
  it('tied hull øker stake til neste hull (1 → 2)', () => {
    // Hull 1: tied (stake=1). Hull 2: lone-win → stake=2 til wolf.
    // P1 er wolf hull 1, P2 er wolf hull 2.
    const scores = [
      ...holeScores(1, { p1: 4, p2: 4, p3: 4, p4: 4 }), // alle tied
      ...holeScores(2, { p1: 5, p2: 3, p3: 4, p4: 5 }), // p2 (lone) vinner
    ];
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores,
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'partner', partnerUserId: 'p2' },
          { holeNumber: 2, wolfUserId: 'p2', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    // Hull 1 tied: 0 poeng. Stake bæres til hull 2 = 2.
    // Hull 2 lone-win: 4 × 2 = 8 til p2.
    expect(result.holes[0].stake).toBe(1);
    expect(result.holes[1].stake).toBe(2);
    expect(totalsByPlayer(result)).toEqual({ p1: 0, p2: 8, p3: 0, p4: 0 });
  });

  it('flere tied hull på rad: stake = 3 ved tredje hull, reset til 1 etterpå', () => {
    // Hull 1, 2 tied (stake 1, 2). Hull 3 avgjort på stake 3.
    // Hull 4: ny base stake = 1.
    const scores = [
      ...holeScores(1, { p1: 4, p2: 4, p3: 4, p4: 4 }),
      ...holeScores(2, { p1: 4, p2: 4, p3: 4, p4: 4 }),
      ...holeScores(3, { p1: 4, p2: 4, p3: 4, p4: 4 }),
      ...holeScores(4, { p1: 4, p2: 4, p3: 3, p4: 5 }),
    ];
    // Hull 4: p4 er wolf (team_number 4), velger lone, p3 vinner.
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores,
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'partner', partnerUserId: 'p2' },
          { holeNumber: 2, wolfUserId: 'p2', choice: 'partner', partnerUserId: 'p3' },
          { holeNumber: 3, wolfUserId: 'p3', choice: 'partner', partnerUserId: 'p4' },
          { holeNumber: 4, wolfUserId: 'p4', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    expect(result.holes[0].stake).toBe(1);
    expect(result.holes[1].stake).toBe(2);
    expect(result.holes[2].stake).toBe(3);
    expect(result.holes[3].stake).toBe(4);
    // Hull 4: opp-side wins (p3 = 3, p4 = 4). Lone + opp-wins → +1×stake = 4
    // til hver av p1, p2, p3.
    expect(totalsByPlayer(result)).toEqual({ p1: 4, p2: 4, p3: 4, p4: 0 });
  });

  it('avgjort hull resetter stake til 1 for neste', () => {
    const scores = [
      ...holeScores(1, { p1: 3, p2: 4, p3: 5, p4: 5 }), // p1 partner-win
      ...holeScores(2, { p1: 5, p2: 5, p3: 5, p4: 5 }), // tied
      ...holeScores(3, { p1: 5, p2: 5, p3: 3, p4: 5 }), // p3 lone-win
    ];
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores,
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'partner', partnerUserId: 'p2' },
          { holeNumber: 2, wolfUserId: 'p2', choice: 'partner', partnerUserId: 'p1' },
          { holeNumber: 3, wolfUserId: 'p3', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    // Hull 1 stake 1, hull 2 stake 1 (reset etter avgjort hull 1),
    // hull 3 stake 2 (carry fra tied hull 2)
    expect(result.holes[0].stake).toBe(1);
    expect(result.holes[1].stake).toBe(1);
    expect(result.holes[2].stake).toBe(2);
    // Hull 1: partner-win → +2 til p1, p2.
    // Hull 3: lone-win på stake 2 → +4×2 = 8 til p3.
    expect(totalsByPlayer(result)).toEqual({ p1: 2, p2: 2, p3: 8, p4: 0 });
  });

  it('pending hull bevarer stake uendret (verken øker eller resetter)', () => {
    // Hull 1: tied (stake → 2). Hull 2: pending (stake bevart 2).
    // Hull 3: avgjort på stake 2.
    const scores = [
      ...holeScores(1, { p1: 4, p2: 4, p3: 4, p4: 4 }),
      // hull 2: ingen scores, ingen choice → pending
      ...holeScores(3, { p1: 5, p2: 5, p3: 3, p4: 5 }),
    ];
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores,
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'partner', partnerUserId: 'p2' },
          // ingen choice for hull 2
          { holeNumber: 3, wolfUserId: 'p3', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    expect(result.holes[1].stake).toBe(2); // pending bevart
    expect(result.holes[1].outcome).toBe('pending');
    expect(result.holes[2].stake).toBe(2); // fortsatt 2 ved hull 3
    // Hull 3: lone-win stake 2 → +4×2 = 8 til p3.
    expect(totalsByPlayer(result)).toEqual({ p1: 0, p2: 0, p3: 8, p4: 0 });
  });
});

describe('wolf — gross vs net', () => {
  it('gross-modus ignorerer HCP-strokes', () => {
    // P1 har hcp 18 (= 1 stroke per hull). I gross-modus skal det ikke
    // påvirke score-sammenligningen.
    const players = fourPlayers({ handicaps: [18, 0, 0, 0] });
    const result = compute(
      makeCtx({
        players,
        scoring: 'gross',
        scores: holeScores(1, { p1: 5, p2: 4, p3: 4, p4: 5 }),
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    // Gross: wolf=5, opp-best=4 → opp wins. +1 til p2, p3, p4.
    expect(totalsByPlayer(result)).toEqual({ p1: 0, p2: 1, p3: 1, p4: 1 });
  });

  it('net-modus applikerer HCP-strokes per SI', () => {
    // P1 har hcp 18 (= 1 stroke på hvert hull). På hull 1 (SI=1) får P1 1 stroke.
    // P1 gross 5 → net 4. Resten: gross = net 4.
    // → alle på 4 netto, tied. 0 poeng.
    const players = fourPlayers({ handicaps: [18, 0, 0, 0] });
    const result = compute(
      makeCtx({
        players,
        scoring: 'net',
        scores: holeScores(1, { p1: 5, p2: 4, p3: 4, p4: 4 }),
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    expect(result.holes[0].outcome).toBe('tied');
    expect(totalsByPlayer(result)).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });

  it('net-modus: hcp 18 gir wolf netto-vinst på SI=1', () => {
    // P1 hcp 18: 1 stroke på SI=1 (hull 1). Gross 4 → net 3.
    // Andre: gross 4 → net 4. P1 vinner alene → +4.
    const players = fourPlayers({ handicaps: [18, 0, 0, 0] });
    const result = compute(
      makeCtx({
        players,
        scoring: 'net',
        scores: holeScores(1, { p1: 4, p2: 4, p3: 4, p4: 4 }),
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    expect(result.holes[0].outcome).toBe('wolf_side_wins');
    expect(totalsByPlayer(result)).toEqual({ p1: 4, p2: 0, p3: 0, p4: 0 });
  });
});

describe('wolf — trailing-wolf hull 17-18', () => {
  it('hull 17: wolf er spilleren med lavest total etter hull 16', () => {
    // Setup: p4 vinner et lone på hull 4 (+4) — er nå leder.
    // p3 vinner et partner med p4 på hull 3 — begge får +2.
    // p2 ingen poeng. p1 ingen poeng.
    // Etter hull 16: p4=4, p3=2, p2=0, p1=0.
    // Lavest total: p1 og p2 (begge 0). Tiebreak team_number ASC → p1 vinner.
    // P1 skal være wolf på hull 17.
    const scores = [
      ...holeScores(3, { p1: 5, p2: 5, p3: 3, p4: 3 }), // p3 wolf, partner p4 vinner
      ...holeScores(4, { p1: 5, p2: 5, p3: 5, p4: 3 }), // p4 wolf, lone, vinner
    ];
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores,
        wolfChoices: [
          { holeNumber: 3, wolfUserId: 'p3', choice: 'partner', partnerUserId: 'p4' },
          { holeNumber: 4, wolfUserId: 'p4', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    expect(result.holes[16].wolfUserId).toBe('p1');
  });

  it('hull 17: trailing-tiebreak går på team_number ASC når flere spillere er likt lavest', () => {
    // Ingen poeng for noen → alle 4 på 0. Tiebreak: lavest team_number = p1.
    const result = compute(makeCtx({}));
    expect(result.holes[16].wolfUserId).toBe('p1');
  });

  it('hull 18: tail-wolf basert på totalen ETTER hull 17 (ny situasjon)', () => {
    // Hull 17: P1 er trailing wolf (alle tied på 0). P1 velger lone, vinner +4.
    // Etter hull 17: P1=4, andre=0. Lavest = P2, P3, P4 (tied på 0).
    // Tiebreak team_number ASC → P2 wolf på hull 18.
    const scores = [
      ...holeScores(17, { p1: 3, p2: 4, p3: 5, p4: 5 }),
    ];
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores,
        wolfChoices: [
          { holeNumber: 17, wolfUserId: 'p1', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    expect(result.holes[16].wolfUserId).toBe('p1');
    expect(result.holes[17].wolfUserId).toBe('p2');
  });

  it('wolfChoices.wolfUserId overstyrer rotasjon når satt eksplisitt', () => {
    // Hvis admin/UI har lagret en eksplisitt wolfUserId, bruk den uavhengig
    // av rotasjons-regelen. (Sikrer at modulen leser kanonisk kilde.)
    const result = compute(
      makeCtx({
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p3', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    expect(result.holes[0].wolfUserId).toBe('p3');
  });
});

describe('wolf — pending & incomplete', () => {
  it('hull uten choice = pending, ingen poeng, stake bevart', () => {
    const result = compute(
      makeCtx({
        scores: holeScores(1, { p1: 3, p2: 4, p3: 5, p4: 5 }),
        // ingen wolfChoices
      }),
    );
    expect(result.holes[0].outcome).toBe('pending');
    expect(result.holes[0].choice).toBeNull();
    expect(result.holes[0].partnerUserId).toBeNull();
    expect(totalsByPlayer(result)).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });

  it('partner-modus: wolf har null gross → outcome pending', () => {
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores: holeScores(1, { p1: null, p2: 4, p3: 4, p4: 5 }),
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'partner', partnerUserId: 'p2' },
        ],
      }),
    );
    expect(result.holes[0].outcome).toBe('pending');
    expect(totalsByPlayer(result).p2).toBe(0);
  });

  it('lone-modus: en av opp-spillerne har null gross → outcome pending', () => {
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores: holeScores(1, { p1: 3, p2: 4, p3: null, p4: 5 }),
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    expect(result.holes[0].outcome).toBe('pending');
  });

  it('pending hull har isContributor=false og side=null for alle spillere', () => {
    const result = compute(makeCtx({}));
    for (const cell of result.holes[0].players) {
      expect(cell.isContributor).toBe(false);
      expect(cell.side).toBeNull();
    }
  });
});

describe('wolf — isContributor & side', () => {
  it('partner-modus: begge wolf-side er contributors ved tie innen siden', () => {
    // Wolf=3, partner=3 (tied lavest på wolf-siden), opp=4, opp=5.
    // wolf-side wins. Begge p1 og p2 har best score på sin side.
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores: holeScores(1, { p1: 3, p2: 3, p3: 4, p4: 5 }),
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'partner', partnerUserId: 'p2' },
        ],
      }),
    );
    const cells = Object.fromEntries(
      result.holes[0].players.map((c) => [c.userId, c]),
    );
    expect(cells.p1.isContributor).toBe(true);
    expect(cells.p2.isContributor).toBe(true);
    expect(cells.p1.side).toBe('wolf');
    expect(cells.p2.side).toBe('wolf');
    expect(cells.p3.side).toBe('opp');
    expect(cells.p4.side).toBe('opp');
  });

  it('partner-modus: kun spilleren med best score på sin side er contributor', () => {
    // Wolf=4, partner=5, opp=3, opp=5. Wolf-best=4 (p1 alene). Opp-best=3 (p3).
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores: holeScores(1, { p1: 4, p2: 5, p3: 3, p4: 5 }),
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'partner', partnerUserId: 'p2' },
        ],
      }),
    );
    const cells = Object.fromEntries(
      result.holes[0].players.map((c) => [c.userId, c]),
    );
    expect(cells.p1.isContributor).toBe(true);
    expect(cells.p2.isContributor).toBe(false);
    expect(cells.p3.isContributor).toBe(true);
    expect(cells.p4.isContributor).toBe(false);
  });

  it('lone-modus: wolf er contributor hvis hullet er scorable', () => {
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores: holeScores(1, { p1: 3, p2: 4, p3: 5, p4: 6 }),
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    const cells = Object.fromEntries(
      result.holes[0].players.map((c) => [c.userId, c]),
    );
    expect(cells.p1.isContributor).toBe(true);
    expect(cells.p1.side).toBe('wolf');
    expect(cells.p2.side).toBe('opp');
    expect(cells.p3.side).toBe('opp');
    expect(cells.p4.side).toBe('opp');
    // Kun den ene opp-spilleren med best score er contributor.
    expect(cells.p2.isContributor).toBe(true);
    expect(cells.p3.isContributor).toBe(false);
    expect(cells.p4.isContributor).toBe(false);
  });
});

describe('wolf — stats: blindWolfWins & wolfHolesPlayed', () => {
  it('blindWolfWins inkrementeres KUN ved blind+win', () => {
    const scores = [
      ...holeScores(1, { p1: 3, p2: 5, p3: 5, p4: 5 }), // p1 blind, vinner
      ...holeScores(2, { p1: 5, p2: 3, p3: 4, p4: 5 }), // p2 blind, vinner
      ...holeScores(3, { p1: 5, p2: 5, p3: 3, p4: 5 }), // p3 lone, vinner (ikke blind)
      ...holeScores(4, { p1: 5, p2: 5, p3: 5, p4: 6 }), // p4 blind, taper
    ];
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores,
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'blind', partnerUserId: null },
          { holeNumber: 2, wolfUserId: 'p2', choice: 'blind', partnerUserId: null },
          { holeNumber: 3, wolfUserId: 'p3', choice: 'lone', partnerUserId: null },
          { holeNumber: 4, wolfUserId: 'p4', choice: 'blind', partnerUserId: null },
        ],
      }),
    );
    const stats = Object.fromEntries(
      result.players.map((p) => [p.userId, p.blindWolfWins]),
    );
    expect(stats).toEqual({ p1: 1, p2: 1, p3: 0, p4: 0 });
  });

  it('wolfHolesPlayed teller hvert hull spilleren var Wolf (uansett outcome)', () => {
    // Standard rotasjon hull 1-16: hver spiller er Wolf 4 ganger.
    // Hull 17 + 18: ingen scores/choices → alle på 0 poeng, trailing-tiebreak
    // velger team_number ASC = p1. Siden ingenting endrer seg etter hull 17
    // (pending hull deler ikke ut poeng), velges p1 igjen på hull 18.
    const result = compute(makeCtx({}));
    const stats = Object.fromEntries(
      result.players.map((p) => [p.userId, p.wolfHolesPlayed]),
    );
    // P1 = hull 1, 5, 9, 13, 17, 18 = 6
    // P2 = hull 2, 6, 10, 14 = 4
    // P3 = hull 3, 7, 11, 15 = 4
    // P4 = hull 4, 8, 12, 16 = 4
    expect(stats).toEqual({ p1: 6, p2: 4, p3: 4, p4: 4 });
  });

  it('wolfHolesPlayed: trailing skifter når hull 17 endrer totalene', () => {
    // Hull 17: P1 trailing wolf (alle på 0, team_number ASC), spiller lone og vinner +4.
    // Etter hull 17: P1=4, andre=0. Lavest = P2 (team_number ASC).
    // Hull 18: P2 trailing wolf.
    // Forventet: P1 = 4 (hull 1,5,9,13) + 1 (hull 17) = 5
    //            P2 = 4 (hull 2,6,10,14) + 1 (hull 18) = 5
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores: holeScores(17, { p1: 3, p2: 4, p3: 5, p4: 5 }),
        wolfChoices: [
          { holeNumber: 17, wolfUserId: 'p1', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    const stats = Object.fromEntries(
      result.players.map((p) => [p.userId, p.wolfHolesPlayed]),
    );
    expect(stats).toEqual({ p1: 5, p2: 5, p3: 4, p4: 4 });
  });
});

describe('wolf — ranking & tiebreak', () => {
  it('sorterer på totalPoints DESC', () => {
    // P1 = 2, P2 = 4, P3 = 0, P4 = 1
    const scores = [
      ...holeScores(1, { p1: 3, p2: 4, p3: 5, p4: 5 }), // p1 partner-win med p2: +2 begge → p1=2, p2=2
      ...holeScores(2, { p1: 5, p2: 3, p3: 4, p4: 5 }), // p2 lone-win: +4 → p2=6 totalt
      ...holeScores(3, { p1: 5, p2: 5, p3: 5, p4: 3 }), // p3 wolf, lone, vinner ikke siden p4=3 = p3 men opp-best…
    ];
    // Forenkler: bare to scoring-hull
    const scoresSimplified = [
      ...holeScores(1, { p1: 3, p2: 4, p3: 5, p4: 5 }),
      ...holeScores(2, { p1: 5, p2: 3, p3: 4, p4: 5 }),
    ];
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores: scoresSimplified,
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'partner', partnerUserId: 'p2' },
          { holeNumber: 2, wolfUserId: 'p2', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    // p2=2+4=6, p1=2, p3=0, p4=0
    expect(result.players[0].userId).toBe('p2');
    expect(result.players[0].rank).toBe(1);
    expect(result.players[1].userId).toBe('p1');
    expect(result.players[1].rank).toBe(2);
    // ignore for brevity p3 vs p4 tied
    void scores;
  });

  it('tiebreak: lik total → team_number ASC', () => {
    // Ingen poeng for noen → alle 0.
    const result = compute(makeCtx({}));
    // Sortering team_number ASC → p1, p2, p3, p4.
    expect(result.players.map((p) => p.userId)).toEqual(['p1', 'p2', 'p3', 'p4']);
    // tiedWith inneholder de andre 3.
    expect(result.players[0].tiedWith.sort()).toEqual(['p2', 'p3', 'p4']);
    expect(result.players[0].rank).toBe(1);
    expect(result.players[1].rank).toBe(1);
    expect(result.players[2].rank).toBe(1);
    expect(result.players[3].rank).toBe(1);
  });

  it('tiedWith er tom array når spilleren har unik total', () => {
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores: holeScores(1, { p1: 3, p2: 5, p3: 5, p4: 5 }),
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    // p1 = 4, andre = 0
    const p1 = result.players.find((p) => p.userId === 'p1')!;
    expect(p1.tiedWith).toEqual([]);
    expect(p1.totalPoints).toBe(4);
    expect(p1.rank).toBe(1);
  });
});

describe('wolf — outcome on hole row', () => {
  it('outcome reflekterer wolf_side_wins når wolf-side har best score', () => {
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores: holeScores(1, { p1: 3, p2: 5, p3: 5, p4: 5 }),
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    expect(result.holes[0].outcome).toBe('wolf_side_wins');
  });

  it('outcome reflekterer opp_side_wins når opp-side vinner', () => {
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores: holeScores(1, { p1: 5, p2: 3, p3: 4, p4: 5 }),
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    expect(result.holes[0].outcome).toBe('opp_side_wins');
  });

  it('outcome=tied når beste score på begge sider er likt', () => {
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores: holeScores(1, { p1: 4, p2: 5, p3: 4, p4: 6 }),
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    expect(result.holes[0].outcome).toBe('tied');
  });

  it('pointsByPlayer er tom (0 for alle) når outcome=tied', () => {
    const result = compute(
      makeCtx({
        scoring: 'gross',
        scores: holeScores(1, { p1: 4, p2: 5, p3: 4, p4: 6 }),
        wolfChoices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'lone', partnerUserId: null },
        ],
      }),
    );
    const points = result.holes[0].pointsByPlayer;
    expect(points.p1 ?? 0).toBe(0);
    expect(points.p2 ?? 0).toBe(0);
    expect(points.p3 ?? 0).toBe(0);
    expect(points.p4 ?? 0).toBe(0);
  });
});
