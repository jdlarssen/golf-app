import { useTranslations } from 'next-intl';
import type { SideCategoryId } from '@/lib/scoring/sideTournamentConfig';
import type { GroupId } from './SideTournamentView';

/** Lag-kun-kategorier som aldri fyrer i solo (alle `*_team` + de to rene
 * coord-bonusene). Brukes til å skjule dem fra regel-panelet for solo. */
function isTeamOnlyCategory(id: string): boolean {
  return (
    id.endsWith('_team') ||
    id === 'team_all_birdied_bonus' ||
    id === 'team_no_bogey_hole_coord'
  );
}

export function ScoringRulesPanel({
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
