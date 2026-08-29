import { describe, it, expect } from 'vitest';
import { computeCupMatchResult, type CupMatchScoringInput } from './computeCupMatchResult';

// Type-A unit-test for cup-match-scoring-dispatcheren. Dekker alle seks
// matchplay-modi, med greensome som regresjons-case for #331 (greensome ble
// aldri scoret i getCupSnapshot → 0 poeng uansett vinner). Den dype
// scoring-korrektheten per modus er allerede dekket i hver modes egen
// *.test.ts; her låser vi *wiringen*: at riktig compute-fn dispatches, at
// winnerSide mappes riktig, og at allowance-default per modus plukkes opp.
//
// Matchplay-resultatet er `null` mens matchen er live; det materialiserer seg
// først ved mat-em (|holesUp| > holesRemaining, der holesRemaining = 18 −
// holesPlayed) eller etter 18 spilte hull. Derfor spiller fixturene 18 hull.

const N = 18;

function par4Holes(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
  }));
}

/** Scores for to captains (alternate-shot-familien: lex-min userId eier ballen). */
function captainScores(side1Gross: number, side2Gross: number, holes: number) {
  return Array.from({ length: holes }, (_, i) => i + 1).flatMap((hole) => [
    { userId: 'a1', holeNumber: hole, gross: side1Gross },
    { userId: 'b1', holeNumber: hole, gross: side2Gross },
  ]);
}

// Felles 2v2-input der side 1 vinner hvert hull (captain = lex-min userId;
// a1 < a2, b1 < b2). 18 hull → mat-em, result ikke-null.
function alternateShotSide1Wins(gameMode: string): CupMatchScoringInput {
  return {
    gameMode,
    modeConfig: null,
    side1: [
      { userId: 'a1', courseHandicap: 0 },
      { userId: 'a2', courseHandicap: 0 },
    ],
    side2: [
      { userId: 'b1', courseHandicap: 0 },
      { userId: 'b2', courseHandicap: 0 },
    ],
    holes: par4Holes(N),
    scores: captainScores(4, 5, N),
  };
}

describe('computeCupMatchResult — dispatch over alle seks matchplay-modi', () => {
  it('greensome: ferdigspilt match med klar vinner gir ikke-null result + winnerSide 1 (#331)', () => {
    const result = computeCupMatchResult(alternateShotSide1Wins('greensome_matchplay'));
    expect(result).not.toBeNull();
    expect(result?.winnerSide).toBe(1);
  });

  it.each([
    'singles_matchplay',
    'fourball_matchplay',
    'foursomes_matchplay',
    'greensome_matchplay',
    'chapman_matchplay',
    'gruesome_matchplay',
  ])('%s: side 1 vinner → winnerSide 1, result ikke-null', (gameMode) => {
    let input: CupMatchScoringInput;
    if (gameMode === 'singles_matchplay') {
      input = {
        gameMode,
        modeConfig: null,
        side1: [{ userId: 'a1', courseHandicap: 0 }],
        side2: [{ userId: 'b1', courseHandicap: 0 }],
        holes: par4Holes(N),
        scores: captainScores(4, 5, N),
      };
    } else if (gameMode === 'fourball_matchplay') {
      input = {
        gameMode,
        modeConfig: null,
        side1: [
          { userId: 'a1', courseHandicap: 0 },
          { userId: 'a2', courseHandicap: 0 },
        ],
        side2: [
          { userId: 'b1', courseHandicap: 0 },
          { userId: 'b2', courseHandicap: 0 },
        ],
        holes: par4Holes(N),
        // Best-ball per side: side1 beste = 4, side2 beste = 5 → side1 vinner hvert hull.
        scores: Array.from({ length: N }, (_, i) => i + 1).flatMap((hole) => [
          { userId: 'a1', holeNumber: hole, gross: 4 },
          { userId: 'a2', holeNumber: hole, gross: 7 },
          { userId: 'b1', holeNumber: hole, gross: 5 },
          { userId: 'b2', holeNumber: hole, gross: 8 },
        ]),
      };
    } else {
      input = alternateShotSide1Wins(gameMode);
    }
    const result = computeCupMatchResult(input);
    expect(result).not.toBeNull();
    expect(result?.winnerSide).toBe(1);
  });

  it('greensome: 18 hull all square gir winnerSide "tied"', () => {
    const input = alternateShotSide1Wins('greensome_matchplay');
    input.scores = captainScores(4, 4, N);
    const result = computeCupMatchResult(input);
    expect(result).not.toBeNull();
    expect(result?.winnerSide).toBe('tied');
  });

  it('greensome: ingen scores (ufullført) → result null', () => {
    const input = alternateShotSide1Wins('greensome_matchplay');
    input.scores = [];
    expect(computeCupMatchResult(input)).toBeNull();
  });

  it('ukjent / ikke-matchplay game_mode → null (defensivt)', () => {
    const input = alternateShotSide1Wins('greensome_matchplay');
    input.gameMode = 'stableford';
    expect(computeCupMatchResult(input)).toBeNull();
  });

  it('feil antall spillere per side → null (defensivt)', () => {
    const input = alternateShotSide1Wins('greensome_matchplay');
    input.side1 = [{ userId: 'a1', courseHandicap: 0 }]; // greensome krever 2 per side
    expect(computeCupMatchResult(input)).toBeNull();
  });

  it('greensome allowance-default er 100 (ikke 0) når modeConfig mangler', () => {
    // side1 teamCH 18 (18/18 → 60/40 = 18), side2 0. Med 100% får side1 slag på
    // alle 18 SI-hull → vinner hvert hull på netto. Med 0% blir alle hull AS.
    const highVsScratch = (allowancePct: number | null): CupMatchScoringInput => ({
      gameMode: 'greensome_matchplay',
      modeConfig: allowancePct === null ? null : { allowance_pct: allowancePct },
      side1: [
        { userId: 'a1', courseHandicap: 18 },
        { userId: 'a2', courseHandicap: 18 },
      ],
      side2: [
        { userId: 'b1', courseHandicap: 0 },
        { userId: 'b2', courseHandicap: 0 },
      ],
      holes: par4Holes(N),
      scores: captainScores(5, 5, N),
    });
    // Default (modeConfig null) skal oppføre seg som eksplisitt 100, ikke 0.
    expect(computeCupMatchResult(highVsScratch(null))?.winnerSide).toBe(1);
    expect(computeCupMatchResult(highVsScratch(100))?.winnerSide).toBe(1);
    expect(computeCupMatchResult(highVsScratch(0))?.winnerSide).toBe('tied');
  });

  // #1441 (D10, F3b): greensomes manuelle lag-slag må forwardes til compute()
  // (greensomeMatchplay.ts leser feltet fra ctx.game.mode_config selv) — uten
  // forwarding ville splittet-cup-dagens arrangør-tastede lag-slag stille bli
  // ignorert til fordel for 60/40-formelen.
  describe('team_strokes_override (D10) forwarding', () => {
    it('greensome: team_strokes_override overstyrer 60/40-formelen', () => {
      // side1 course_handicap 0 (60/40 → 0 lag-CH uten override → ingen slag).
      // Med override team1: 10 får side1 slag på topp-10-SI-hullene — nok til
      // å snu et ellers jevnt (AS) 18-hulls oppgjør til side1-seier.
      const input: CupMatchScoringInput = {
        gameMode: 'greensome_matchplay',
        modeConfig: { team_strokes_override: { team1: 10, team2: 0 } },
        side1: [
          { userId: 'a1', courseHandicap: 0 },
          { userId: 'a2', courseHandicap: 0 },
        ],
        side2: [
          { userId: 'b1', courseHandicap: 0 },
          { userId: 'b2', courseHandicap: 0 },
        ],
        holes: par4Holes(N),
        scores: captainScores(4, 4, N),
      };
      expect(computeCupMatchResult(input)?.winnerSide).toBe(1);
    });

    it('greensome uten team_strokes_override: 0-CH begge sider forblir uavgjort (regresjonskontroll)', () => {
      const input: CupMatchScoringInput = {
        gameMode: 'greensome_matchplay',
        modeConfig: null,
        side1: [
          { userId: 'a1', courseHandicap: 0 },
          { userId: 'a2', courseHandicap: 0 },
        ],
        side2: [
          { userId: 'b1', courseHandicap: 0 },
          { userId: 'b2', courseHandicap: 0 },
        ],
        holes: par4Holes(N),
        scores: captainScores(4, 4, N),
      };
      expect(computeCupMatchResult(input)?.winnerSide).toBe('tied');
    });

    it('ikke-greensome modus: team_strokes_override ignoreres (feltet betyr ingenting utenfor greensome)', () => {
      const input: CupMatchScoringInput = {
        gameMode: 'foursomes_matchplay',
        modeConfig: { team_strokes_override: { team1: 10, team2: 0 } },
        side1: [
          { userId: 'a1', courseHandicap: 0 },
          { userId: 'a2', courseHandicap: 0 },
        ],
        side2: [
          { userId: 'b1', courseHandicap: 0 },
          { userId: 'b2', courseHandicap: 0 },
        ],
        holes: par4Holes(N),
        scores: captainScores(4, 4, N),
      };
      // Foursomes bruker sum-CH (0+0=0) uansett — override-feltet skal ikke
      // smitte over fra greensome-caset og gi side1 slag den ikke skal ha.
      expect(computeCupMatchResult(input)?.winnerSide).toBe('tied');
    });
  });
});

// #1777: `gameMode` er fri tekst fra DB (`games.game_mode`). Med rått
// objekt-oppslag i dispatch-tabellen ville en prototype-nøkkel gitt en funksjon
// fra `Object.prototype` — truthy nok til å passere `if (!cfg)`-guarden, for så
// å krasje på `cfg.sideSize`. Map-oppslaget ser kun egne nøkler.
describe('computeCupMatchResult — prototype-nøkler er ikke moduser (#1777)', () => {
  it.each(['toString', 'constructor', 'valueOf', 'not_a_mode'])(
    '%s → null uten å kaste',
    (gameMode) => {
      expect(computeCupMatchResult(alternateShotSide1Wins(gameMode))).toBeNull();
    },
  );
});
