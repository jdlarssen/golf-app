import { describe, it, expect } from 'vitest';
import {
  toFinishedEntries,
  cupDayFinishedBadge,
} from './finishedEntries';
import type { FinishedGame, FinishedTournament } from './getFinishedGamesForUser';
import type { HoleSegment } from '@/lib/scoring';

/**
 * Type A coverage for the finished cup-day fold (#1449): the two host halves of
 * one split cup day merge into one cup entry; a lone finished host is suppressed
 * (its sibling is still active); plain games pass through. Badge maps persisted
 * cup truth to won/lost/delt without recomputing anything.
 */

function game(over: Partial<FinishedGame> & { id: string }): FinishedGame {
  return {
    name: 'Runde',
    ended_at: '2026-06-12T18:00:00Z',
    game_mode: 'best_ball',
    mode_config: { kind: 'best_ball', team_size: 2 } as FinishedGame['mode_config'],
    courses: { name: 'Byneset' },
    result_summary: null,
    tournament_id: null,
    hole_segment: 'full' as HoleSegment,
    team_number: null,
    tournament: null,
    ...over,
  };
}

const CUP: FinishedTournament = {
  name: 'Ryder-kompisene',
  status: 'finished',
  winner_team: 1,
  team_1_name: 'Blå',
  team_2_name: 'Rød',
};

describe('toFinishedEntries', () => {
  it('a plain game passes through as a game entry', () => {
    const entries = toFinishedEntries([game({ id: 'a' })]);
    expect(entries).toEqual([
      expect.objectContaining({ kind: 'game', ended_at: '2026-06-12T18:00:00Z' }),
    ]);
  });

  it('folds both host halves of a split cup day into one cupDay entry', () => {
    const entries = toFinishedEntries([
      game({ id: 'f', hole_segment: 'front9', tournament_id: 't1', team_number: 2, tournament: CUP }),
      game({ id: 'b', hole_segment: 'back9', tournament_id: 't1', team_number: 2, tournament: CUP }),
    ]);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.kind).toBe('cupDay');
    if (entry.kind === 'cupDay') {
      expect(entry.tournamentId).toBe('t1');
      expect(entry.cupName).toBe('Ryder-kompisene');
      expect(entry.teamNumber).toBe(2);
      expect(entry.front9.id).toBe('f');
      expect(entry.back9.id).toBe('b');
    }
  });

  it('suppresses a lone finished split-day host (sibling still active → shown in the active list)', () => {
    const entries = toFinishedEntries([
      game({ id: 'f', hole_segment: 'front9', tournament_id: 't1', tournament: CUP }),
    ]);
    expect(entries).toEqual([]);
  });

  it('a full-segment cup match (not split) stays a plain game entry', () => {
    const entries = toFinishedEntries([
      game({ id: 'm', hole_segment: 'full', tournament_id: 't1', tournament: CUP }),
    ]);
    expect(entries.map((e) => e.kind)).toEqual(['game']);
  });

  it('keeps plain games alongside a cup day, newest-first order preserved', () => {
    const entries = toFinishedEntries([
      game({ id: 'newer', ended_at: '2026-06-20T10:00:00Z' }),
      game({ id: 'f', hole_segment: 'front9', tournament_id: 't1', tournament: CUP }),
      game({ id: 'b', hole_segment: 'back9', tournament_id: 't1', tournament: CUP }),
    ]);
    expect(entries.map((e) => e.kind)).toEqual(['game', 'cupDay']);
  });
});

describe('cupDayFinishedBadge', () => {
  it('unfinished cup → no badge (neutral card)', () => {
    expect(
      cupDayFinishedBadge({ status: 'active', winnerTeam: null, teamNumber: 1 }),
    ).toBeNull();
  });

  it('finished, my team won → gold-accent won badge', () => {
    expect(
      cupDayFinishedBadge({ status: 'finished', winnerTeam: 2, teamNumber: 2 }),
    ).toEqual({ key: 'cup.won', isWin: true });
  });

  it('finished, my team lost → muted lost badge', () => {
    expect(
      cupDayFinishedBadge({ status: 'finished', winnerTeam: 1, teamNumber: 2 }),
    ).toEqual({ key: 'cup.lost', isWin: false });
  });

  it('finished, tied (no winner) → delt badge', () => {
    expect(
      cupDayFinishedBadge({ status: 'finished', winnerTeam: null, teamNumber: 1 }),
    ).toEqual({ key: 'cup.tied', isWin: false });
  });

  it('finished but my side unknown → neutral finished badge', () => {
    expect(
      cupDayFinishedBadge({ status: 'finished', winnerTeam: 1, teamNumber: null }),
    ).toEqual({ key: 'cup.finished', isWin: false });
  });
});
