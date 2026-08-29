import { describe, it, expect } from 'vitest';
import {
  computeCupMatchDisplayResult,
  type CupMatchDisplayResultInput,
} from './cupMatchDisplayResult';

// Type-A unit-test for det VISTE kamp-resultatet, trukket ut av getCupSnapshot
// (#1522). Tre ting låses: at best_ball går til lagtotal-kåringen og alt annet
// til matchplay-dispatchen, og at reveal-gatingen (#1441 D12) skjuler et
// avgjort resultat helt til kampen er avsluttet.
//
// Den dype scoring-korrektheten bor i computeCupMatchResult.test.ts /
// computeCupBestBallAward.test.ts — her tester vi wiringen.

const N = 18;

function par4Holes(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
  }));
}

/** Side 1 (a1/a2) scorer 4 på alt, side 2 (b1/b2) scorer 5 → side 1 vinner. */
function side1WinsScores(holes: number) {
  return Array.from({ length: holes }, (_, i) => i + 1).flatMap((hole) => [
    { userId: 'a1', holeNumber: hole, gross: 4 },
    { userId: 'a2', holeNumber: hole, gross: 4 },
    { userId: 'b1', holeNumber: hole, gross: 5 },
    { userId: 'b2', holeNumber: hole, gross: 5 },
  ]);
}

function input(overrides: Partial<CupMatchDisplayResultInput> = {}): CupMatchDisplayResultInput {
  return {
    gameId: 'g1',
    gameMode: 'fourball_matchplay',
    status: 'finished',
    scoreVisibility: 'live',
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
    scores: side1WinsScores(N),
    ...overrides,
  };
}

describe('computeCupMatchDisplayResult — dispatch', () => {
  it('best_ball scores på netto LAGTOTAL, ikke hull-for-hull (#1441 D4/D11)', () => {
    const result = computeCupMatchDisplayResult(input({ gameMode: 'best_ball' }));
    // Lagtotal-formatet er «{side1}–{side2}», ikke en matchplay-margin («3&2»).
    expect(result).toEqual({ winnerSide: 1, formatted: `${4 * N}–${5 * N}` });
  });

  it('matchplay-familien går til den tabell-drevne dispatchen (#331)', () => {
    const result = computeCupMatchDisplayResult(input({ gameMode: 'fourball_matchplay' }));
    expect(result?.winnerSide).toBe(1);
    // Matchplay-marginen er aldri lagtotal-formen.
    expect(result?.formatted).not.toContain('–');
  });

  it('ukjent modus gir null (ingen poeng tildeles)', () => {
    expect(computeCupMatchDisplayResult(input({ gameMode: 'stableford' }))).toBeNull();
  });

  it('best_ball med feil side-størrelse gir null', () => {
    const result = computeCupMatchDisplayResult(
      input({ gameMode: 'best_ball', side1: [{ userId: 'a1', courseHandicap: 0 }] }),
    );
    expect(result).toBeNull();
  });
});

describe('computeCupMatchDisplayResult — reveal-gating (#1441 D12)', () => {
  it.each<[string, string, string, boolean]>([
    ['blind kamp som pågår er skjult', 'reveal', 'active', false],
    ['blind kamp i draft er skjult', 'reveal', 'draft', false],
    ['blind kamp som er avsluttet vises', 'reveal', 'finished', true],
    ['live kamp som pågår vises', 'live', 'active', true],
    ['live kamp som er avsluttet vises', 'live', 'finished', true],
  ])('%s', (_desc, scoreVisibility, status, expectResult) => {
    const result = computeCupMatchDisplayResult(input({ scoreVisibility, status }));
    if (expectResult) expect(result?.winnerSide).toBe(1);
    else expect(result).toBeNull();
  });

  it('gaten gjelder best_ball på samme måte', () => {
    const hidden = computeCupMatchDisplayResult(
      input({ gameMode: 'best_ball', scoreVisibility: 'reveal', status: 'active' }),
    );
    expect(hidden).toBeNull();
  });
});
