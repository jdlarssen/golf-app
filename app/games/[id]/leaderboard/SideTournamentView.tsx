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

/** Group-id-er som driver under-overskriftene i hver lag-expand. Rekkefølgen
 * her er den visuelle rekkefølgen. Tomme grupper hoppes stille over. */
type GroupId =
  | 'hovedkonkurranser'
  | 'skill'
  | 'moderate'
  | 'hull'
  | 'achievements'
  | 'penalty';

/** Fast visnings-rekkefølge for under-overskrifter. */
const GROUP_ORDER: readonly GroupId[] = [
  'hovedkonkurranser',
  'skill',
  'moderate',
  'hull',
  'achievements',
  'penalty',
];

/** Norske etiketter for under-overskrifter (uppercase via Tailwind). */
const GROUP_LABELS: Record<GroupId, string> = {
  hovedkonkurranser: 'Hovedkonkurranser',
  skill: 'Skill og rarity',
  moderate: 'Moderate',
  hull: 'Hull-konkurranser',
  achievements: 'Achievements',
  penalty: 'Penalty',
};

/**
 * Hvilken gruppe en gitt SideCategory tilhører. Brukes til å fordele awards
 * over de seks under-overskriftene i lag-expand. Penalty-gruppen er kun for
 * snowman (negativ-poeng) og rendres med varselsfarge i Task 8.3.
 */
const CATEGORY_GROUPS: Record<string, GroupId> = {
  // Hovedkonkurranser — 10p / 5p / 5p
  best_netto_18: 'hovedkonkurranser',
  best_netto_front9: 'hovedkonkurranser',
  best_netto_back9: 'hovedkonkurranser',
  // Skill og rarity — 4p lag / 2p individ
  best_brutto_18_team: 'skill',
  best_brutto_18_individual: 'skill',
  king_par3_team: 'skill',
  king_par3_individual: 'skill',
  king_par5_team: 'skill',
  king_par5_individual: 'skill',
  most_eagles_team: 'skill',
  most_eagles_individual: 'skill',
  longest_bogey_free_streak: 'skill',
  // Moderate — 2p lag / 1p individ
  best_brutto_f9_team: 'moderate',
  best_brutto_f9_individual: 'moderate',
  best_brutto_b9_team: 'moderate',
  best_brutto_b9_individual: 'moderate',
  most_birdies_team: 'moderate',
  most_birdies_individual: 'moderate',
  most_pars_team: 'moderate',
  most_pars_individual: 'moderate',
  lowest_single_hole_brutto: 'moderate',
  // Hull-konkurranser — 2p each
  hole_win: 'hull',
  longest_drive: 'hull',
  closest_to_pin: 'hull',
  // Achievements (positive)
  turkey: 'achievements',
  solid: 'achievements',
  // Penalty (negative — egen visuell tone)
  snowman: 'penalty',
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
 * grouped into seks under-seksjoner: Hovedkonkurranser, Skill og rarity,
 * Moderate, Hull-konkurranser, Achievements, Penalty. Tomme grupper hoppes
 * stille over så lag uten f.eks. achievements får en kort liste.
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

type AwardRow = { key: string; render: React.ReactNode };

/**
 * Renders one team's awards grouped into seks under-seksjoner. Tomme grupper
 * hoppes stille over (ingen under-overskrift, ingen padding).
 *
 * Innen hver gruppe: rader sorteres etter poeng descending. Ved like poeng
 * vinner lag-versjon over individ-versjon (lexicographic `_team` < `_individual`).
 *
 * Tie info på netto/brutto-lag-kategorier: hvis flere lag deler samme award,
 * legges "(uavgjort med Lag X)" til på radene.
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
  // Tabeller, gruppert per GroupId. Hver verdi er en liste av {category, render,
  // points} så vi kan sortere innen-gruppe.
  const rowsByGroup: Record<
    GroupId,
    Array<{ key: string; render: React.ReactNode; points: number; category: string }>
  > = {
    hovedkonkurranser: [],
    skill: [],
    moderate: [],
    hull: [],
    achievements: [],
    penalty: [],
  };

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

  const push = (
    group: GroupId,
    category: string,
    points: number,
    key: string,
    render: React.ReactNode,
  ) => {
    rowsByGroup[group].push({ key, render, points, category });
  };

  // 1. Best netto 18
  if (awards.some((a) => a.category === 'best_netto_18')) {
    push('hovedkonkurranser', 'best_netto_18', 10, 'best_netto_18', (
      <>
        Best netto 18 hull: <Pts n={10} />
        {tieSuffix(tieMates('best_netto_18'))}
      </>
    ));
  }
  // 2. Best netto front 9
  if (awards.some((a) => a.category === 'best_netto_front9')) {
    push('hovedkonkurranser', 'best_netto_front9', 5, 'best_netto_front9', (
      <>
        Best netto front 9: <Pts n={5} />
        {tieSuffix(tieMates('best_netto_front9'))}
      </>
    ));
  }
  // 3. Best netto back 9
  if (awards.some((a) => a.category === 'best_netto_back9')) {
    push('hovedkonkurranser', 'best_netto_back9', 5, 'best_netto_back9', (
      <>
        Best netto back 9: <Pts n={5} />
        {tieSuffix(tieMates('best_netto_back9'))}
      </>
    ));
  }
  // 4. Hole-wins (aggregated)
  const holeWinAwards = awards.filter((a) => a.category === 'hole_win');
  if (holeWinAwards.length > 0) {
    const holes = holeWinAwards
      .map((a) => a.holeNumber)
      .filter((h): h is number => typeof h === 'number');
    const totalPts = holeWinAwards.reduce((sum, a) => sum + a.points, 0);
    push('hull', 'hole_win', totalPts, 'hole_win', (
      <>
        Hole-wins: <Pts n={totalPts} /> på {holes.length} hull (
        {formatHolesList(holes)})
      </>
    ));
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
      push('hull', 'longest_drive', 2, `ld_${pos}`, (
        <>
          Longest drive #{pos} ({winnerName}): <Pts n={2} />
        </>
      ));
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
      push('hull', 'closest_to_pin', 2, `ctp_${pos}`, (
        <>
          Closest to pin #{pos} ({winnerName}): <Pts n={2} />
        </>
      ));
    }
  }

  // Telle totalt antall rader; om ingen → tom-melding.
  const totalRows = Object.values(rowsByGroup).reduce(
    (sum, rs) => sum + rs.length,
    0,
  );
  if (totalRows === 0) {
    return <div className="text-muted">Ingen poeng denne runden.</div>;
  }

  // Sortér innen hver gruppe: høyest poeng først, så lag-versjon før individ-
  // versjon (lexicographic på category-ID gjør jobben — `_team` < `_individual`).
  for (const group of GROUP_ORDER) {
    rowsByGroup[group].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.category.localeCompare(b.category);
    });
  }

  return (
    <div className="space-y-3">
      {GROUP_ORDER.map((group) => {
        const rows = rowsByGroup[group];
        if (rows.length === 0) return null;
        return (
          <GroupSection key={group} group={group} rows={rows} />
        );
      })}
    </div>
  );
}

function GroupSection({
  group,
  rows,
}: {
  group: GroupId;
  rows: AwardRow[];
}) {
  return (
    <section>
      <h3 className="mb-1 text-xs uppercase tracking-wide font-semibold text-muted">
        {GROUP_LABELS[group]}
      </h3>
      <ul className="space-y-1 font-serif text-base text-text">
        {rows.map((r) => (
          <li key={r.key}>{r.render}</li>
        ))}
      </ul>
    </section>
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
