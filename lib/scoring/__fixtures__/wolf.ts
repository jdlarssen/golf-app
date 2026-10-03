import type { ScoringHole, ScoringHoleScore, ScoringPlayer } from '../modes/types';

// Delte Wolf-fiksturer (#2313). Motorens tester (`modes/wolf.test.ts`) og
// hull-sidens innsats-test (`holePageScoring.test.ts`) bygger scenarioene sine
// med de samme hjelperne, så et delt hull betyr det samme begge steder.
// Fire spillere med team_number 1–4, 18 hull par 4 og SI = hullnummer.

export function par4Holes(count: number): ScoringHole[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
  }));
}

export function fourPlayers(opts?: {
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

/**
 * Helper: bygg gross-scores for ett hull der vi spesifiserer hver spillers
 * gross. `null` = ikke spilt.
 */
export function holeScores(
  holeNumber: number,
  grosses: Record<string, number | null>,
): ScoringHoleScore[] {
  return Object.entries(grosses).map(([userId, gross]) => ({
    userId,
    holeNumber,
    gross,
  }));
}
