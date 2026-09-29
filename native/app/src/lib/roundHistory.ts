// #2256: runde-lista i appen — spillerens ferdige runder, én rad per spill.
//
// Lista har ett hjem fra start. Bag-taggen (#2256) regner sesongen fra den, og
// Rundedagboka (#2265) utvider de samme to filene (denne og
// `data/roundHistory.ts`) med feltene den trenger, i stedet for å skrive en ny
// spørring (AGENTS felle 4). Navnene står fast, fordi #2265-kontrakten bygger
// på dem.
//
// **Året er enhetens lokaltid.** Webben dater runder med `effectiveYear`
// (Oslo-kalender via `osloParts`), men den veien er stengt her: Hermes mangler
// tidssonene (app-spike.md). Regelen er ellers den samme: planlagt utslag,
// ellers avslutning. For en spiller i Norge gir de to samme år.
//
// **Lagets ball er ingen sin egen runde.** Når laget deler én ball
// (`modeCollapsesToTeamCard(mode, 18)`), står slagene på kapteinen, men de er
// lagets. Runden teller som runde, men gir ingen komplett brutto — samme regel
// som `getRoundScoresForGames` (#2273) bruker for «Lagrunde» på Hjem.
//
// Ren og I/O-fri (Type A). Mappingen fra snake_case bor i `data/roundHistory.ts`.
import { computeRoundScore } from '../../../../lib/games/roundScore';
import type { ResultSummary } from '../../../../lib/scoring/resultSummary';
import { modeCollapsesToTeamCard, type GameMode } from '../../../../lib/scoring/modes/types';
import { COMPLETE_ROUND_HOLES } from '../../../../lib/stats/playerStats';

/** Ett ferdig spill spilleren var med i, slik datalaget har lest det. */
export interface HistoryGameInput {
  gameId: string;
  scheduledTeeOffAt: string | null;
  endedAt: string | null;
  gameMode: GameMode;
  /** Spillerens lagrede utfall (`game_players.result_summary`). */
  resultSummary: ResultSummary | null;
}

/** Ett eget slag (`scores.strokes`, aldri null her — datalaget filtrerer). */
export interface HistoryScoreInput {
  gameId: string;
  strokes: number;
}

/** Én runde i lista. #2265 legger til feltene Rundedagboka trenger. */
export interface HistoryRound {
  gameId: string;
  /** Tidsstempelet runden dateres av (planlagt utslag, ellers avslutning). */
  date: string | null;
  /** Kalenderåret i enhetens lokaltid, `null` når runden ikke kan dateres. */
  year: number | null;
  /** Laget delte én ball: ingen egne slag, ingen komplett brutto. */
  teamBall: boolean;
  /** Antall hull med eget slag (0 for en lagball-runde). */
  holeCount: number;
  /** Brutto når alle 18 hull har eget slag, ellers `null`. */
  completeBrutto: number | null;
  resultSummary: ResultSummary | null;
}

type DatedGame = Pick<HistoryGameInput, 'scheduledTeeOffAt' | 'endedAt'>;

function roundDate(game: DatedGame): Date | null {
  const iso = game.scheduledTeeOffAt ?? game.endedAt;
  if (iso == null) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Året runden hører til, i enhetens lokaltid. `null` = kan ikke dateres. */
export function localRoundYear(game: DatedGame): number | null {
  return roundDate(game)?.getFullYear() ?? null;
}

/**
 * Spillene og de egne slagene → runde-lista, nyeste runde først og udaterte
 * sist (samme rekkefølge som webbens historikk).
 */
export function buildHistoryRounds(
  games: readonly HistoryGameInput[],
  scores: readonly HistoryScoreInput[],
): HistoryRound[] {
  const strokesByGame = new Map<string, number[]>();
  for (const score of scores) {
    const list = strokesByGame.get(score.gameId) ?? [];
    list.push(score.strokes);
    strokesByGame.set(score.gameId, list);
  }

  return games
    .map((game) => {
      const date = roundDate(game);
      const teamBall = modeCollapsesToTeamCard(game.gameMode, COMPLETE_ROUND_HOLES);
      const own = teamBall ? [] : (strokesByGame.get(game.gameId) ?? []);
      const { brutto } = computeRoundScore(own, null);
      return {
        sortKey: date?.getTime() ?? 0,
        round: {
          gameId: game.gameId,
          date: date ? (game.scheduledTeeOffAt ?? game.endedAt) : null,
          year: date?.getFullYear() ?? null,
          teamBall,
          holeCount: own.length,
          completeBrutto: own.length === COMPLETE_ROUND_HOLES ? brutto : null,
          resultSummary: game.resultSummary,
        },
      };
    })
    .sort((a, b) => b.sortKey - a.sortKey)
    .map(({ round }) => round);
}
