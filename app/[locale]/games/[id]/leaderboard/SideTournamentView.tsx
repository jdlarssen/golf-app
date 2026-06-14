import { useTranslations } from 'next-intl';
import type {
  SideCategoryAward,
  SideTournamentResult,
} from '@/lib/scoring/sideTournament';
import {
  SIDE_TOURNAMENT_POINTS,
  type SideCategoryId,
} from '@/lib/scoring/sideTournamentConfig';
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
  /**
   * 18-element par-array indexed by hole-1 (coursePars[0] er par for hull 1).
   * Brukes til å beregne over-par-delta for Snowman-radene
   * ("hele laget +6 på hull 12" — N regnes som worst-gross − par).
   */
  coursePars: number[];
  /**
   * Per-spill kategori-overstyringer fra `games.side_disabled_categories`.
   * Tomt array = Full pakke (alle aktive). Brukes til å filtrere
   * «Slik gis poengene»-panelet så det kun viser kategorier som faktisk
   * regnes denne runden.
   */
  disabledCategories: SideCategoryId[];
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
  team_all_birdied_bonus: 'achievements',
  team_no_bogey_hole_coord: 'achievements',
  // Penalty (negative — eigen visuell tone)
  snowman: 'penalty',
  worst_single_hole_brutto: 'penalty',
  most_double_bogeys_individual: 'penalty',
  // v1.19.0 nye kategoriar — skill (4p lag / 2p individ eller 4p individ-terskel)
  most_albatrosses_team: 'skill',
  most_albatrosses_individual: 'skill',
  most_hole_in_ones_team: 'skill',
  most_hole_in_ones_individual: 'skill',
  king_par4_team: 'skill',
  king_par4_individual: 'skill',
  clean_front_9: 'skill',
  clean_back_9: 'skill',
  no_double_plus_round: 'skill',
  // v1.19.0 — moderate (2p individ)
  hardest_hole_winner: 'moderate',
  comeback_kid: 'moderate',
  all_par_groups_birdie: 'moderate',
  even_par_round: 'moderate',
  back_to_back_birdies: 'moderate',
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
 * grouped into six sub-sections. Empty groups are silently skipped.
 *
 * No realtime, no client state — `result` is precomputed by the server page.
 */
export function SideTournamentView({
  teams,
  result,
  ldCount,
  ctpCount,
  sideWinners,
  coursePars,
  disabledCategories,
}: Props) {
  const t = useTranslations('leaderboard.sideTournament');
  const sorted = rankByPoints(result.teamStandings);
  const teamById = new Map(teams.map((tm) => [tm.teamId, tm]));
  // Solo/individuelt format: hvert lag har nøyaktig ett medlem. Da er
  // lag-vs-individ-skillet meningsløst — lag-kategoriene fyrer aldri (gated på
  // userIds.length >= 2 i scoring), så «hele laget»-copy og lag-rader i
  // regel-panelet skjules/skrives om for solo.
  const isIndividual =
    teams.length > 0 && teams.every((tm) => tm.members.length === 1);

  return (
    <div className="space-y-3 px-4">
      <ScoringRulesPanel
        disabledCategories={disabledCategories}
        ldCount={ldCount}
        ctpCount={ctpCount}
        isIndividual={isIndividual}
      />
      {sorted.map((standing) => {
        const team = teamById.get(standing.teamId);
        const label = team?.label ?? t('teamFallback', { id: standing.teamId });
        // For et 1-manns-lag (solo) er label = fornavn og det eneste medlemmet
        // har samme fornavn → dublett. Vis kallenavn-formen (displayName) én
        // gang i stedet, og drop member-undertittelen.
        const soloMember =
          team && team.members.length === 1 ? team.members[0] : null;
        const title = soloMember ? soloMember.displayName : label;
        const memberNames = soloMember
          ? ''
          : (team?.members.map((m) => m.firstName).join(' · ') ?? '');
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
                  {title}
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
                coursePars={coursePars}
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
  return sorted.map((tm) => {
    if (tm.totalPoints !== lastTotal) {
      rank += 1;
      lastTotal = tm.totalPoints;
    }
    return { ...tm, rank };
  });
}

type RankedStanding = SideTournamentResult['teamStandings'][number] & {
  rank: number;
};

type AwardRow = { key: string; render: React.ReactNode };

/**
 * Renders one team's awards grouped into six sub-sections. Empty groups are
 * silently skipped.
 *
 * Within each group: rows are sorted by points descending. On equal points
 * team version beats individual version (lexicographic `_team` < `_individual`).
 *
 * Tie info on net/gross team categories: if multiple teams share the same award,
 * "(tied with Team X)" is appended.
 */
function TeamAwards({
  teamId,
  standings,
  ldCount,
  ctpCount,
  sideWinners,
  teamById,
  coursePars,
}: {
  teamId: number;
  standings: RankedStanding[];
  ldCount: number;
  ctpCount: number;
  sideWinners: Props['sideWinners'];
  teamById: Map<number, SideTournamentTeam>;
  coursePars: number[];
}) {
  const t = useTranslations('leaderboard.sideTournament');
  const myStanding = standings.find((s) => s.teamId === teamId);
  if (!myStanding) return null;

  const awards = myStanding.awards;
  // Et 1-manns-lag (solo): «hele laget»-copy på snowman leses feil — bruk
  // individuell form. Snowman er den eneste lag-flavored awarden som fyrer for
  // solo (de andre lag-kategoriene er gated på userIds.length >= 2 i scoring).
  const isSoloTeam = (teamById.get(teamId)?.members.length ?? 0) === 1;
  const rows: Record<GroupId, Array<{ key: string; render: React.ReactNode; points: number; category: string }>> = {
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
      (id) => teamById.get(id)?.label ?? t('teamFallback', { id }),
    );
    if (labels.length === 1) return t('tieOne', { team: labels[0] });
    if (labels.length === 2)
      return t('tieTwo', { team1: labels[0], team2: labels[1] });
    return t('tieMany', { teams: labels.slice(0, -1).join(', '), last: labels[labels.length - 1] });
  };

  const push = (
    group: GroupId,
    category: string,
    points: number,
    key: string,
    render: React.ReactNode,
  ) => {
    rows[group].push({ key, render, points, category });
  };

  /** Gets the FIRST award with the given category. */
  const findAward = (
    category: SideCategoryAward['category'],
  ): SideCategoryAward | undefined =>
    awards.find((a) => a.category === category);

  /** Returns the first name of winnerUserId, or "?" if not found. */
  const winnerName = (award: SideCategoryAward | undefined): string =>
    firstNameOf(award?.winnerUserId ?? null, teamById) ?? '?';

  /** Formats a streak range: "hull X–Y" or "hull X" (via translated catalog keys). */
  const formatStreakRange = (startHole: number, endHole: number): string => {
    if (startHole === endHole) return t('streakSingle', { hole: startHole });
    return t('streakRange', { start: startHole, end: endHole });
  };

  // ─── Hovedkonkurranser ──────────────────────────────────────────────────
  if (awards.some((a) => a.category === 'best_netto_18')) {
    push('hovedkonkurranser', 'best_netto_18', 10, 'best_netto_18', (
      <>
        {t('awards.bestNetto18')} <Pts n={10} />
        {tieSuffix(tieMates('best_netto_18'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'best_netto_front9')) {
    push('hovedkonkurranser', 'best_netto_front9', 5, 'best_netto_front9', (
      <>
        {t('awards.bestNettoFront9')} <Pts n={5} />
        {tieSuffix(tieMates('best_netto_front9'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'best_netto_back9')) {
    push('hovedkonkurranser', 'best_netto_back9', 5, 'best_netto_back9', (
      <>
        {t('awards.bestNettoBack9')} <Pts n={5} />
        {tieSuffix(tieMates('best_netto_back9'))}
      </>
    ));
  }

  // ─── Skill og rarity ────────────────────────────────────────────────────
  if (awards.some((a) => a.category === 'best_brutto_18_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.bestBrutto18Team;
    push('skill', 'best_brutto_18_team', pts, 'best_brutto_18_team', (
      <>
        {t('awards.bestBrutto18Team')} <Pts n={pts} />
        {tieSuffix(tieMates('best_brutto_18_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'best_brutto_18_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.bestBrutto18Individual;
    const name = winnerName(findAward('best_brutto_18_individual'));
    push('skill', 'best_brutto_18_individual', pts, 'best_brutto_18_individual', (
      <>
        {t('awards.bestBrutto18Individual', { name })} <Pts n={pts} />
      </>
    ));
  }
  if (awards.some((a) => a.category === 'king_par3_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.kingPar3Team;
    push('skill', 'king_par3_team', pts, 'king_par3_team', (
      <>
        {t('awards.kingPar3Team')} <Pts n={pts} />
        {tieSuffix(tieMates('king_par3_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'king_par3_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.kingPar3Individual;
    const name = winnerName(findAward('king_par3_individual'));
    push('skill', 'king_par3_individual', pts, 'king_par3_individual', (
      <>
        {t('awards.kingPar3Individual', { name })} <Pts n={pts} />
      </>
    ));
  }
  if (awards.some((a) => a.category === 'king_par5_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.kingPar5Team;
    push('skill', 'king_par5_team', pts, 'king_par5_team', (
      <>
        {t('awards.kingPar5Team')} <Pts n={pts} />
        {tieSuffix(tieMates('king_par5_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'king_par5_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.kingPar5Individual;
    const name = winnerName(findAward('king_par5_individual'));
    push('skill', 'king_par5_individual', pts, 'king_par5_individual', (
      <>
        {t('awards.kingPar5Individual', { name })} <Pts n={pts} />
      </>
    ));
  }
  if (awards.some((a) => a.category === 'most_eagles_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.mostEaglesTeam;
    push('skill', 'most_eagles_team', pts, 'most_eagles_team', (
      <>
        {t('awards.mostEaglesTeam')} <Pts n={pts} />
        {tieSuffix(tieMates('most_eagles_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'most_eagles_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.mostEaglesIndividual;
    const name = winnerName(findAward('most_eagles_individual'));
    push('skill', 'most_eagles_individual', pts, 'most_eagles_individual', (
      <>
        {t('awards.mostEaglesIndividual', { name })} <Pts n={pts} />
      </>
    ));
  }
  // v1.19.0 — King par-4
  if (awards.some((a) => a.category === 'king_par4_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.kingPar4Team;
    push('skill', 'king_par4_team', pts, 'king_par4_team', (
      <>
        {t('awards.kingPar4Team')} <Pts n={pts} />
        {tieSuffix(tieMates('king_par4_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'king_par4_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.kingPar4Individual;
    const name = winnerName(findAward('king_par4_individual'));
    push('skill', 'king_par4_individual', pts, 'king_par4_individual', (
      <>
        {t('awards.kingPar4Individual', { name })} <Pts n={pts} />
      </>
    ));
  }
  // v1.19.0 — Most albatrosses
  if (awards.some((a) => a.category === 'most_albatrosses_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.mostAlbatrossesTeam;
    push('skill', 'most_albatrosses_team', pts, 'most_albatrosses_team', (
      <>
        {t('awards.mostAlbatrossesTeam')} <Pts n={pts} />
        {tieSuffix(tieMates('most_albatrosses_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'most_albatrosses_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.mostAlbatrossesIndividual;
    const name = winnerName(findAward('most_albatrosses_individual'));
    push('skill', 'most_albatrosses_individual', pts, 'most_albatrosses_individual', (
      <>
        {t('awards.mostAlbatrossesIndividual', { name })} <Pts n={pts} />
      </>
    ));
  }
  // v1.19.0 — Most hole-in-ones
  if (awards.some((a) => a.category === 'most_hole_in_ones_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.mostHoleInOnesTeam;
    push('skill', 'most_hole_in_ones_team', pts, 'most_hole_in_ones_team', (
      <>
        {t('awards.mostHoleInOnesTeam')} <Pts n={pts} />
        {tieSuffix(tieMates('most_hole_in_ones_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'most_hole_in_ones_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.mostHoleInOnesIndividual;
    const name = winnerName(findAward('most_hole_in_ones_individual'));
    push('skill', 'most_hole_in_ones_individual', pts, 'most_hole_in_ones_individual', (
      <>
        {t('awards.mostHoleInOnesIndividual', { name })} <Pts n={pts} />
      </>
    ));
  }
  // v1.19.0 — Clean front/back 9, no double plus round
  {
    const cf = findAward('clean_front_9');
    if (cf) {
      const pts = SIDE_TOURNAMENT_POINTS.cleanFront9;
      const name = winnerName(cf);
      push('skill', 'clean_front_9', pts, 'clean_front_9', (
        <>
          {t('awards.cleanFront9', { name })} <Pts n={pts} />
        </>
      ));
    }
  }
  {
    const cb = findAward('clean_back_9');
    if (cb) {
      const pts = SIDE_TOURNAMENT_POINTS.cleanBack9;
      const name = winnerName(cb);
      push('skill', 'clean_back_9', pts, 'clean_back_9', (
        <>
          {t('awards.cleanBack9', { name })} <Pts n={pts} />
        </>
      ));
    }
  }
  {
    const nd = findAward('no_double_plus_round');
    if (nd) {
      const pts = SIDE_TOURNAMENT_POINTS.noDoublePlusRound;
      const name = winnerName(nd);
      push('skill', 'no_double_plus_round', pts, 'no_double_plus_round', (
        <>
          {t('awards.noDoublePlusRound', { name })} <Pts n={pts} />
        </>
      ));
    }
  }
  // Longest bogey-free streak
  {
    const bf = findAward('longest_bogey_free_streak');
    if (bf) {
      const pts = SIDE_TOURNAMENT_POINTS.longestBogeyFreeStreak;
      const name = winnerName(bf);
      const len = bf.streakLength ?? 0;
      const range =
        bf.streakStartHole != null && bf.streakEndHole != null
          ? formatStreakRange(bf.streakStartHole, bf.streakEndHole)
          : null;
      const detail = range
        ? t('longestBogeyFreeDetail', { name, count: len, range })
        : name;
      push('skill', 'longest_bogey_free_streak', pts, 'longest_bogey_free_streak', (
        <>
          {t('awards.longestBogeyFreeStreak', { detail })} <Pts n={pts} />
        </>
      ));
    }
  }

  // ─── Moderate ───────────────────────────────────────────────────────────
  if (awards.some((a) => a.category === 'best_brutto_f9_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.bestBruttoF9Team;
    push('moderate', 'best_brutto_f9_team', pts, 'best_brutto_f9_team', (
      <>
        {t('awards.bestBruttoF9Team')} <Pts n={pts} />
        {tieSuffix(tieMates('best_brutto_f9_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'best_brutto_f9_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.bestBruttoF9Individual;
    const name = winnerName(findAward('best_brutto_f9_individual'));
    push('moderate', 'best_brutto_f9_individual', pts, 'best_brutto_f9_individual', (
      <>
        {t('awards.bestBruttoF9Individual', { name })} <Pts n={pts} />
      </>
    ));
  }
  if (awards.some((a) => a.category === 'best_brutto_b9_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.bestBruttoB9Team;
    push('moderate', 'best_brutto_b9_team', pts, 'best_brutto_b9_team', (
      <>
        {t('awards.bestBruttoB9Team')} <Pts n={pts} />
        {tieSuffix(tieMates('best_brutto_b9_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'best_brutto_b9_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.bestBruttoB9Individual;
    const name = winnerName(findAward('best_brutto_b9_individual'));
    push('moderate', 'best_brutto_b9_individual', pts, 'best_brutto_b9_individual', (
      <>
        {t('awards.bestBruttoB9Individual', { name })} <Pts n={pts} />
      </>
    ));
  }
  if (awards.some((a) => a.category === 'most_birdies_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.mostBirdiesTeam;
    push('moderate', 'most_birdies_team', pts, 'most_birdies_team', (
      <>
        {t('awards.mostBirdiesTeam')} <Pts n={pts} />
        {tieSuffix(tieMates('most_birdies_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'most_birdies_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.mostBirdiesIndividual;
    const name = winnerName(findAward('most_birdies_individual'));
    push('moderate', 'most_birdies_individual', pts, 'most_birdies_individual', (
      <>
        {t('awards.mostBirdiesIndividual', { name })} <Pts n={pts} />
      </>
    ));
  }
  if (awards.some((a) => a.category === 'most_pars_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.mostParsTeam;
    push('moderate', 'most_pars_team', pts, 'most_pars_team', (
      <>
        {t('awards.mostParsTeam')} <Pts n={pts} />
        {tieSuffix(tieMates('most_pars_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'most_pars_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.mostParsIndividual;
    const name = winnerName(findAward('most_pars_individual'));
    push('moderate', 'most_pars_individual', pts, 'most_pars_individual', (
      <>
        {t('awards.mostParsIndividual', { name })} <Pts n={pts} />
      </>
    ));
  }
  // Lowest single hole
  {
    const low = findAward('lowest_single_hole_brutto');
    if (low) {
      const pts = SIDE_TOURNAMENT_POINTS.lowestSingleHoleBrutto;
      const name = winnerName(low);
      const score = low.score;
      const hole = low.holeNumber;
      const detail =
        score != null && hole != null
          ? t('scoreOnHole', { name, score, hole })
          : name;
      push('moderate', 'lowest_single_hole_brutto', pts, 'lowest_single_hole_brutto', (
        <>
          {t('awards.lowestSingleHoleBrutto', { detail })} <Pts n={pts} />
        </>
      ));
    }
  }
  // v1.19.0 — Hardest hole winner
  {
    const hh = findAward('hardest_hole_winner');
    if (hh) {
      const pts = SIDE_TOURNAMENT_POINTS.hardestHoleWinner;
      const name = winnerName(hh);
      const score = hh.score;
      const hole = hh.holeNumber;
      const detail =
        score != null && hole != null
          ? t('scoreOnHoleBrutto', { name, score, hole })
          : name;
      push('moderate', 'hardest_hole_winner', pts, 'hardest_hole_winner', (
        <>
          {t('awards.hardestHoleWinner', { detail })} <Pts n={pts} />
        </>
      ));
    }
  }
  // v1.19.0 — Comeback kid
  {
    const ck = findAward('comeback_kid');
    if (ck) {
      const pts = SIDE_TOURNAMENT_POINTS.comebackKid;
      const name = winnerName(ck);
      const delta = ck.delta;
      const detail =
        delta != null
          ? t('comebackDetail', { name, delta: Math.abs(delta) })
          : name;
      push('moderate', 'comeback_kid', pts, 'comeback_kid', (
        <>
          {t('awards.comebackKid', { detail })} <Pts n={pts} />
        </>
      ));
    }
  }
  // v1.19.0 — All par groups birdie
  {
    const apg = findAward('all_par_groups_birdie');
    if (apg) {
      const pts = SIDE_TOURNAMENT_POINTS.allParGroupsBirdie;
      const name = winnerName(apg);
      push('moderate', 'all_par_groups_birdie', pts, 'all_par_groups_birdie', (
        <>
          {t('awards.allParGroupsBirdie', { name })} <Pts n={pts} />
        </>
      ));
    }
  }
  // v1.19.0 — Even-par round
  {
    const epr = findAward('even_par_round');
    if (epr) {
      const pts = SIDE_TOURNAMENT_POINTS.evenParRound;
      const name = winnerName(epr);
      push('moderate', 'even_par_round', pts, 'even_par_round', (
        <>
          {t('awards.evenParRound', { name })} <Pts n={pts} />
        </>
      ));
    }
  }
  // v1.19.0 — Back-to-back birdies (stackable)
  {
    const b2bAwards = awards.filter((a) => a.category === 'back_to_back_birdies');
    if (b2bAwards.length > 0) {
      const byUser = new Map<string, { totalPoints: number; ranges: string[] }>();
      for (const a of b2bAwards) {
        const uid = a.winnerUserId ?? '?';
        const existing = byUser.get(uid) ?? { totalPoints: 0, ranges: [] };
        existing.totalPoints += a.points;
        if (a.streakStartHole != null && a.streakEndHole != null) {
          existing.ranges.push(formatStreakRange(a.streakStartHole, a.streakEndHole));
        }
        byUser.set(uid, existing);
      }
      for (const [uid, { totalPoints, ranges }] of byUser) {
        const name = firstNameOf(uid === '?' ? null : uid, teamById) ?? '?';
        const detail =
          ranges.length > 0 ? `${name}, ${ranges.join(', ')}` : name;
        const key = `back_to_back_birdies_${uid}`;
        push('moderate', 'back_to_back_birdies', totalPoints, key, (
          <>
            {t('awards.backToBackBirdies', { detail })} <Pts n={totalPoints} />
          </>
        ));
      }
    }
  }

  // ─── Hull-konkurranser ──────────────────────────────────────────────────
  // Hole-wins (aggregated)
  const holeWinAwards = awards.filter((a) => a.category === 'hole_win');
  if (holeWinAwards.length > 0) {
    const holes = holeWinAwards
      .map((a) => a.holeNumber)
      .filter((h): h is number => typeof h === 'number');
    const totalPts = holeWinAwards.reduce((sum, a) => sum + a.points, 0);
    const holeWord = t('holeWord');
    const holesList = formatHolesList(holes, holeWord);
    push('hull', 'hole_win', totalPts, 'hole_win', (
      <>
        {t('awards.holeWins')} <Pts n={totalPts} />{' '}
        {t('awards.holeWinsOn', { count: holes.length, holes: holesList })}
      </>
    ));
  }
  // Longest drive — per slot
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
      const ldName = firstNameOf(w.winnerUserId, teamById) ?? '?';
      push('hull', 'longest_drive', 2, `ld_${pos}`, (
        <>
          {t('awards.longestDrive', { pos, name: ldName })} <Pts n={2} />
        </>
      ));
    }
  }
  // Closest to pin — per slot
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
      const ctpName = firstNameOf(w.winnerUserId, teamById) ?? '?';
      push('hull', 'closest_to_pin', 2, `ctp_${pos}`, (
        <>
          {t('awards.closestToPin', { pos, name: ctpName })} <Pts n={2} />
        </>
      ));
    }
  }

  // ─── Achievements (positive) ────────────────────────────────────────────
  // Turkey — per-player (stackable) + team-coord bonus
  const turkeyAwards = awards.filter((a) => a.category === 'turkey');
  for (const ta of turkeyAwards) {
    const pts = ta.points;
    const start = ta.streakStartHole;
    const end = ta.streakEndHole;
    const range =
      start != null && end != null ? ` (${formatStreakRange(start, end)})` : '';
    if (ta.coordBonus) {
      const key = `turkey_coord_${start ?? '?'}_${end ?? '?'}`;
      push('achievements', 'turkey', pts, key, (
        <AchievementRow
          rule={t('achievementRules.turkeyCoord')}
          main={
            <>
              {t('awards.turkeyCoord', { range })} <Pts n={pts} />
            </>
          }
        />
      ));
    } else {
      const name = firstNameOf(ta.winnerUserId ?? null, teamById) ?? '?';
      const detail = range ? `${name}, ${formatStreakRange(start!, end!)}` : name;
      const key = `turkey_${ta.winnerUserId ?? '?'}_${start ?? '?'}_${end ?? '?'}`;
      push('achievements', 'turkey', pts, key, (
        <AchievementRow
          rule={t('achievementRules.turkeyPlayer')}
          main={
            <>
              {t('awards.turkeyPlayer', { detail })} <Pts n={pts} />
            </>
          }
        />
      ));
    }
  }
  // Solid — per-player (stackable) + team-coord bonus
  const solidAwards = awards.filter((a) => a.category === 'solid');
  for (const sa of solidAwards) {
    const pts = sa.points;
    const start = sa.streakStartHole;
    const end = sa.streakEndHole;
    const range =
      start != null && end != null ? ` (${formatStreakRange(start, end)})` : '';
    if (sa.coordBonus) {
      const key = `solid_coord_${start ?? '?'}_${end ?? '?'}`;
      push('achievements', 'solid', pts, key, (
        <AchievementRow
          rule={t('achievementRules.solidCoord')}
          main={
            <>
              {t('awards.solidCoord', { range })} <Pts n={pts} />
            </>
          }
        />
      ));
    } else {
      const name = firstNameOf(sa.winnerUserId ?? null, teamById) ?? '?';
      const detail = range ? `${name}, ${formatStreakRange(start!, end!)}` : name;
      const key = `solid_${sa.winnerUserId ?? '?'}_${start ?? '?'}_${end ?? '?'}`;
      push('achievements', 'solid', pts, key, (
        <AchievementRow
          rule={t('achievementRules.solidPlayer')}
          main={
            <>
              {t('awards.solidPlayer', { detail })} <Pts n={pts} />
            </>
          }
        />
      ));
    }
  }
  // v1.19.0 — All birdied (team bonus)
  {
    const tabAwards = awards.filter((a) => a.category === 'team_all_birdied_bonus');
    for (const a of tabAwards) {
      const pts = a.points;
      const key = `team_all_birdied_bonus_${a.teamId}`;
      push('achievements', 'team_all_birdied_bonus', pts, key, (
        <AchievementRow
          rule={t('achievementRules.teamAllBirdied')}
          main={
            <>
              {t('awards.teamAllBirdied')} <Pts n={pts} />
            </>
          }
        />
      ));
    }
  }
  // v1.19.0 — Team no-bogey hole coord (stackable per hole)
  {
    const nbAwards = awards.filter((a) => a.category === 'team_no_bogey_hole_coord');
    if (nbAwards.length > 0) {
      for (const a of nbAwards) {
        const pts = a.points;
        const hole = a.holeNumber;
        const detail = hole != null ? ` (${t('streakSingle', { hole })})` : '';
        const key = `team_no_bogey_hole_coord_${hole ?? '?'}`;
        push('achievements', 'team_no_bogey_hole_coord', pts, key, (
          <AchievementRow
            rule={t('achievementRules.teamNoBogeyHole')}
            main={
              <>
                {t('awards.teamNoBogeyHole', { detail })}{' '}
                <Pts n={pts} />
              </>
            }
          />
        ));
      }
    }
  }

  // ─── Penalty ────────────────────────────────────────────────────────────
  // Snowman — one row per hole where whole team had gross ≥ par+5
  const snowmanAwards = awards.filter((a) => a.category === 'snowman');
  for (const sw of snowmanAwards) {
    const pts = sw.points; // -2
    const hole = sw.holeNumber;
    const overDelta = sw.score;
    let detail = '?';
    if (hole != null && overDelta != null) {
      detail = t(isSoloTeam ? 'snowmanDetailSolo' : 'snowmanDetail', {
        delta: overDelta,
        hole,
      });
    } else if (hole != null) {
      const par = coursePars[hole - 1];
      detail = par != null
        ? t(isSoloTeam ? 'snowmanDetailHoleSolo' : 'snowmanDetailHole', { hole })
        : t('streakSingle', { hole });
    }
    const key = `snowman_${hole ?? '?'}`;
    push('penalty', 'snowman', pts, key, (
      <AchievementRow
        rule={t(isSoloTeam ? 'achievementRules.snowmanSolo' : 'achievementRules.snowman')}
        main={
          <>
            {t('awards.snowman', { detail })}{' '}
            <span className="tabular-nums text-danger">{pts}p</span>
          </>
        }
      />
    ));
  }
  // v1.19.0 — Worst single hole (−1p individual)
  {
    const worst = findAward('worst_single_hole_brutto');
    if (worst) {
      const pts = SIDE_TOURNAMENT_POINTS.worstSingleHoleBrutto;
      const name = winnerName(worst);
      const score = worst.score;
      const hole = worst.holeNumber;
      const detail =
        score != null && hole != null
          ? t('scoreOnHole', { name, score, hole })
          : name;
      push('penalty', 'worst_single_hole_brutto', pts, 'worst_single_hole_brutto', (
        <>
          {t('awards.worstSingleHole', { detail })}{' '}
          <span className="tabular-nums text-danger">{pts}p</span>
        </>
      ));
    }
  }
  // v1.19.0 — Most double bogeys (−1p individual)
  {
    const md = findAward('most_double_bogeys_individual');
    if (md) {
      const pts = SIDE_TOURNAMENT_POINTS.mostDoubleBogeysIndividual;
      const name = winnerName(md);
      push('penalty', 'most_double_bogeys_individual', pts, 'most_double_bogeys_individual', (
        <>
          {t('awards.mostDoubleBogeys', { name })}{' '}
          <span className="tabular-nums text-danger">{pts}p</span>
        </>
      ));
    }
  }

  const totalRows = Object.values(rows).reduce((sum, rs) => sum + rs.length, 0);
  if (totalRows === 0) {
    return <div className="text-muted">{t('noPoints')}</div>;
  }

  // Sort within each group: highest points first, then team version before individual
  for (const group of GROUP_ORDER) {
    rows[group].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.category.localeCompare(b.category);
    });
  }

  return (
    <div className="space-y-3">
      {GROUP_ORDER.map((group) => {
        const groupRows = rows[group];
        if (groupRows.length === 0) return null;
        return <GroupSection key={group} group={group} rows={groupRows} />;
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
  const t = useTranslations('leaderboard.sideTournament');
  const headerClass =
    group === 'penalty'
      ? 'mb-1 text-xs uppercase tracking-wide font-semibold text-danger'
      : 'mb-1 text-xs uppercase tracking-wide font-semibold text-muted';
  return (
    <section>
      <h3 className={headerClass}>{t(`groups.${group}`)}</h3>
      <ul className="space-y-1 font-serif text-base text-text">
        {rows.map((r) => (
          <li key={r.key}>{r.render}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Main row + rule subtitle, used for Turkey/Solid/Snowman. Subtitle is
 * `text-xs text-muted leading-tight` so it sits close under the main row
 * without becoming its own visual entity. `block` on the main row gives
 * controlled margin without breaking out of the <li>.
 */
function AchievementRow({
  main,
  rule,
}: {
  main: React.ReactNode;
  rule: string;
}) {
  return (
    <>
      <span className="block">{main}</span>
      <span className="mt-0.5 block text-xs text-muted leading-tight">
        {rule}
      </span>
    </>
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

// ─── Slik gis poengene-panel ─────────────────────────────────────────────

/**
 * «Slik gis poengene»-panel — collapsed by default, expanded by the user to
 * understand how categories award points. Only shows active (non-disabled)
 * categories so the panel always mirrors the rule set for this round.
 *
 * For linked dual-version rows (e.g. «Most birdies») the whole row is hidden
 * if both versions are disabled; if only one is disabled, only the remaining
 * version's points fragment is shown.
 *
 * LD/CTP slots are controlled by game counters, not `disabledCategories`,
 * so they are filtered by `ldCount`/`ctpCount` instead of the disabled set.
 */
/** Lag-kun-kategorier som aldri fyrer i solo (alle `*_team` + de to rene
 * coord-bonusene). Brukes til å skjule dem fra regel-panelet for solo. */
function isTeamOnlyCategory(id: string): boolean {
  return (
    id.endsWith('_team') ||
    id === 'team_all_birdied_bonus' ||
    id === 'team_no_bogey_hole_coord'
  );
}

function ScoringRulesPanel({
  disabledCategories,
  ldCount,
  ctpCount,
  isIndividual,
}: {
  disabledCategories: readonly SideCategoryId[];
  ldCount: number;
  ctpCount: number;
  /** Solo/individuelt format: skjul lag-variant-fragmenter og rene lag-rader. */
  isIndividual: boolean;
}) {
  const t = useTranslations('leaderboard.sideTournament');
  const disabledSet = new Set<SideCategoryId>(disabledCategories);

  type PanelRowDef = {
    key: string;
    labelKey: string;
    ids: readonly SideCategoryId[];
    pointsKeys: readonly string[];
    trailer?: string;
    ruleKey?: string;
    hint?: string;
  };

  type PanelGroupDef = {
    id: GroupId;
    titleKey: string;
    hintKey?: string;
    rows: readonly PanelRowDef[];
  };

  const PANEL_GROUPS: readonly PanelGroupDef[] = [
    {
      id: 'hovedkonkurranser',
      titleKey: 'panel.groups.hovedkonkurranser',
      rows: [
        { key: 'best_netto_18', labelKey: 'panel.rows.bestNetto18', ids: ['best_netto_18'], pointsKeys: ['panel.points.bestNetto18'] },
        { key: 'best_netto_f9', labelKey: 'panel.rows.bestNettoF9', ids: ['best_netto_f9'], pointsKeys: ['panel.points.bestNettoF9'] },
        { key: 'best_netto_b9', labelKey: 'panel.rows.bestNettoB9', ids: ['best_netto_b9'], pointsKeys: ['panel.points.bestNettoB9'] },
      ],
    },
    {
      id: 'skill',
      titleKey: 'panel.groups.skill',
      rows: [
        { key: 'best_brutto_18', labelKey: 'panel.rows.bestBrutto18', ids: ['best_brutto_18_team', 'best_brutto_18_individual'], pointsKeys: ['panel.points.bestBrutto18Team', 'panel.points.bestBrutto18Individual'] },
        { key: 'king_par3', labelKey: 'panel.rows.kingPar3', ids: ['king_par3_team', 'king_par3_individual'], pointsKeys: ['panel.points.kingPar3Team', 'panel.points.kingPar3Individual'], ruleKey: 'panel.rules.kingPar3' },
        { key: 'king_par4', labelKey: 'panel.rows.kingPar4', ids: ['king_par4_team', 'king_par4_individual'], pointsKeys: ['panel.points.kingPar4Team', 'panel.points.kingPar4Individual'], ruleKey: 'panel.rules.kingPar4' },
        { key: 'king_par5', labelKey: 'panel.rows.kingPar5', ids: ['king_par5_team', 'king_par5_individual'], pointsKeys: ['panel.points.kingPar5Team', 'panel.points.kingPar5Individual'], ruleKey: 'panel.rules.kingPar5' },
        { key: 'most_eagles', labelKey: 'panel.rows.mostEagles', ids: ['most_eagles_team', 'most_eagles_individual'], pointsKeys: ['panel.points.mostEaglesTeam', 'panel.points.mostEaglesIndividual'] },
        { key: 'most_albatrosses', labelKey: 'panel.rows.mostAlbatrosses', ids: ['most_albatrosses_team', 'most_albatrosses_individual'], pointsKeys: ['panel.points.mostAlbatrossesTeam', 'panel.points.mostAlbatrossesIndividual'], ruleKey: 'panel.rules.mostAlbatrosses' },
        { key: 'most_hole_in_ones', labelKey: 'panel.rows.mostHoleInOnes', ids: ['most_hole_in_ones_team', 'most_hole_in_ones_individual'], pointsKeys: ['panel.points.mostHoleInOnesTeam', 'panel.points.mostHoleInOnesIndividual'], ruleKey: 'panel.rules.mostHoleInOnes' },
        { key: 'clean_front_9', labelKey: 'panel.rows.cleanFront9', ids: ['clean_front_9'], pointsKeys: ['panel.points.cleanFront9'], ruleKey: 'panel.rules.cleanFront9' },
        { key: 'clean_back_9', labelKey: 'panel.rows.cleanBack9', ids: ['clean_back_9'], pointsKeys: ['panel.points.cleanBack9'], ruleKey: 'panel.rules.cleanBack9' },
        { key: 'no_double_plus_round', labelKey: 'panel.rows.noDoublePlusRound', ids: ['no_double_plus_round'], pointsKeys: ['panel.points.noDoublePlusRound'], ruleKey: 'panel.rules.noDoublePlusRound' },
        { key: 'longest_bogey_free_streak', labelKey: 'panel.rows.longestBogeyFreeStreak', ids: ['longest_bogey_free_streak'], pointsKeys: ['panel.points.longestBogeyFreeStreak'], ruleKey: 'panel.rules.longestBogeyFreeStreak' },
      ],
    },
    {
      id: 'moderate',
      titleKey: 'panel.groups.moderate',
      rows: [
        { key: 'best_brutto_f9', labelKey: 'panel.rows.bestBruttoF9', ids: ['best_brutto_f9_team', 'best_brutto_f9_individual'], pointsKeys: ['panel.points.bestBruttoF9Team', 'panel.points.bestBruttoF9Individual'] },
        { key: 'best_brutto_b9', labelKey: 'panel.rows.bestBruttoB9', ids: ['best_brutto_b9_team', 'best_brutto_b9_individual'], pointsKeys: ['panel.points.bestBruttoB9Team', 'panel.points.bestBruttoB9Individual'] },
        { key: 'most_birdies', labelKey: 'panel.rows.mostBirdies', ids: ['most_birdies_team', 'most_birdies_individual'], pointsKeys: ['panel.points.mostBirdiesTeam', 'panel.points.mostBirdiesIndividual'] },
        { key: 'most_pars', labelKey: 'panel.rows.mostPars', ids: ['most_pars_team', 'most_pars_individual'], pointsKeys: ['panel.points.mostParsTeam', 'panel.points.mostParsIndividual'] },
        { key: 'lowest_single_hole_brutto', labelKey: 'panel.rows.lowestSingleHole', ids: ['lowest_single_hole_brutto'], pointsKeys: ['panel.points.lowestSingleHole'] },
        { key: 'hardest_hole_winner', labelKey: 'panel.rows.hardestHoleWinner', ids: ['hardest_hole_winner'], pointsKeys: ['panel.points.hardestHoleWinner'], ruleKey: 'panel.rules.hardestHoleWinner' },
        { key: 'comeback_kid', labelKey: 'panel.rows.comebackKid', ids: ['comeback_kid'], pointsKeys: ['panel.points.comebackKid'], ruleKey: 'panel.rules.comebackKid' },
        { key: 'all_par_groups_birdie', labelKey: 'panel.rows.allParGroupsBirdie', ids: ['all_par_groups_birdie'], pointsKeys: ['panel.points.allParGroupsBirdie'], ruleKey: 'panel.rules.allParGroupsBirdie' },
        { key: 'even_par_round', labelKey: 'panel.rows.evenParRound', ids: ['even_par_round'], pointsKeys: ['panel.points.evenParRound'], ruleKey: 'panel.rules.evenParRound' },
        { key: 'back_to_back_birdies', labelKey: 'panel.rows.backToBackBirdies', ids: ['back_to_back_birdies'], pointsKeys: ['panel.points.backToBackBirdies'], ruleKey: 'panel.rules.backToBackBirdies' },
      ],
    },
    {
      id: 'hull',
      titleKey: 'panel.groups.hull',
      rows: [
        { key: 'hole_win', labelKey: 'panel.rows.holeWin', ids: ['hole_win'], pointsKeys: ['panel.points.holeWin'], ruleKey: 'panel.rules.holeWin' },
        { key: 'longest_drive', labelKey: 'panel.rows.longestDrive', ids: ['longest_drive'], pointsKeys: ['panel.points.longestDrive'], trailer: t('panel.adminChosen') },
        { key: 'closest_to_pin', labelKey: 'panel.rows.closestToPin', ids: ['closest_to_pin'], pointsKeys: ['panel.points.closestToPin'], trailer: t('panel.adminChosen') },
      ],
    },
    {
      id: 'achievements',
      titleKey: 'panel.groups.achievements',
      hintKey: 'panel.achievementsHint',
      rows: [
        { key: 'turkey', labelKey: 'panel.rows.turkey', ids: ['turkey'], pointsKeys: ['panel.points.turkey'], ruleKey: 'panel.rules.turkey' },
        { key: 'solid', labelKey: 'panel.rows.solid', ids: ['solid'], pointsKeys: ['panel.points.solid'], ruleKey: 'panel.rules.solid' },
        { key: 'team_all_birdied_bonus', labelKey: 'panel.rows.teamAllBirdied', ids: ['team_all_birdied_bonus'], pointsKeys: ['panel.points.teamAllBirdied'], ruleKey: 'panel.rules.teamAllBirdied' },
        { key: 'team_no_bogey_hole_coord', labelKey: 'panel.rows.teamNoBogeyHole', ids: ['team_no_bogey_hole_coord'], pointsKeys: ['panel.points.teamNoBogeyHole'], ruleKey: 'panel.rules.teamNoBogeyHole' },
      ],
    },
    {
      id: 'penalty',
      titleKey: 'panel.groups.penalty',
      rows: [
        { key: 'snowman', labelKey: 'panel.rows.snowman', ids: ['snowman'], pointsKeys: ['panel.points.snowman'], ruleKey: 'panel.rules.snowman' },
        { key: 'worst_single_hole_brutto', labelKey: 'panel.rows.worstSingleHole', ids: ['worst_single_hole_brutto'], pointsKeys: ['panel.points.worstSingleHole'], ruleKey: 'panel.rules.worstSingleHole' },
        { key: 'most_double_bogeys_individual', labelKey: 'panel.rows.mostDoubleBogeys', ids: ['most_double_bogeys_individual'], pointsKeys: ['panel.points.mostDoubleBogeys'], ruleKey: 'panel.rules.mostDoubleBogeys' },
      ],
    },
  ];

  const visibleGroups = PANEL_GROUPS.map((group) => {
    const visibleRows = group.rows.flatMap((row) => {
      if (row.key === 'longest_drive' && ldCount === 0) return [];
      if (row.key === 'closest_to_pin' && ctpCount === 0) return [];

      const activeFragments = row.ids
        .map((id, idx) => ({ id, pointsKey: row.pointsKeys[idx]! }))
        .filter((entry) => !disabledSet.has(entry.id))
        // Solo: lag-variant-fragmenter (og rene lag-rader) fyrer aldri — skjul dem.
        .filter((entry) => !(isIndividual && isTeamOnlyCategory(entry.id)));

      if (activeFragments.length === 0) return [];
      const joined = activeFragments.map((e) => t(e.pointsKey as Parameters<typeof t>[0])).join(' / ');
      // Snowman fyrer for solo, men regelteksten «hele laget …» leses feil der.
      const ruleKey =
        isIndividual && row.ruleKey === 'panel.rules.snowman'
          ? 'panel.rules.snowmanSolo'
          : row.ruleKey;
      return [{ row, pointsLabel: joined, ruleKey }];
    });
    return { group, visibleRows };
  }).filter((g) => g.visibleRows.length > 0);

  if (visibleGroups.length === 0) return null;

  return (
    <details className="group rounded-md border border-border bg-surface-2">
      <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 px-3 py-2 font-sans text-sm text-text [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-muted">
          ⓘ
        </span>
        <span className="flex-1">{t('rulesPanel')}</span>
        <span
          aria-hidden
          className="text-muted transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="space-y-3 border-t border-border px-3 py-3">
        {visibleGroups.map(({ group, visibleRows }) => (
          <section key={group.id}>
            <h3 className="mb-1 font-sans text-xs uppercase tracking-wide font-semibold text-muted">
              {t(group.titleKey as Parameters<typeof t>[0])}
              {group.hintKey && (
                <span className="ml-2 normal-case tracking-normal font-normal text-muted/80">
                  ({t(group.hintKey as Parameters<typeof t>[0])})
                </span>
              )}
            </h3>
            <ul className="space-y-1.5 font-sans text-sm text-text">
              {visibleRows.map(({ row, pointsLabel, ruleKey }) => (
                <li key={row.key} className="leading-snug">
                  <div className="flex items-baseline justify-between gap-3">
                    <span>{t(row.labelKey as Parameters<typeof t>[0])}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {pointsLabel}
                      {row.trailer ? ` ${row.trailer}` : ''}
                    </span>
                  </div>
                  {ruleKey && (
                    <p className="mt-0.5 text-xs text-muted leading-tight">
                      {t(ruleKey as Parameters<typeof t>[0])}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}

// Re-export for any future helper modules that want to import the group map.
export { CATEGORY_GROUPS, GROUP_ORDER };
export type { GroupId };
