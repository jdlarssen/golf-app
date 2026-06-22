import type { ResultSummary } from '@/lib/scoring/resultSummary';

/**
 * Aggregering for den globale «Klubbstatistikker»-tavla (#887).
 *
 * Sannhetskilden for hvem som vant et spill er det allerede lagrede, modus-riktige
 * `game_players.result_summary` (#572) — IKKE en netto-best-ball-recompute. Disse
 * rene helperne teller vinnere og deltakelse fra de lagrede utfallene; bare spill
 * uten lagret utfall (pre-#572 / feilet persist) faller tilbake til motoren, og
 * vinnerne for dem mates inn via `fallbackWinnersByGameId`.
 */

/**
 * Vant denne spilleren spillet sitt? Dekker alle tre `ResultSummary`-formene
 * mode-naturlig: placement #1 (individ + lag), matchplay-seier, flest skins.
 * `null`/ukjent form vinner aldri (defensiv ved framtidig drift).
 */
export function isWinningSummary(summary: ResultSummary | null): boolean {
  if (summary == null) return false;
  switch (summary.kind) {
    case 'placement':
      return summary.rank === 1;
    case 'matchplay':
      return summary.outcome === 'win';
    case 'skins':
      return summary.rank === 1;
    default:
      return false;
  }
}

/** Én spillers rad i et ferdig spill, slik statistikk-siden leser den. */
export type StatPlayerRow = {
  userId: string;
  name: string | null;
  /** `withdrawn_at` — satt ⇒ spilleren trakk seg, utelates helt. */
  withdrawnAt: string | null;
  /** Lagret per-modus-utfall (#572); `null` for pre-#572 / feilet persist. */
  resultSummary: ResultSummary | null;
};

export type GameAggregation = {
  /** Ikke-trukne spillere — teller i «Mest aktive». */
  participants: string[];
  /** Vinnere utledet fra lagrede summaries (tom når `needsFallback`). */
  winners: string[];
  /**
   * `true` når INGEN spiller har et lagret summary og minst én er aktiv — da må
   * kallstedet recompute via `buildModeResultForGame`. Et spill der minst én
   * spiller har et lagret utfall stoler vi på (ingen recompute).
   */
  needsFallback: boolean;
};

/** Aggreger ett ferdig spill fra dets `game_players`-rader. */
export function aggregateFinishedGame(players: StatPlayerRow[]): GameAggregation {
  const active = players.filter((p) => p.withdrawnAt == null);
  const participants = active.map((p) => p.userId);
  const winners = active
    .filter((p) => isWinningSummary(p.resultSummary))
    .map((p) => p.userId);
  const needsFallback =
    active.length > 0 && players.every((p) => p.resultSummary == null);
  return { participants, winners, needsFallback };
}

/** Ett ferdig spill med spillerne sine, inn til `tallyClubStats`. */
export type FinishedGameForTally = {
  id: string;
  players: StatPlayerRow[];
};

export type ClubStatTally = {
  winnerCounts: Map<string, number>;
  participationCounts: Map<string, number>;
};

/**
 * Teller opp vinnere og deltakelse over alle ferdige spill.
 *
 * `fallbackWinnersByGameId` brukes KUN for spill der `needsFallback` er sant
 * (kallstedet har da kjørt `buildModeResultForGame` → `computeResultSummaries`
 * for disse, og motoren ekskluderer allerede trukne spillere). For spill med
 * lagrede summaries ignoreres fallback-mappen.
 */
export function tallyClubStats(
  games: FinishedGameForTally[],
  fallbackWinnersByGameId: ReadonlyMap<string, ReadonlyArray<string>>,
): ClubStatTally {
  const winnerCounts = new Map<string, number>();
  const participationCounts = new Map<string, number>();

  for (const game of games) {
    const { participants, winners, needsFallback } = aggregateFinishedGame(
      game.players,
    );

    for (const userId of participants) {
      participationCounts.set(userId, (participationCounts.get(userId) ?? 0) + 1);
    }

    const winnerIds = needsFallback
      ? (fallbackWinnersByGameId.get(game.id) ?? [])
      : winners;
    for (const userId of winnerIds) {
      winnerCounts.set(userId, (winnerCounts.get(userId) ?? 0) + 1);
    }
  }

  return { winnerCounts, participationCounts };
}
