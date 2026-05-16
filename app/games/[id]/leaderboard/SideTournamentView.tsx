import type { SideTournamentResult } from '@/lib/scoring/sideTournament';
import { formatHolesList } from '@/lib/leaderboard/formatHolesList';

export type SideTournamentTeam = {
  teamId: number;
  /** Display label, e.g. "Lag 1" */
  label: string;
  members: Array<{
    userId: string;
    /** Full reveal-name (e.g. 'Karl "Knølkis" Jensen') — kept for future surfaces. */
    displayName: string;
    /** First-name-only form used in the compact tab UI. */
    firstName: string;
  }>;
};

type Props = {
  teams: SideTournamentTeam[];
  result: SideTournamentResult;
  ldCount: number;
  ctpCount: number;
  sideWinners: Array<{
    category: 'longest_drive' | 'closest_to_pin';
    position: number;
    winnerUserId: string | null;
  }>;
};

/**
 * Sideturnering — presentational view for the "Sideturnering" tab on the
 * leaderboard. Visible only when game.status === 'finished' AND
 * side_tournament_enabled.
 *
 * Layout: a vertical list of `<details>` elements, one per team, sorted by
 * total side-tournament points descending (dense ranking, ties share rank).
 *
 * Each row's summary shows: medal + "Lag N" + members (first names, joined
 * with " · ") + total points. Click to expand and see that team's awards
 * grouped by category.
 *
 * No realtime, no client state — `result` is precomputed by the server page.
 */
export function SideTournamentView({
  teams,
  result,
  ldCount,
  ctpCount,
  sideWinners,
}: Props) {
  const sorted = rankByPoints(result.teamStandings);
  const teamById = new Map(teams.map((t) => [t.teamId, t]));

  return (
    <div className="space-y-3 px-4">
      {sorted.map((standing) => {
        const team = teamById.get(standing.teamId);
        const label = team?.label ?? `Lag ${standing.teamId}`;
        const memberNames =
          team?.members.map((m) => m.firstName).join(' · ') ?? '';
        const medal =
          standing.rank === 1
            ? '🥇'
            : standing.rank === 2
              ? '🥈'
              : standing.rank === 3
                ? '🥉'
                : '';

        return (
          <details
            key={standing.teamId}
            className="group rounded-md border border-border bg-surface-2"
          >
            <summary className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
              <div className="min-w-0 flex-1">
                <div className="font-serif text-base text-text">
                  <span className="mr-2 text-lg">{medal || '·'}</span>
                  {label}
                </div>
                {memberNames && (
                  <div className="mt-0.5 truncate font-sans text-xs text-muted">
                    {memberNames}
                  </div>
                )}
              </div>
              <span className="font-serif text-base text-text tabular-nums">
                {standing.totalPoints}p
              </span>
              <span
                aria-hidden
                className="text-muted transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </summary>
            <div className="border-t border-border px-3 py-3 text-sm">
              <TeamAwards
                teamId={standing.teamId}
                standings={sorted}
                ldCount={ldCount}
                ctpCount={ctpCount}
                sideWinners={sideWinners}
                teamById={teamById}
              />
            </div>
          </details>
        );
      })}
    </div>
  );
}

// --- internal helpers ---

/**
 * Dense-rank teams by `totalPoints` descending. Ties share a rank — two teams
 * tied at top both receive rank 1 (and both get the gold medal); next team
 * gets rank 2. Avoids the index-based bug where a tie at top silently demotes
 * one team to silver.
 */
function rankByPoints<T extends { totalPoints: number }>(
  items: T[],
): Array<T & { rank: number }> {
  const sorted = [...items].sort((a, b) => b.totalPoints - a.totalPoints);
  let lastTotal: number | null = null;
  let rank = 0;
  return sorted.map((t) => {
    if (t.totalPoints !== lastTotal) {
      rank += 1;
      lastTotal = t.totalPoints;
    }
    return { ...t, rank };
  });
}

type RankedStanding = SideTournamentResult['teamStandings'][number] & {
  rank: number;
};

/**
 * Renders one team's awards grouped by category.
 *
 * Each category produces zero or one row depending on whether the team has
 * an award in that category. Hole-wins are aggregated into a single row with
 * a count, total points, and a formatted hole-range. LD/CTP slots are listed
 * per-position with the winner's first name in parens.
 *
 * Tie info on netto categories: if more than one team has the same
 * best_netto_* award, append "(uavgjort med Lag X)" to the row.
 */
function TeamAwards({
  teamId,
  standings,
  ldCount,
  ctpCount,
  sideWinners,
  teamById,
}: {
  teamId: number;
  standings: RankedStanding[];
  ldCount: number;
  ctpCount: number;
  sideWinners: Props['sideWinners'];
  teamById: Map<number, SideTournamentTeam>;
}) {
  const myStanding = standings.find((s) => s.teamId === teamId);
  if (!myStanding) return null;

  const awards = myStanding.awards;
  const rows: Array<{ key: string; render: React.ReactNode }> = [];

  // Helper: which OTHER teams share an award in this category?
  const tieMates = (category: string): number[] => {
    return standings
      .filter(
        (s) =>
          s.teamId !== teamId &&
          s.awards.some((a) => a.category === category),
      )
      .map((s) => s.teamId);
  };

  const tieSuffix = (others: number[]): string => {
    if (others.length === 0) return '';
    const labels = others.map(
      (id) => teamById.get(id)?.label ?? `Lag ${id}`,
    );
    if (labels.length === 1) return ` (uavgjort med ${labels[0]})`;
    if (labels.length === 2)
      return ` (uavgjort med ${labels[0]} og ${labels[1]})`;
    return ` (uavgjort med ${labels.slice(0, -1).join(', ')} og ${labels[labels.length - 1]})`;
  };

  // 1. Best netto 18
  if (awards.some((a) => a.category === 'best_netto_18')) {
    rows.push({
      key: 'best_netto_18',
      render: (
        <>
          Best netto 18 hull: <Pts n={10} />
          {tieSuffix(tieMates('best_netto_18'))}
        </>
      ),
    });
  }
  // 2. Best netto front 9
  if (awards.some((a) => a.category === 'best_netto_front9')) {
    rows.push({
      key: 'best_netto_front9',
      render: (
        <>
          Best netto front 9: <Pts n={5} />
          {tieSuffix(tieMates('best_netto_front9'))}
        </>
      ),
    });
  }
  // 3. Best netto back 9
  if (awards.some((a) => a.category === 'best_netto_back9')) {
    rows.push({
      key: 'best_netto_back9',
      render: (
        <>
          Best netto back 9: <Pts n={5} />
          {tieSuffix(tieMates('best_netto_back9'))}
        </>
      ),
    });
  }
  // 4. Hole-wins (aggregated)
  const holeWinAwards = awards.filter((a) => a.category === 'hole_win');
  if (holeWinAwards.length > 0) {
    const holes = holeWinAwards
      .map((a) => a.holeNumber)
      .filter((h): h is number => typeof h === 'number');
    const totalPts = holeWinAwards.reduce((sum, a) => sum + a.points, 0);
    rows.push({
      key: 'hole_win',
      render: (
        <>
          Hole-wins: <Pts n={totalPts} /> på {holes.length} hull (
          {formatHolesList(holes)})
        </>
      ),
    });
  }
  // 5. Longest drive — per slot
  if (ldCount > 0) {
    for (let pos = 1; pos <= ldCount; pos++) {
      const w = sideWinners.find(
        (sw) => sw.category === 'longest_drive' && sw.position === pos,
      );
      if (!w) continue;
      const winnerTeamId = w.winnerUserId
        ? findTeamForUser(w.winnerUserId, teamById)
        : null;
      if (winnerTeamId !== teamId) continue;
      const winnerName = firstNameOf(w.winnerUserId, teamById) ?? '?';
      rows.push({
        key: `ld_${pos}`,
        render: (
          <>
            Longest drive #{pos} ({winnerName}): <Pts n={2} />
          </>
        ),
      });
    }
  }
  // 6. Closest to pin — per slot
  if (ctpCount > 0) {
    for (let pos = 1; pos <= ctpCount; pos++) {
      const w = sideWinners.find(
        (sw) => sw.category === 'closest_to_pin' && sw.position === pos,
      );
      if (!w) continue;
      const winnerTeamId = w.winnerUserId
        ? findTeamForUser(w.winnerUserId, teamById)
        : null;
      if (winnerTeamId !== teamId) continue;
      const winnerName = firstNameOf(w.winnerUserId, teamById) ?? '?';
      rows.push({
        key: `ctp_${pos}`,
        render: (
          <>
            Closest to pin #{pos} ({winnerName}): <Pts n={2} />
          </>
        ),
      });
    }
  }

  if (rows.length === 0) {
    return <div className="text-muted">Ingen poeng denne runden.</div>;
  }

  return (
    <ul className="space-y-1 font-serif text-base text-text">
      {rows.map((r) => (
        <li key={r.key}>{r.render}</li>
      ))}
    </ul>
  );
}

function Pts({ n }: { n: number }) {
  return <span className="tabular-nums">{n}p</span>;
}

function findTeamForUser(
  userId: string,
  teamById: Map<number, SideTournamentTeam>,
): number | null {
  for (const [tid, team] of teamById) {
    if (team.members.some((m) => m.userId === userId)) return tid;
  }
  return null;
}

function firstNameOf(
  userId: string | null,
  teamById: Map<number, SideTournamentTeam>,
): string | null {
  if (!userId) return null;
  for (const team of teamById.values()) {
    const m = team.members.find((mm) => mm.userId === userId);
    if (m) return m.firstName;
  }
  return null;
}
