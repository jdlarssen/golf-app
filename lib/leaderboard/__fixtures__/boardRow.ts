import type { LiveBoardRow } from '@/lib/leaderboard/liveBoard';

/** A live board row for tests: nine holes played, no movement or recent holes yet. */
export function boardRow(userId: string, name: string, rank: number): LiveBoardRow {
  return {
    userId,
    name,
    nickname: null,
    rank,
    tied: false,
    total: 30 - rank,
    holesPlayed: 9,
    movement: null,
    recent: [],
    recentHoles: [],
  };
}
