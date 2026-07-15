import { describe, it, expect } from 'vitest';
import { computeCupLeaderboard } from './computeCupLeaderboard';
import type { CupMatchInput, TournamentInput } from './computeCupLeaderboard';

function cup(overrides: Partial<TournamentInput> = {}): TournamentInput {
  return {
    team_1_name: 'Lag Skog',
    team_2_name: 'Lag Sjø',
    points_to_win: 4.5,
    status: 'active',
    winner_team: null,
    ...overrides,
  };
}

function match(overrides: Partial<CupMatchInput> = {}): CupMatchInput {
  return {
    gameId: 'g1',
    matchLabel: 'Singles 1',
    team1PlayerName: 'Per',
    team2PlayerName: 'Knut',
    status: 'finished',
    result: { winnerSide: 1, formatted: '3&2' },
    ...overrides,
  };
}

describe('computeCupLeaderboard', () => {
  it('gir 0-0 og winner=null for en cup uten matches', () => {
    const result = computeCupLeaderboard(cup({ status: 'draft' }), []);
    expect(result.team1Points).toBe(0);
    expect(result.team2Points).toBe(0);
    expect(result.winner).toBeNull();
    expect(result.matches).toEqual([]);
  });

  it('tildeler 1 point til vinnersiden ved finished match', () => {
    const matches: CupMatchInput[] = [
      match({ gameId: 'g1', result: { winnerSide: 1, formatted: '3&2' } }),
    ];
    const result = computeCupLeaderboard(cup(), matches);
    expect(result.team1Points).toBe(1);
    expect(result.team2Points).toBe(0);
    expect(result.matches[0].pointsTeam1).toBe(1);
    expect(result.matches[0].pointsTeam2).toBe(0);
  });

  it('tildeler 0,5 point til hvert lag ved halvert match (AS)', () => {
    const matches: CupMatchInput[] = [
      match({ gameId: 'g1', result: { winnerSide: 'tied', formatted: 'AS' } }),
    ];
    const result = computeCupLeaderboard(cup(), matches);
    expect(result.team1Points).toBe(0.5);
    expect(result.team2Points).toBe(0.5);
    expect(result.matches[0].pointsTeam1).toBe(0.5);
    expect(result.matches[0].pointsTeam2).toBe(0.5);
  });

  it('gir 0 point til begge når matchen ikke er ferdig (in-progress eller draft)', () => {
    const matches: CupMatchInput[] = [
      match({ gameId: 'g1', status: 'active', result: null }),
      match({ gameId: 'g2', status: 'draft', result: null }),
    ];
    const result = computeCupLeaderboard(cup(), matches);
    expect(result.team1Points).toBe(0);
    expect(result.team2Points).toBe(0);
    expect(result.matches[0].pointsTeam1).toBe(0);
    expect(result.matches[1].pointsTeam1).toBe(0);
  });

  it('aggregerer en blandet portefølje av matches korrekt', () => {
    const matches: CupMatchInput[] = [
      match({ gameId: 'g1', result: { winnerSide: 1, formatted: '3&2' } }),
      match({ gameId: 'g2', result: { winnerSide: 2, formatted: '2&1' } }),
      match({ gameId: 'g3', result: { winnerSide: 'tied', formatted: 'AS' } }),
      match({ gameId: 'g4', status: 'active', result: null }),
    ];
    const result = computeCupLeaderboard(cup(), matches);
    expect(result.team1Points).toBe(1.5);
    expect(result.team2Points).toBe(1.5);
    expect(result.winner).toBeNull();
  });

  it('deklarerer vinner når point-mål er nådd', () => {
    const matches: CupMatchInput[] = [
      match({ gameId: 'g1', result: { winnerSide: 1, formatted: '3&2' } }),
      match({ gameId: 'g2', result: { winnerSide: 1, formatted: '4&3' } }),
      match({ gameId: 'g3', result: { winnerSide: 1, formatted: '2up' } }),
      match({ gameId: 'g4', result: { winnerSide: 1, formatted: '1up' } }),
      match({ gameId: 'g5', result: { winnerSide: 'tied', formatted: 'AS' } }),
    ];
    const result = computeCupLeaderboard(cup({ points_to_win: 4.5 }), matches);
    expect(result.team1Points).toBe(4.5);
    expect(result.winner).toBe(1);
  });

  it('kårer ingen vinner når poengmålet ennå ikke er satt (#1142)', () => {
    // En draft-cup bærer points_to_win = NULL fram til startTournament utleder
    // målet fra det reelle match-antallet. Uten et mål kan ingen stilling —
    // heller ikke en klar ledelse — kåre en vinner.
    const matches: CupMatchInput[] = [
      match({ gameId: 'g1', result: { winnerSide: 1, formatted: '3&2' } }),
      match({ gameId: 'g2', result: { winnerSide: 1, formatted: '4&3' } }),
      match({ gameId: 'g3', result: { winnerSide: 1, formatted: '2up' } }),
    ];
    const result = computeCupLeaderboard(cup({ points_to_win: null }), matches);
    expect(result.team1Points).toBe(3);
    expect(result.winner).toBeNull();
    expect(result.pointsToWin).toBeNull();
  });

  it('respekterer eksplisitt winner_team fra cup-raden (finished cup)', () => {
    const matches: CupMatchInput[] = [
      match({ gameId: 'g1', result: { winnerSide: 1, formatted: '3&2' } }),
    ];
    const result = computeCupLeaderboard(
      cup({ status: 'finished', winner_team: 2, points_to_win: 4.5 }),
      matches,
    );
    expect(result.winner).toBe(2);
  });

  it('returnerer point-mål og lag-navn på resultatet', () => {
    const result = computeCupLeaderboard(
      cup({ team_1_name: 'Team A', team_2_name: 'Team B', points_to_win: 3 }),
      [],
    );
    expect(result.team1Name).toBe('Team A');
    expect(result.team2Name).toBe('Team B');
    expect(result.pointsToWin).toBe(3);
  });

  it('bevarer match-rekkefølgen fra input', () => {
    const matches: CupMatchInput[] = [
      match({ gameId: 'g1', matchLabel: 'Singles 1' }),
      match({ gameId: 'g2', matchLabel: 'Singles 2' }),
      match({ gameId: 'g3', matchLabel: 'Singles 3' }),
    ];
    const result = computeCupLeaderboard(cup(), matches);
    expect(result.matches.map((m) => m.gameId)).toEqual(['g1', 'g2', 'g3']);
    expect(result.matches.map((m) => m.matchLabel)).toEqual([
      'Singles 1',
      'Singles 2',
      'Singles 3',
    ]);
  });

  it('rapporterer remainingMatches (status !== finished) for cup-summary-bruk', () => {
    const matches: CupMatchInput[] = [
      match({ gameId: 'g1', status: 'finished', result: { winnerSide: 1, formatted: '3&2' } }),
      match({ gameId: 'g2', status: 'active', result: null }),
      match({ gameId: 'g3', status: 'draft', result: null }),
    ];
    const result = computeCupLeaderboard(cup(), matches);
    expect(result.finishedMatches).toBe(1);
    expect(result.remainingMatches).toBe(2);
  });

  it('håndterer flytende-komma-summering uten avrundingsfeil (0,5 + 0,5 + 0,5 = 1,5)', () => {
    const matches: CupMatchInput[] = [
      match({ gameId: 'g1', result: { winnerSide: 'tied', formatted: 'AS' } }),
      match({ gameId: 'g2', result: { winnerSide: 'tied', formatted: 'AS' } }),
      match({ gameId: 'g3', result: { winnerSide: 'tied', formatted: 'AS' } }),
    ];
    const result = computeCupLeaderboard(cup(), matches);
    expect(result.team1Points).toBe(1.5);
    expect(result.team2Points).toBe(1.5);
  });
});
