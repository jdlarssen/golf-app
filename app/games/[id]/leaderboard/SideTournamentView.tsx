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

/** Norske etiketter for under-overskrifter (uppercase via Tailwind). */
const GROUP_LABELS: Record<GroupId, string> = {
  hovedkonkurranser: 'Hovedkonkurranser',
  skill: 'Ferdighet og sjeldenhet',
  moderate: 'Moderat',
  hull: 'Hull-konkurranser',
  achievements: 'Bragder',
  penalty: 'Minuspoeng',
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
  coursePars,
  disabledCategories,
}: Props) {
  const sorted = rankByPoints(result.teamStandings);
  const teamById = new Map(teams.map((t) => [t.teamId, t]));

  return (
    <div className="space-y-3 px-4">
      <ScoringRulesPanel
        disabledCategories={disabledCategories}
        ldCount={ldCount}
        ctpCount={ctpCount}
      />
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

/** Formaterer en bogey-fri / turkey / solid-streak til "hull X–Y" eller
 * "hull X" hvis startHole === endHole. Brukes inline i achievement-radene. */
function formatStreakRange(startHole: number, endHole: number): string {
  if (startHole === endHole) return `hull ${startHole}`;
  return `hull ${startHole}–${endHole}`;
}

/**
 * Korte regel-strenger som rendres under Turkey/Solid/Snowman-radene. Holder
 * brukeren orientert om hva som trigget achievementet uten å åpne forklar-
 * panelet på toppen. Strenger er identiske med rader i CATEGORY_INFO sin
 * `rule`-felt så det er én kanonisk kopi-kilde å holde i sync.
 */
const ACHIEVEMENT_RULES = {
  turkey_player: '3 netto-birdier på rad',
  turkey_coord: 'hele laget netto-birdie på samme 3 hull',
  solid_player: '5 netto-pars+ på rad',
  solid_coord: 'hele laget netto ≤ par på samme 5 hull',
  snowman: 'hele lagets brutto ≥ par+5 på samme hull',
} as const;

/**
 * Hovedrad + regel-subtitle, brukt for Turkey/Solid/Snowman. Subtitle er
 * `text-xs text-muted leading-tight` så den ligger tett under hovedraden uten
 * å bli en egen visuell entitet. `block` på hovedraden gir oss en kontrollert
 * margin uten å bryte ut av <li>-en.
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
  const myStanding = standings.find((s) => s.teamId === teamId);
  if (!myStanding) return null;

  const awards = myStanding.awards;
  // Tabeller, gruppert per GroupId. Hver verdi er en liste av {category, render,
  // points} så vi kan sortere innen-gruppe.
  const rowsByGroup: Record<
    GroupId,
    Array<{
      key: string;
      render: React.ReactNode;
      points: number;
      category: string;
    }>
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

  /** Henter den FØRSTE award med gitt kategori (de fleste finnes maks én
   * gang per lag; aggregerte kategorier som hole_win / turkey / solid /
   * snowman håndteres separat). */
  const findAward = (
    category: SideCategoryAward['category'],
  ): SideCategoryAward | undefined =>
    awards.find((a) => a.category === category);

  /** Hjelper for individ-rader: returnerer fornavnet til winnerUserId, eller
   * "?" hvis vi ikke finner spilleren (skal ikke skje i praksis). */
  const winnerName = (award: SideCategoryAward | undefined): string =>
    firstNameOf(award?.winnerUserId ?? null, teamById) ?? '?';

  // ─── Hovedkonkurranser ──────────────────────────────────────────────────
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

  // ─── Skill og rarity ────────────────────────────────────────────────────
  // 10. Best brutto 18
  if (awards.some((a) => a.category === 'best_brutto_18_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.bestBrutto18Team;
    push('skill', 'best_brutto_18_team', pts, 'best_brutto_18_team', (
      <>
        Best brutto totalt 18 (lag): <Pts n={pts} />
        {tieSuffix(tieMates('best_brutto_18_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'best_brutto_18_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.bestBrutto18Individual;
    const name = winnerName(findAward('best_brutto_18_individual'));
    push(
      'skill',
      'best_brutto_18_individual',
      pts,
      'best_brutto_18_individual',
      (
        <>
          Best brutto totalt 18 ({name}): <Pts n={pts} />
        </>
      ),
    );
  }
  // 13. Konge på par-3
  if (awards.some((a) => a.category === 'king_par3_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.kingPar3Team;
    push('skill', 'king_par3_team', pts, 'king_par3_team', (
      <>
        Konge på par-3 (lag): <Pts n={pts} />
        {tieSuffix(tieMates('king_par3_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'king_par3_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.kingPar3Individual;
    const name = winnerName(findAward('king_par3_individual'));
    push('skill', 'king_par3_individual', pts, 'king_par3_individual', (
      <>
        Konge på par-3 ({name}): <Pts n={pts} />
      </>
    ));
  }
  // 14. Konge på par-5
  if (awards.some((a) => a.category === 'king_par5_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.kingPar5Team;
    push('skill', 'king_par5_team', pts, 'king_par5_team', (
      <>
        Konge på par-5 (lag): <Pts n={pts} />
        {tieSuffix(tieMates('king_par5_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'king_par5_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.kingPar5Individual;
    const name = winnerName(findAward('king_par5_individual'));
    push('skill', 'king_par5_individual', pts, 'king_par5_individual', (
      <>
        Konge på par-5 ({name}): <Pts n={pts} />
      </>
    ));
  }
  // 8. Most eagles+
  if (awards.some((a) => a.category === 'most_eagles_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.mostEaglesTeam;
    push('skill', 'most_eagles_team', pts, 'most_eagles_team', (
      <>
        Flest eagles+ (lag): <Pts n={pts} />
        {tieSuffix(tieMates('most_eagles_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'most_eagles_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.mostEaglesIndividual;
    const name = winnerName(findAward('most_eagles_individual'));
    push(
      'skill',
      'most_eagles_individual',
      pts,
      'most_eagles_individual',
      (
        <>
          Flest eagles+ ({name}): <Pts n={pts} />
        </>
      ),
    );
  }
  // 15. Lengste bogey-fri streak
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
      const detail = range ? `${name}, ${len} hull ${range}` : name;
      push(
        'skill',
        'longest_bogey_free_streak',
        pts,
        'longest_bogey_free_streak',
        (
          <>
            Lengste bogey-fri ({detail}): <Pts n={pts} />
          </>
        ),
      );
    }
  }

  // ─── Moderate ───────────────────────────────────────────────────────────
  // 11. Best brutto F9
  if (awards.some((a) => a.category === 'best_brutto_f9_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.bestBruttoF9Team;
    push('moderate', 'best_brutto_f9_team', pts, 'best_brutto_f9_team', (
      <>
        Best brutto front 9 (lag): <Pts n={pts} />
        {tieSuffix(tieMates('best_brutto_f9_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'best_brutto_f9_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.bestBruttoF9Individual;
    const name = winnerName(findAward('best_brutto_f9_individual'));
    push(
      'moderate',
      'best_brutto_f9_individual',
      pts,
      'best_brutto_f9_individual',
      (
        <>
          Best brutto front 9 ({name}): <Pts n={pts} />
        </>
      ),
    );
  }
  // 12. Best brutto B9
  if (awards.some((a) => a.category === 'best_brutto_b9_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.bestBruttoB9Team;
    push('moderate', 'best_brutto_b9_team', pts, 'best_brutto_b9_team', (
      <>
        Best brutto back 9 (lag): <Pts n={pts} />
        {tieSuffix(tieMates('best_brutto_b9_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'best_brutto_b9_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.bestBruttoB9Individual;
    const name = winnerName(findAward('best_brutto_b9_individual'));
    push(
      'moderate',
      'best_brutto_b9_individual',
      pts,
      'best_brutto_b9_individual',
      (
        <>
          Best brutto back 9 ({name}): <Pts n={pts} />
        </>
      ),
    );
  }
  // 7. Most birdies
  if (awards.some((a) => a.category === 'most_birdies_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.mostBirdiesTeam;
    push('moderate', 'most_birdies_team', pts, 'most_birdies_team', (
      <>
        Flest birdier (lag): <Pts n={pts} />
        {tieSuffix(tieMates('most_birdies_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'most_birdies_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.mostBirdiesIndividual;
    const name = winnerName(findAward('most_birdies_individual'));
    push(
      'moderate',
      'most_birdies_individual',
      pts,
      'most_birdies_individual',
      (
        <>
          Flest birdier ({name}): <Pts n={pts} />
        </>
      ),
    );
  }
  // 9. Most pars+
  if (awards.some((a) => a.category === 'most_pars_team')) {
    const pts = SIDE_TOURNAMENT_POINTS.mostParsTeam;
    push('moderate', 'most_pars_team', pts, 'most_pars_team', (
      <>
        Flest pars+ (lag): <Pts n={pts} />
        {tieSuffix(tieMates('most_pars_team'))}
      </>
    ));
  }
  if (awards.some((a) => a.category === 'most_pars_individual')) {
    const pts = SIDE_TOURNAMENT_POINTS.mostParsIndividual;
    const name = winnerName(findAward('most_pars_individual'));
    push(
      'moderate',
      'most_pars_individual',
      pts,
      'most_pars_individual',
      (
        <>
          Flest pars+ ({name}): <Pts n={pts} />
        </>
      ),
    );
  }
  // 16. Lavest enkelthull
  {
    const low = findAward('lowest_single_hole_brutto');
    if (low) {
      const pts = SIDE_TOURNAMENT_POINTS.lowestSingleHoleBrutto;
      const name = winnerName(low);
      const score = low.score;
      const hole = low.holeNumber;
      const detail =
        score != null && hole != null
          ? `${name}, ${score} på hull ${hole}`
          : name;
      push(
        'moderate',
        'lowest_single_hole_brutto',
        pts,
        'lowest_single_hole_brutto',
        (
          <>
            Lavest enkelthull ({detail}): <Pts n={pts} />
          </>
        ),
      );
    }
  }

  // ─── Hull-konkurranser ──────────────────────────────────────────────────
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
      const ldName = firstNameOf(w.winnerUserId, teamById) ?? '?';
      push('hull', 'longest_drive', 2, `ld_${pos}`, (
        <>
          Longest drive #{pos} ({ldName}): <Pts n={2} />
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
      const ctpName = firstNameOf(w.winnerUserId, teamById) ?? '?';
      push('hull', 'closest_to_pin', 2, `ctp_${pos}`, (
        <>
          Closest to pin #{pos} ({ctpName}): <Pts n={2} />
        </>
      ));
    }
  }

  // ─── Achievements (positive) ────────────────────────────────────────────
  // 17. Turkey — per-spiller (stackable) + lag-koord-bonus (egen rad).
  // Subtitle-regelen rendres under hovedraden så brukeren slipper å gjette
  // hva «Turkey» betyr. Per-spiller-versjon: «3 netto-birdier på rad»;
  // lag-koord-versjon: «hele laget netto-birdie på samme 3 hull».
  const turkeyAwards = awards.filter((a) => a.category === 'turkey');
  for (const t of turkeyAwards) {
    const pts = t.points;
    const start = t.streakStartHole;
    const end = t.streakEndHole;
    const range =
      start != null && end != null ? formatStreakRange(start, end) : null;
    if (t.coordBonus) {
      // Lag-koord-bonus: 4p × N (alle teamets medlemmer hadde birdie samme 3-hull)
      const key = `turkey_coord_${start ?? '?'}_${end ?? '?'}`;
      push('achievements', 'turkey', pts, key, (
        <AchievementRow
          rule={ACHIEVEMENT_RULES.turkey_coord}
          main={
            <>
              Turkey lag-bonus{range ? ` (${range})` : ''}: <Pts n={pts} />
            </>
          }
        />
      ));
    } else {
      const name = firstNameOf(t.winnerUserId ?? null, teamById) ?? '?';
      const detail = range ? `${name}, ${range}` : name;
      const key = `turkey_${t.winnerUserId ?? '?'}_${start ?? '?'}_${end ?? '?'}`;
      push('achievements', 'turkey', pts, key, (
        <AchievementRow
          rule={ACHIEVEMENT_RULES.turkey_player}
          main={
            <>
              Turkey ({detail}): <Pts n={pts} />
            </>
          }
        />
      ));
    }
  }
  // 18. Solid — per-spiller (stackable) + lag-koord-bonus (egen rad). Samme
  // subtitle-mønster som Turkey, ulike strenger.
  const solidAwards = awards.filter((a) => a.category === 'solid');
  for (const s of solidAwards) {
    const pts = s.points;
    const start = s.streakStartHole;
    const end = s.streakEndHole;
    const range =
      start != null && end != null ? formatStreakRange(start, end) : null;
    if (s.coordBonus) {
      const key = `solid_coord_${start ?? '?'}_${end ?? '?'}`;
      push('achievements', 'solid', pts, key, (
        <AchievementRow
          rule={ACHIEVEMENT_RULES.solid_coord}
          main={
            <>
              Solid lag-bonus{range ? ` (${range})` : ''}: <Pts n={pts} />
            </>
          }
        />
      ));
    } else {
      const name = firstNameOf(s.winnerUserId ?? null, teamById) ?? '?';
      const detail = range ? `${name}, ${range}` : name;
      const key = `solid_${s.winnerUserId ?? '?'}_${start ?? '?'}_${end ?? '?'}`;
      push('achievements', 'solid', pts, key, (
        <AchievementRow
          rule={ACHIEVEMENT_RULES.solid_player}
          main={
            <>
              Solid ({detail}): <Pts n={pts} />
            </>
          }
        />
      ));
    }
  }

  // ─── Penalty ────────────────────────────────────────────────────────────
  // 19. Snowman — én rad per hull der hele laget hadde brutto ≥ par+5.
  // `score`-feltet på award er over-par-delta (worstGross − par), så vi
  // bruker den direkte og fall-backer til coursePars[h-1] hvis feltet av en
  // eller annen grunn mangler. Poeng-pillen rendres med danger-fargen
  // (muted brick #b8463e) så Snowman står ut visuelt uten å skrike. Subtitle
  // forklarer triggeren — samme tone som Turkey/Solid, fargen på poeng-pillen
  // bærer den negative valensen alene.
  const snowmanAwards = awards.filter((a) => a.category === 'snowman');
  for (const sw of snowmanAwards) {
    const pts = sw.points; // -2
    const hole = sw.holeNumber;
    const overDelta = sw.score;
    let detail = '?';
    if (hole != null && overDelta != null) {
      detail = `hele laget +${overDelta} på hull ${hole}`;
    } else if (hole != null) {
      // Fallback: ingen lagret score — bruk par fra coursePars hvis tilgjengelig.
      const par = coursePars[hole - 1];
      detail = par != null ? `hele laget på hull ${hole}` : `hull ${hole}`;
    }
    const key = `snowman_${hole ?? '?'}`;
    push('penalty', 'snowman', pts, key, (
      <AchievementRow
        rule={ACHIEVEMENT_RULES.snowman}
        main={
          <>
            Snowman ({detail}):{' '}
            <span className="tabular-nums text-danger">{pts}p</span>
          </>
        }
      />
    ));
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
        return <GroupSection key={group} group={group} rows={rows} />;
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
  // Penalty-gruppen får varselstone (text-danger = muted brick #b8463e) på
  // under-overskriften så Snowman står ut visuelt uten å skrike rødt — mer
  // som et "hei, dette skjedde"-notat enn en alarm.
  const headerClass =
    group === 'penalty'
      ? 'mb-1 text-xs uppercase tracking-wide font-semibold text-danger'
      : 'mb-1 text-xs uppercase tracking-wide font-semibold text-muted';
  return (
    <section>
      <h3 className={headerClass}>{GROUP_LABELS[group]}</h3>
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

// ─── Slik gis poengene-panel ─────────────────────────────────────────────

/**
 * Panel-spesifikk gruppe-id (snowman puttes under «Achievements» her, mens
 * team-expand-visningen holder den i en egen «Penalty»-gruppe med rød tone).
 * Holdes lokalt — ikke samme rolle som GROUP_ORDER/GROUP_LABELS over.
 */
type PanelGroupId =
  | 'hovedkonkurranser'
  | 'skill'
  | 'moderate'
  | 'hull'
  | 'achievements';

/**
 * En rad i forklar-panelet. `ids` peker på 1–2 SideCategoryIds — for koblede
 * dual-versjon-kategorier (f.eks. `most_birdies_team` + `most_birdies_individual`)
 * styres begge av samme rad, og pointsLabel justerer seg hvis én av dem er
 * skrudd av i `disabledCategories`. Matcher koblings-mønsteret i
 * SideCategoriesPicker.
 *
 * `rule` er en valgfri kort forklaring som rendres som muted-tekst inline med
 * pointsLabel — kun for kategorier som ikke er åpenbare fra navnet alene.
 */
type PanelRow = {
  key: string;
  label: string;
  ids: readonly SideCategoryId[];
  /**
   * Points-strenger per id i samme rekkefølge som `ids`. For solo-rader er
   * det én entry. For dual-versjon-rader er det to («4p lag» + «2p individ»).
   * Joines med « / » når begge er aktive; vises alene når kun én er aktiv.
   */
  pointsPerId: readonly string[];
  /** Valgfri trailing-tekst etter pointsLabel — f.eks. «(admin-valgt)». */
  trailer?: string;
  /** Valgfri regel-tekst rendret som muted-paragraf under label-raden. */
  rule?: string;
};

type PanelGroup = {
  id: PanelGroupId;
  title: string;
  /** Valgfri tagline ved siden av tittelen — f.eks. for Achievements. */
  hint?: string;
  rows: readonly PanelRow[];
};

/**
 * Strukturen som driver «Slik gis poengene»-panelet. Holdes inline i denne
 * fila siden den kun brukes her, og slipper en bredere refactor av
 * scoring-konfig-modulen. SideCategoriesPicker har en parallel struktur for
 * admin-flyten — endrer du strenger her, sjekk om picker-en også bør oppdateres.
 */
const PANEL_GROUPS: readonly PanelGroup[] = [
  {
    id: 'hovedkonkurranser',
    title: 'Hovedkonkurranser',
    rows: [
      {
        key: 'best_netto_18',
        label: 'Beste nettototalt 18',
        ids: ['best_netto_18'],
        pointsPerId: ['10p'],
      },
      {
        key: 'best_netto_f9',
        label: 'Beste nettofront 9',
        ids: ['best_netto_f9'],
        pointsPerId: ['5p'],
      },
      {
        key: 'best_netto_b9',
        label: 'Beste nettoback 9',
        ids: ['best_netto_b9'],
        pointsPerId: ['5p'],
      },
    ],
  },
  {
    id: 'skill',
    title: 'Ferdighet og sjeldenhet',
    rows: [
      {
        key: 'best_brutto_18',
        label: 'Beste bruttototalt 18',
        ids: ['best_brutto_18_team', 'best_brutto_18_individual'],
        pointsPerId: ['4p lag', '2p individ'],
      },
      {
        key: 'king_par3',
        label: 'Konge på par-3',
        ids: ['king_par3_team', 'king_par3_individual'],
        pointsPerId: ['4p lag', '2p individ'],
        rule: 'best sum på alle par-3-hull',
      },
      {
        key: 'king_par5',
        label: 'Konge på par-5',
        ids: ['king_par5_team', 'king_par5_individual'],
        pointsPerId: ['4p lag', '2p individ'],
        rule: 'best sum på alle par-5-hull',
      },
      {
        key: 'most_eagles',
        label: 'Flest eagles+',
        ids: ['most_eagles_team', 'most_eagles_individual'],
        pointsPerId: ['4p lag', '2p individ'],
      },
      {
        key: 'longest_bogey_free_streak',
        label: 'Lengste bogey-fri rekke',
        ids: ['longest_bogey_free_streak'],
        pointsPerId: ['4p'],
        rule: 'lengste sammenhengende netto ≤ par',
      },
    ],
  },
  {
    id: 'moderate',
    title: 'Moderat',
    rows: [
      {
        key: 'best_brutto_f9',
        label: 'Beste bruttofront 9',
        ids: ['best_brutto_f9_team', 'best_brutto_f9_individual'],
        pointsPerId: ['2p lag', '1p individ'],
      },
      {
        key: 'best_brutto_b9',
        label: 'Beste bruttoback 9',
        ids: ['best_brutto_b9_team', 'best_brutto_b9_individual'],
        pointsPerId: ['2p lag', '1p individ'],
      },
      {
        key: 'most_birdies',
        label: 'Flest birdier',
        ids: ['most_birdies_team', 'most_birdies_individual'],
        pointsPerId: ['2p lag', '1p individ'],
      },
      {
        key: 'most_pars',
        label: 'Flest pars+',
        ids: ['most_pars_team', 'most_pars_individual'],
        pointsPerId: ['2p lag', '1p individ'],
      },
      {
        key: 'lowest_single_hole_brutto',
        label: 'Lavest enkelthull brutto',
        ids: ['lowest_single_hole_brutto'],
        pointsPerId: ['2p'],
      },
    ],
  },
  {
    id: 'hull',
    title: 'Hull-konkurranser',
    rows: [
      {
        key: 'hole_win',
        label: 'Hole-win',
        ids: ['hole_win'],
        pointsPerId: ['2p per hull'],
        rule: 'kun alene-vinner',
      },
      {
        key: 'longest_drive',
        label: 'Longest drive',
        ids: ['longest_drive'],
        pointsPerId: ['2p per vinner'],
        trailer: '(admin-valgt)',
      },
      {
        key: 'closest_to_pin',
        label: 'Closest to pin',
        ids: ['closest_to_pin'],
        pointsPerId: ['2p per vinner'],
        trailer: '(admin-valgt)',
      },
    ],
  },
  {
    id: 'achievements',
    title: 'Bragder',
    hint: 'kan stables, kan utløses flere ganger samme runde',
    rows: [
      {
        key: 'turkey',
        label: 'Turkey',
        ids: ['turkey'],
        pointsPerId: ['4p per spiller + 4p × N lag-bonus'],
        rule: '3 netto-birdier på rad. Lag-bonus utløses om hele laget klarer det på samme 3 hull.',
      },
      {
        key: 'solid',
        label: 'Solid',
        ids: ['solid'],
        pointsPerId: ['2p per spiller + 2p × N lag-bonus'],
        rule: '5 netto-pars+ på rad. Lag-bonus utløses om hele laget klarer det på samme 5 hull.',
      },
      {
        key: 'snowman',
        label: 'Snowman',
        ids: ['snowman'],
        pointsPerId: ['−2p per hull'],
        trailer: '(minuspoeng)',
        rule: 'hele lagets brutto ≥ par+5 på samme hull',
      },
    ],
  },
] as const;

/**
 * «Slik gis poengene»-panel — collapsed by default, ekspanderes av brukeren
 * for å forstå hvordan kategoriene gir poeng. Rendrer kun de aktive (ikke-
 * disabled) kategoriene så panelet alltid speiler regelsettet for denne runden.
 *
 * For koblede dual-versjon-rader (f.eks. «Flest birdier») hides hele raden om
 * begge versjonene er av; om kun én er av, vises bare den gjenværende
 * versjonens points-fragment.
 *
 * LD/CTP-slots styres av tellerne på spillet, ikke av `disabledCategories`,
 * så de filtreres på `ldCount`/`ctpCount` i stedet for disabled-set.
 */
function ScoringRulesPanel({
  disabledCategories,
  ldCount,
  ctpCount,
}: {
  disabledCategories: readonly SideCategoryId[];
  ldCount: number;
  ctpCount: number;
}) {
  const disabledSet = new Set<SideCategoryId>(disabledCategories);

  // Resolve hvilke grupper og rader som faktisk skal vises.
  const visibleGroups = PANEL_GROUPS.map((group) => {
    const visibleRows = group.rows.flatMap((row) => {
      // Hull-konkurranser har egen filter-logikk for LD/CTP-slots.
      if (row.key === 'longest_drive' && ldCount === 0) return [];
      if (row.key === 'closest_to_pin' && ctpCount === 0) return [];

      // Filtrer points-fragmenter mot disabled-set. Hver id i `ids` korresponderer
      // til samme indeks i `pointsPerId`. Filtrerer ut id-er som er disabled.
      const activeFragments = row.ids
        .map((id, idx) => ({ id, points: row.pointsPerId[idx] }))
        .filter((entry) => !disabledSet.has(entry.id));

      if (activeFragments.length === 0) return [];
      const joined = activeFragments.map((e) => e.points).join(' / ');
      return [{ row, pointsLabel: joined }];
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
        <span className="flex-1">Slik gis poengene</span>
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
              {group.title}
              {group.hint && (
                <span className="ml-2 normal-case tracking-normal font-normal text-muted/80">
                  ({group.hint})
                </span>
              )}
            </h3>
            <ul className="space-y-1.5 font-sans text-sm text-text">
              {visibleRows.map(({ row, pointsLabel }) => (
                <li key={row.key} className="leading-snug">
                  <div className="flex items-baseline justify-between gap-3">
                    <span>{row.label}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {pointsLabel}
                      {row.trailer ? ` ${row.trailer}` : ''}
                    </span>
                  </div>
                  {row.rule && (
                    <p className="mt-0.5 text-xs text-muted leading-tight">
                      {row.rule}
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
export { CATEGORY_GROUPS, GROUP_ORDER, GROUP_LABELS };
export type { GroupId };
