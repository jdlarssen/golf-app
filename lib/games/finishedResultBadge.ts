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

export function finishedResultBadge(summary: ResultSummary): FinishedResultBadge {
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
      // Gull kun når du faktisk leder med skins — «🥇 0 skins» gir ingen mening.
      const isWin = summary.rank === 1 && summary.skins > 0;
      return {
        key: isWin ? 'result.skinsWon' : 'result.skins',
        values: { count: summary.skins },
        isWin,
      };
    }
  }
}
