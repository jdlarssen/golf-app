import type { SideTournamentResult } from '@/lib/scoring/sideTournament';

export type SideTournamentTeam = {
  teamId: number;
  /** Display label, e.g. "Lag 1" */
  label: string;
  members: Array<{ userId: string; displayName: string }>;
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
 * Sideturnering — presentational view rendered inside the "Sideturnering"
 * tab when the game is finished AND `side_tournament_enabled`.
 *
 * Renders:
 *   1. A points table sorted by total descending (medals for top 3)
 *   2. A collapsible `<details>` block with the per-category breakdown:
 *      best-netto winners, hole-win-grid (3×6), LD/CTP slot winners
 *
 * No realtime, no client state — `result` is already computed by the server
 * page from `calculateSideTournament`.
 */
export function SideTournamentView({
  teams,
  result,
  ldCount,
  ctpCount,
  sideWinners,
}: Props) {
  const sorted = [...result.teamStandings].sort(
    (a, b) => b.totalPoints - a.totalPoints,
  );
  const teamById = new Map(teams.map((t) => [t.teamId, t]));

  const userDisplayName = (userId: string): string => {
    for (const team of teams) {
      const m = team.members.find((m) => m.userId === userId);
      if (m) return `${m.displayName} (${team.label})`;
    }
    return 'Ukjent spiller';
  };

  return (
    <div className="space-y-6 px-4">
      <table className="w-full">
        <thead>
          <tr className="border-b border-line">
            <th className="py-2 text-left font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Lag
            </th>
            <th className="py-2 text-right font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Poeng
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
            const label = teamById.get(s.teamId)?.label ?? `Lag ${s.teamId}`;
            return (
              <tr key={s.teamId} className="border-b border-line/50">
                <td className="py-2 font-serif text-base text-text">
                  <span className="mr-1">{medal}</span>
                  {label}
                </td>
                <td className="py-2 text-right font-serif text-base text-text tabular-nums">
                  {s.totalPoints}p
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <details className="rounded-md border border-line bg-surface-2 p-3">
        <summary className="cursor-pointer font-serif text-base text-text">
          Vis hvordan poengene ble fordelt
        </summary>
        <div className="mt-3 space-y-4 text-sm">
          <CategoryRow
            label="Best netto 18 hull"
            winners={collectCategoryWinners(sorted, 'best_netto_18', teamById)}
            points={10}
          />
          <CategoryRow
            label="Best netto front 9"
            winners={collectCategoryWinners(sorted, 'best_netto_front9', teamById)}
            points={5}
          />
          <CategoryRow
            label="Best netto back 9"
            winners={collectCategoryWinners(sorted, 'best_netto_back9', teamById)}
            points={5}
          />

          <HoleWinGrid sorted={sorted} teamById={teamById} />

          {ldCount > 0 && (
            <SlotsSection
              heading="Longest drive"
              count={ldCount}
              category="longest_drive"
              sideWinners={sideWinners}
              userDisplayName={userDisplayName}
            />
          )}

          {ctpCount > 0 && (
            <SlotsSection
              heading="Closest to pin"
              count={ctpCount}
              category="closest_to_pin"
              sideWinners={sideWinners}
              userDisplayName={userDisplayName}
            />
          )}
        </div>
      </details>
    </div>
  );
}

// --- internal helpers ---

function collectCategoryWinners(
  sorted: SideTournamentResult['teamStandings'],
  category:
    | 'best_netto_18'
    | 'best_netto_front9'
    | 'best_netto_back9',
  teamById: Map<number, SideTournamentTeam>,
): string[] {
  const labels: string[] = [];
  for (const s of sorted) {
    for (const a of s.awards) {
      if (a.category === category) {
        labels.push(teamById.get(s.teamId)?.label ?? `Lag ${s.teamId}`);
      }
    }
  }
  return labels;
}

function CategoryRow({
  label,
  winners,
  points,
}: {
  label: string;
  winners: string[];
  points: number;
}) {
  return (
    <div>
      <div className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {label}
      </div>
      <div className="mt-1 font-serif text-base text-text">
        {winners.length === 0 ? (
          <span className="text-muted">Ingen score registrert</span>
        ) : (
          <>
            {winners.join(', ')}{' '}
            <span className="tabular-nums">→ {points}p</span>
            {winners.length > 1 && (
              <span className="text-muted"> (hver — uavgjort)</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function HoleWinGrid({
  sorted,
  teamById,
}: {
  sorted: SideTournamentResult['teamStandings'];
  teamById: Map<number, SideTournamentTeam>;
}) {
  // Bygg per-hull-vinner-map fra awards med detail "Hull N". Null = ingen
  // alene-vinner (alle uavgjort eller manglende score).
  const perHole: Map<number, number | null> = new Map();
  for (let h = 1; h <= 18; h++) perHole.set(h, null);

  for (const s of sorted) {
    for (const a of s.awards) {
      if (a.category === 'hole_win' && a.detail) {
        const match = a.detail.match(/Hull (\d+)/);
        if (match) {
          perHole.set(Number(match[1]), s.teamId);
        }
      }
    }
  }

  return (
    <div>
      <div className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted mb-2">
        Hole-wins (2p per hull)
      </div>
      <div className="grid grid-cols-6 gap-1 text-xs font-serif">
        {Array.from({ length: 18 }, (_, i) => i + 1).map((h) => {
          const winnerTeam = perHole.get(h) ?? null;
          const teamLabel = winnerTeam == null
            ? '—'
            : (teamById.get(winnerTeam)?.label.replace(/^Lag /, 'L') ??
                `L${winnerTeam}`);
          return (
            <div
              key={h}
              className="rounded border border-line bg-surface px-1 py-1 text-center tabular-nums"
            >
              <div className="text-[9px] text-muted">{h}</div>
              <div className={winnerTeam == null ? 'text-muted' : 'text-text'}>
                {teamLabel}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlotsSection({
  heading,
  count,
  category,
  sideWinners,
  userDisplayName,
}: {
  heading: string;
  count: number;
  category: 'longest_drive' | 'closest_to_pin';
  sideWinners: Array<{
    category: 'longest_drive' | 'closest_to_pin';
    position: number;
    winnerUserId: string | null;
  }>;
  userDisplayName: (userId: string) => string;
}) {
  return (
    <div>
      <div className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted mb-1">
        {heading} (2p per slot)
      </div>
      <div className="space-y-1">
        {Array.from({ length: count }, (_, i) => i + 1).map((pos) => {
          const w = sideWinners.find(
            (sw) => sw.category === category && sw.position === pos,
          );
          return (
            <div key={`${category}-${pos}`} className="font-serif text-base text-text">
              <span className="text-muted">#{pos}: </span>
              {w?.winnerUserId ? (
                <>
                  {userDisplayName(w.winnerUserId)}{' '}
                  <span className="tabular-nums">→ 2p</span>
                </>
              ) : (
                <span className="text-muted">Ingen kvalifiserte</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
