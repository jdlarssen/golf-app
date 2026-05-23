import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import { bestBallForHole } from '@/lib/scoring/modes/bestBallNetto';
import { rankTeams, type RankedTeam } from '@/lib/scoring/tiebreaker';

export type LeaderboardMode = 'netto' | 'brutto';

export type LbPlayer = {
  userId: string;
  name: string;
  nickname: string | null;
  teamNumber: number;
  courseHandicap: number;
};

export type LbHole = {
  holeNumber: number;
  par: number;
  strokeIndex: number;
};

export type LbScore = {
  userId: string;
  holeNumber: number;
  strokes: number | null;
};

export type PlayerHoleCell = {
  userId: string;
  gross: number | null;
  extraStrokes: number;
  net: number | null;
  isContributor: boolean;
};

export type TeamHoleRow = {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  teamNet: number | null;
  contributorIds: string[];
  players: PlayerHoleCell[];
};

export type TeamLine = {
  teamNumber: number;
  players: LbPlayer[];
  holes: TeamHoleRow[];
  total: number;
  missingHoles: number[];
  rank: number;
  tiedWith: number[];
};

/**
 * Compute the full leaderboard view for one mode. We do every hole for every
 * team so callers can render either the summary card or the hole-by-hole
 * drill-down without recomputing anything.
 *
 * In brutto mode, every player's extraStrokes is forced to 0 so the lowest
 * gross-best-ball wins.
 *
 * Ranking uses the actual played total. Teams with missing holes are still
 * ranked, but flagged via `missingHoles` so the UI can warn.
 */
export function computeLeaderboard(opts: {
  mode: LeaderboardMode;
  players: LbPlayer[];
  holes: LbHole[];
  scores: LbScore[];
}): TeamLine[] {
  const { mode, players, holes, scores } = opts;

  // Index gross strokes by (userId, holeNumber).
  const grossKey = (userId: string, holeNumber: number) =>
    `${userId}#${holeNumber}`;
  const grossByKey = new Map<string, number | null>();
  for (const s of scores) {
    grossByKey.set(grossKey(s.userId, s.holeNumber), s.strokes);
  }

  // Index holes for fast lookup.
  const holesSorted = [...holes].sort((a, b) => a.holeNumber - b.holeNumber);

  // Group players by team number.
  const teamNumbers = Array.from(
    new Set(players.map((p) => p.teamNumber)),
  ).sort((a, b) => a - b);

  const lines: Omit<TeamLine, 'rank' | 'tiedWith'>[] = teamNumbers.map(
    (teamNumber) => {
      const teamPlayers = players.filter((p) => p.teamNumber === teamNumber);

      const teamHoles: TeamHoleRow[] = holesSorted.map((hole) => {
        const playerCells: PlayerHoleCell[] = teamPlayers.map((p) => {
          const gross = grossByKey.get(grossKey(p.userId, hole.holeNumber));
          const grossVal = gross == null ? null : gross;
          const extraStrokes =
            mode === 'netto'
              ? strokesForHole(p.courseHandicap, hole.strokeIndex)
              : 0;
          const net = grossVal === null ? null : grossVal - extraStrokes;
          return {
            userId: p.userId,
            gross: grossVal,
            extraStrokes,
            net,
            isContributor: false,
          };
        });

        const bb = bestBallForHole(
          playerCells.map((pc) => ({
            userId: pc.userId,
            gross: pc.gross,
            extraStrokes: pc.extraStrokes,
          })),
        );

        // Flag contributors.
        for (const pc of playerCells) {
          pc.isContributor = bb.contributors.includes(pc.userId);
        }

        return {
          holeNumber: hole.holeNumber,
          par: hole.par,
          strokeIndex: hole.strokeIndex,
          teamNet: bb.teamNet,
          contributorIds: bb.contributors,
          players: playerCells,
        };
      });

      const missingHoles = teamHoles
        .filter((h) => h.teamNet === null)
        .map((h) => h.holeNumber);
      const total = teamHoles.reduce(
        (sum, h) => sum + (h.teamNet ?? 0),
        0,
      );

      return {
        teamNumber,
        players: teamPlayers,
        holes: teamHoles,
        total,
        missingHoles,
      };
    },
  );

  // For ranking: build an 18-length array per team. Missing holes get the
  // team's average so partial totals are compared fairly without crushing
  // the team's rank. Per spec, don't algorithmically penalize.
  const teamsForRanking = lines.map((l) => {
    const arr: number[] = [];
    for (let i = 0; i < 18; i++) {
      const h = l.holes[i];
      arr.push(h?.teamNet ?? 0);
    }
    return { id: l.teamNumber, holes: arr };
  });

  const ranked: RankedTeam[] = rankTeams(teamsForRanking);
  const rankById = new Map(ranked.map((r) => [r.id, r]));

  return lines.map((l) => {
    const r = rankById.get(l.teamNumber);
    return {
      ...l,
      rank: r?.rank ?? 0,
      tiedWith: r?.tiedWith ?? [],
    };
  });
}

export function playerDisplayName(p: {
  name: string;
  nickname: string | null;
}): string {
  return p.nickname ? `${p.name} «${p.nickname}»` : p.name;
}

export function teamMembersLabel(players: LbPlayer[]): string {
  const names = players.map((p) =>
    p.nickname && p.nickname.length > 0 ? p.nickname : p.name.split(' ')[0],
  );
  return names.join(' & ');
}

export function positionBadge(rank: number): string {
  if (rank === 1) return '🥇 1.';
  if (rank === 2) return '🥈 2.';
  if (rank === 3) return '🥉 3.';
  return `${rank}.`;
}

export function parseMode(value: unknown): LeaderboardMode {
  const v = Array.isArray(value) ? value[0] : value;
  return v === 'brutto' ? 'brutto' : 'netto';
}
