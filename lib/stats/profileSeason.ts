/**
 * «Sesongen 2026» på profilen (#2256): runder, beste runde og seire for ett år.
 *
 * Tallene er ikke en ny regel. Runder og beste runde kommer fra
 * `computeSeasonStats`, den samme bøttingen som sesongoppsummeringen på
 * `/profile/historikk`, og seire telles med `isWinningSummary`, den samme
 * dommen som klubbtavla bruker. Kallstedet regner året og `completeBrutto`
 * (bare en komplett 18-hulls runde som spilleren slo selv), så denne fila
 * trenger verken Oslo-tid eller slagene.
 *
 * Ren og I/O-fri (Type A). Ingen server-import, så appen kan bruke den.
 */
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import { EMPTY_ACHIEVEMENTS } from './achievements';
import { isWinningSummary } from './clubStats';
import { computeSeasonStats } from './seasonStats';

/** Én ferdig runde, slik kallstedet har forberedt den. */
export type ProfileSeasonRound = {
  /** Kalenderåret runden hører til; `null` = udaterbar (telles ikke). */
  year: number | null;
  /** Brutto for en komplett 18-hulls runde, ellers `null` (aldri beste runde). */
  completeBrutto: number | null;
  /** Spillerens lagrede utfall (`game_players.result_summary`), eller `null`. */
  resultSummary: ResultSummary | null;
};

export type ProfileSeason = {
  /** Alle daterte ferdige runder i året, også de uten komplett brutto. */
  rounds: number;
  /** Laveste brutto over årets komplette runder, `null` når ingen er komplett. */
  bestRound: number | null;
  /** Runder i året der det lagrede utfallet er en seier. */
  wins: number;
};

export function computeProfileSeason(
  rounds: readonly ProfileSeasonRound[],
  year: number,
): ProfileSeason {
  const summary = computeSeasonStats(
    rounds.map((round) => ({
      year: round.year,
      completeBrutto: round.completeBrutto,
      achievements: EMPTY_ACHIEVEMENTS,
    })),
  ).find((season) => season.year === year);

  const wins = rounds.filter(
    (round) => round.year === year && isWinningSummary(round.resultSummary),
  ).length;

  return {
    rounds: summary?.rounds ?? 0,
    bestRound: summary?.bestRound ?? null,
    wins,
  };
}
