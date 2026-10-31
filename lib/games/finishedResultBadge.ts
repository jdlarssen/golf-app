import type { ResultSummary } from '@/lib/scoring/resultSummary';

/**
 * Presentasjons-mapping for avsluttede-spill-kortet (#572): oversetter en
 * strukturert `ResultSummary` til en i18n-nøkkel + verdier + `isWin`-flagg.
 *
 * Rent presentasjons-lag — ingen scoring, ingen locale-tekst (kortet kaller
 * `t(key, values)` selv så norsk/engelsk faller ut av next-intl-katalogene).
 * `isWin` styrer gull-accenten på kortet (champagne-gull til vinnere, dempet
 * ellers — brand-paletten).
 */
export interface FinishedResultBadge {
  /** Nøkkel under `finishedCard`-namespacet. */
  key: string;
  values?: Record<string, string | number>;
  /** True → gull-accent (egen seier). */
  isWin: boolean;
}

/**
 * #2712 (owner 31.10): a league flight played alone has no placement and no
 * win. One home for the rule: this badge («Godkjent» instead of «Du vant») and
 * every win count (`isWinningSummary` in lib/stats/clubStats.ts) read it.
 */
export function isLeagueRoundAlone(summary: ResultSummary | null, leagueFlight: boolean): boolean {
  return leagueFlight && summary?.kind === 'placement' && summary.fieldSize <= 1;
}

export function finishedResultBadge(
  summary: ResultSummary,
  opts: {
    /**
     * #2712 (owner 31.10): the game is a league flight. Played alone, it has no
     * placement («Du vant» of one); it finishes when the marker approves, so
     * the card says «Godkjent». A flight of several keeps its placement.
     */
    leagueFlight?: boolean;
  } = {},
): FinishedResultBadge {
  if (isLeagueRoundAlone(summary, opts.leagueFlight ?? false)) {
    return { key: 'result.approved', isWin: false };
  }
  switch (summary.kind) {
    case 'placement': {
      if (summary.rank === 1) {
        return {
          key: summary.isTeam ? 'result.teamWon' : 'result.youWon',
          isWin: true,
        };
      }
      return {
        key: summary.isTeam ? 'result.teamPlacement' : 'result.placement',
        values: { rank: summary.rank, fieldSize: summary.fieldSize },
        isWin: false,
      };
    }
    case 'matchplay': {
      if (summary.outcome === 'win') {
        return {
          key: 'result.matchWon',
          values: { margin: summary.margin ?? '' },
          isWin: true,
        };
      }
      if (summary.outcome === 'loss') {
        return {
          key: 'result.matchLost',
          values: { margin: summary.margin ?? '' },
          isWin: false,
        };
      }
      return { key: 'result.matchTied', isWin: false };
    }
    case 'skins': {
      // Gull kun når du faktisk leder med skins — gull for «0 skins» gir ingen mening.
      const isWin = summary.rank === 1 && summary.skins > 0;
      return {
        key: isWin ? 'result.skinsWon' : 'result.skins',
        values: { count: summary.skins },
        isWin,
      };
    }
  }
}
