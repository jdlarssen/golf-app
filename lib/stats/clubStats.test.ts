import { describe, it, expect } from 'vitest';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import {
  isWinningSummary,
  aggregateFinishedGame,
  tallyClubStats,
  type StatPlayerRow,
  type FinishedGameForTally,
} from './clubStats';

const placement = (rank: number, isTeam = false): ResultSummary => ({
  kind: 'placement',
  rank,
  fieldSize: 4,
  isTeam,
});
const matchplay = (outcome: 'win' | 'loss' | 'tie'): ResultSummary => ({
  kind: 'matchplay',
  outcome,
  margin: outcome === 'tie' ? null : '3&2',
});
const skins = (rank: number, n: number): ResultSummary => ({
  kind: 'skins',
  skins: n,
  rank,
  fieldSize: 4,
});

const row = (
  userId: string,
  resultSummary: ResultSummary | null,
  withdrawnAt: string | null = null,
): StatPlayerRow => ({ userId, name: userId, withdrawnAt, resultSummary });

describe('isWinningSummary', () => {
  it('placement: rank 1 wins, others do not', () => {
    expect(isWinningSummary(placement(1))).toBe(true);
    expect(isWinningSummary(placement(2))).toBe(false);
    expect(isWinningSummary(placement(1, true))).toBe(true); // team #1
  });

  it('matchplay: only a win counts (loss/tie do not)', () => {
    expect(isWinningSummary(matchplay('win'))).toBe(true);
    expect(isWinningSummary(matchplay('loss'))).toBe(false);
    expect(isWinningSummary(matchplay('tie'))).toBe(false);
  });

  it('skins: rank 1 (most skins) wins', () => {
    expect(isWinningSummary(skins(1, 5))).toBe(true);
    expect(isWinningSummary(skins(2, 3))).toBe(false);
  });

  it('null summary never wins', () => {
    expect(isWinningSummary(null)).toBe(false);
  });
});

describe('aggregateFinishedGame', () => {
  it('credits the stored per-mode winner, not a netto recompute', () => {
    // Stableford: winner is the highest points = stored rank 1, even though
    // a different player might have the lowest gross/netto.
    const agg = aggregateFinishedGame([
      row('alice', placement(1)),
      row('bob', placement(2)),
      row('carol', placement(3)),
    ]);
    expect(agg.winners).toEqual(['alice']);
    expect(agg.participants).toEqual(['alice', 'bob', 'carol']);
    expect(agg.needsFallback).toBe(false);
  });

  it('matchplay credits the side that won', () => {
    const agg = aggregateFinishedGame([
      row('alice', matchplay('win')),
      row('bob', matchplay('loss')),
    ]);
    expect(agg.winners).toEqual(['alice']);
  });

  it('excludes withdrawn players from participation and winners', () => {
    const agg = aggregateFinishedGame([
      row('alice', placement(2)),
      // Defensive: even a winning summary on a withdrawn row is excluded.
      row('ghost', placement(1), '2026-06-20T10:00:00Z'),
    ]);
    expect(agg.participants).toEqual(['alice']);
    expect(agg.winners).toEqual([]);
  });

  it('credits all tied #1 players (shared win)', () => {
    const agg = aggregateFinishedGame([
      row('alice', placement(1)),
      row('bob', placement(1)),
      row('carol', placement(3)),
    ]);
    expect(agg.winners).toEqual(['alice', 'bob']);
  });

  it('flags needsFallback when every player summary is null (pre-#572 game)', () => {
    const agg = aggregateFinishedGame([row('alice', null), row('bob', null)]);
    expect(agg.needsFallback).toBe(true);
    expect(agg.winners).toEqual([]);
    expect(agg.participants).toEqual(['alice', 'bob']);
  });

  it('does not flag fallback when at least one summary is present', () => {
    const agg = aggregateFinishedGame([
      row('alice', placement(1)),
      row('bob', null),
    ]);
    expect(agg.needsFallback).toBe(false);
  });

  it('does not flag fallback for a game with no active players', () => {
    const agg = aggregateFinishedGame([
      row('ghost', null, '2026-06-20T10:00:00Z'),
    ]);
    expect(agg.needsFallback).toBe(false);
    expect(agg.participants).toEqual([]);
  });
});

describe('tallyClubStats', () => {
  const games: FinishedGameForTally[] = [
    {
      id: 'g1',
      players: [row('alice', placement(1)), row('bob', placement(2))],
    },
    {
      id: 'g2',
      players: [row('alice', matchplay('loss')), row('bob', matchplay('win'))],
    },
  ];

  it('accumulates winner + participation counts across games', () => {
    const { winnerCounts, participationCounts } = tallyClubStats(games, new Map());
    expect(winnerCounts.get('alice')).toBe(1); // won g1
    expect(winnerCounts.get('bob')).toBe(1); // won g2
    expect(participationCounts.get('alice')).toBe(2);
    expect(participationCounts.get('bob')).toBe(2);
  });

  it('uses fallback winners for needsFallback games and ignores fallback otherwise', () => {
    const withNull: FinishedGameForTally[] = [
      { id: 'g1', players: [row('alice', placement(1)), row('bob', placement(2))] },
      { id: 'g3', players: [row('carol', null), row('dave', null)] }, // needs fallback
    ];
    const fallback = new Map<string, string[]>([
      ['g3', ['dave']], // engine says dave won
      ['g1', ['bob']], // should be IGNORED — g1 has stored summaries
    ]);
    const { winnerCounts } = tallyClubStats(withNull, fallback);
    expect(winnerCounts.get('alice')).toBe(1); // stored, not overridden by fallback
    expect(winnerCounts.get('bob')).toBeUndefined(); // fallback ignored for g1
    expect(winnerCounts.get('dave')).toBe(1); // from fallback
  });

  it('credits a needsFallback game with no fallback entry to nobody', () => {
    const onlyNull: FinishedGameForTally[] = [
      { id: 'gX', players: [row('carol', null)] },
    ];
    const { winnerCounts, participationCounts } = tallyClubStats(onlyNull, new Map());
    expect(winnerCounts.size).toBe(0);
    expect(participationCounts.get('carol')).toBe(1); // still participated
  });
});
