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
import { ScoringRulesPanel } from './SideTournamentRulesPanel';

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
 * Simple dual-variant award pairs (lag + individuell) som følger ÉN rigid mal:
 * lag-varianten viser `tieSuffix`, individ-varianten viser vinnerens fornavn.
 * Rekkefølgen her ER den nåværende emisjons-rekkefølgen innen hver gruppe —
 * IKKE sorter eller grupper om (par-4 ligger bevisst etter eagles, ikke ved
 * par-3/par-5). Bespoke kategorier (streak/score/penalty m.fl.) hører ikke
 * hjemme her og emiteres fortsatt eksplisitt.
 *
 * Den endelige visnings-rekkefølgen avgjøres uansett av per-gruppe-sorteringen
 * (poeng desc, deretter category), så denne lista styrer kun innsettings-
 * rekkefølgen — men holdes i emisjons-rekkefølge for et rent, etterprøvbart
 * diff mot karakteriserings-snapshotet (#812).
 */
type SimpleDualAward = {
  group: GroupId;
  teamCategory: string;
  individualCategory: string;
  teamPointsKey: keyof typeof SIDE_TOURNAMENT_POINTS;
  individualPointsKey: keyof typeof SIDE_TOURNAMENT_POINTS;
  /** Nøkkel under `awards.*` for lag-varianten (ingen interpolering). */
  teamI18nKey: string;
  /** Nøkkel under `awards.*` for individ-varianten (interpolerer `{name}`). */
  individualI18nKey: string;
};

const SIMPLE_DUAL_AWARDS: readonly SimpleDualAward[] = [
  // ─── Skill og rarity (4p lag / 2p individ) ──────────────────────────────
  {
    group: 'skill',
    teamCategory: 'best_brutto_18_team',
    individualCategory: 'best_brutto_18_individual',
    teamPointsKey: 'bestBrutto18Team',
    individualPointsKey: 'bestBrutto18Individual',
    teamI18nKey: 'bestBrutto18Team',
    individualI18nKey: 'bestBrutto18Individual',
  },
  {
    group: 'skill',
    teamCategory: 'king_par3_team',
    individualCategory: 'king_par3_individual',
    teamPointsKey: 'kingPar3Team',
    individualPointsKey: 'kingPar3Individual',
    teamI18nKey: 'kingPar3Team',
    individualI18nKey: 'kingPar3Individual',
  },
  {
    group: 'skill',
    teamCategory: 'king_par5_team',
    individualCategory: 'king_par5_individual',
    teamPointsKey: 'kingPar5Team',
    individualPointsKey: 'kingPar5Individual',
    teamI18nKey: 'kingPar5Team',
    individualI18nKey: 'kingPar5Individual',
  },
  {
    group: 'skill',
    teamCategory: 'most_eagles_team',
    individualCategory: 'most_eagles_individual',
    teamPointsKey: 'mostEaglesTeam',
    individualPointsKey: 'mostEaglesIndividual',
    teamI18nKey: 'mostEaglesTeam',
    individualI18nKey: 'mostEaglesIndividual',
  },
  // v1.19.0 — King par-4 (ligger bevisst etter eagles)
  {
    group: 'skill',
    teamCategory: 'king_par4_team',
    individualCategory: 'king_par4_individual',
    teamPointsKey: 'kingPar4Team',
    individualPointsKey: 'kingPar4Individual',
    teamI18nKey: 'kingPar4Team',
    individualI18nKey: 'kingPar4Individual',
  },
  // v1.19.0 — Most albatrosses
  {
    group: 'skill',
    teamCategory: 'most_albatrosses_team',
    individualCategory: 'most_albatrosses_individual',
    teamPointsKey: 'mostAlbatrossesTeam',
    individualPointsKey: 'mostAlbatrossesIndividual',
    teamI18nKey: 'mostAlbatrossesTeam',
    individualI18nKey: 'mostAlbatrossesIndividual',
  },
  // v1.19.0 — Most hole-in-ones
  {
    group: 'skill',
    teamCategory: 'most_hole_in_ones_team',
    individualCategory: 'most_hole_in_ones_individual',
    teamPointsKey: 'mostHoleInOnesTeam',
    individualPointsKey: 'mostHoleInOnesIndividual',
    teamI18nKey: 'mostHoleInOnesTeam',
    individualI18nKey: 'mostHoleInOnesIndividual',
  },
  // ─── Moderate (2p lag / 1p individ) ─────────────────────────────────────
  {
    group: 'moderate',
    teamCategory: 'best_brutto_f9_team',
    individualCategory: 'best_brutto_f9_individual',
    teamPointsKey: 'bestBruttoF9Team',
    individualPointsKey: 'bestBruttoF9Individual',
    teamI18nKey: 'bestBruttoF9Team',
    individualI18nKey: 'bestBruttoF9Individual',
  },
  {
    group: 'moderate',
    teamCategory: 'best_brutto_b9_team',
    individualCategory: 'best_brutto_b9_individual',
    teamPointsKey: 'bestBruttoB9Team',
    individualPointsKey: 'bestBruttoB9Individual',
    teamI18nKey: 'bestBruttoB9Team',
    individualI18nKey: 'bestBruttoB9Individual',
  },
  {
    group: 'moderate',
    teamCategory: 'most_birdies_team',
    individualCategory: 'most_birdies_individual',
    teamPointsKey: 'mostBirdiesTeam',
    individualPointsKey: 'mostBirdiesIndividual',
    teamI18nKey: 'mostBirdiesTeam',
    individualI18nKey: 'mostBirdiesIndividual',
  },
  {
    group: 'moderate',
    teamCategory: 'most_pars_team',
    individualCategory: 'most_pars_individual',
    teamPointsKey: 'mostParsTeam',
    individualPointsKey: 'mostParsIndividual',
    teamI18nKey: 'mostParsTeam',
    individualI18nKey: 'mostParsIndividual',
  },
];

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

  /**
   * Emits the lag + individuell rows for every {@link SIMPLE_DUAL_AWARDS} entry
   * in a given group, in config order. Each entry fires its lag-variant first
   * (med `tieSuffix`), så individ-varianten (med vinner-fornavn) — identisk med
   * den tidligere håndskrevne to-blokk-malen. Tomme varianter hoppes over.
   */
  const pushSimpleDualAwards = (group: GroupId) => {
    for (const def of SIMPLE_DUAL_AWARDS) {
      if (def.group !== group) continue;
      if (awards.some((aw) => aw.category === def.teamCategory)) {
        const pts = SIDE_TOURNAMENT_POINTS[def.teamPointsKey];
        push(group, def.teamCategory, pts, def.teamCategory, (
          <>
            {t(`awards.${def.teamI18nKey}` as Parameters<typeof t>[0])}{' '}
            <Pts n={pts} />
            {tieSuffix(tieMates(def.teamCategory))}
          </>
        ));
      }
      if (awards.some((aw) => aw.category === def.individualCategory)) {
        const pts = SIDE_TOURNAMENT_POINTS[def.individualPointsKey];
        const name = winnerName(
          findAward(def.individualCategory as SideCategoryAward['category']),
        );
        push(group, def.individualCategory, pts, def.individualCategory, (
          <>
            {t(`awards.${def.individualI18nKey}` as Parameters<typeof t>[0], {
              name,
            })}{' '}
            <Pts n={pts} />
          </>
        ));
      }
    }
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
  // Simple dual-variant pairs (best_brutto_18, king_par3/4/5, most_eagles,
  // most_albatrosses, most_hole_in_ones) — emitted in config order via the
  // shared loop. King par-4 sits deliberately after eagles (see config).
  pushSimpleDualAwards('skill');
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
  // Simple dual-variant pairs (best_brutto_f9, best_brutto_b9, most_birdies,
  // most_pars) — emitted in config order via the shared loop.
  pushSimpleDualAwards('moderate');
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

// Re-export for any future helper modules that want to import the group order.
export { GROUP_ORDER };
export type { GroupId };
