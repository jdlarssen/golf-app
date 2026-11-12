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
 * #2850 (owner 12.11): a league flight has no placement and no winner, whether
 * one, two or four play in it. The league round is decided when the round
 * closes, across every flight, and the place in the league stands on the league
 * page. One home for the rule: this badge («Godkjent» instead of «2. plass av
 * 2» or «Du vant»), every win count, the boards, the podium, the share image
 * and the mail read it. #2712 had it for a flight of one; the size is gone.
 */
export function leagueFlightHasNoPlace(leagueFlight: boolean): boolean {
  return leagueFlight;
}

/** The same rule read from a stored summary: the card, the win counts. */
export function isUnplacedLeagueRound(summary: ResultSummary | null, leagueFlight: boolean): boolean {
  return summary?.kind === 'placement' && leagueFlightHasNoPlace(leagueFlight);
}

/**
 * The same rule read from a share card's model (`buildShareCardData`): the AI
 * round report's facts and the share image. An empty card (no row on the
 * podium) keeps its neutral headline.
 */
export function isUnplacedLeagueCard(
  card: { band: string; podium: readonly unknown[] },
  leagueFlight: boolean,
): boolean {
  return card.band === 'placement' && card.podium.length >= 1 && leagueFlightHasNoPlace(leagueFlight);
}

/**
 * The players a view draws without a place for a league flight (the web
 * board's `LeagueFlightResult`), or null. A flight with no active player (the
 * only one withdrew before the game was ended) is not drawn here: the view
 * keeps its own empty state.
 */
export function leagueFlightPlayers<T>(players: readonly T[], leagueFlight: boolean): readonly T[] | null {
  return players.length >= 1 && leagueFlightHasNoPlace(leagueFlight) ? players : null;
}

export function finishedResultBadge(
  summary: ResultSummary,
  opts: {
    /**
     * #2712, #2850 (owner 12.11): the game is a league flight. It has no
     * placement, alone or with others («Du vant» of one, «2. plass av 2»); it
     * finishes when the marker approves, so the card says «Godkjent».
     */
    leagueFlight?: boolean;
  } = {},
): FinishedResultBadge {
  if (isUnplacedLeagueRound(summary, opts.leagueFlight ?? false)) {
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
