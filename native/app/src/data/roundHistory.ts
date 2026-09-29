// #2256: spørringen bak runde-lista (`lib/roundHistory.ts`).
//
// Filtrene er webbens (`app/[locale]/profile/historikk/page.tsx`): egne
// `game_players`-rader i ferdige spill, uten avledede spill (#1441 — et avledet
// spill har ingen egne slag, og runden står alt under verten), og så egne slag
// som ikke er null. Anon-klienten leser selv: egne rader er synlige gjennom
// RLS, så ingen serverrute trengs.
//
// Slagene hentes sidevis (#1894): en aktiv spiller kan fort ha mer enn 1 000
// slag på et år, og PostgREST kutter svaret uten å si fra.
//
// Ingen cache: uten nett står profilens feillinje som før, og flisene vises
// ikke. #2265 utvider fila (alle år, baner, tee-er og putter).
import { selectAllRows } from '../../../../lib/supabase/selectAllRows';
import type { ResultSummary } from '../../../../lib/scoring/resultSummary';
import type { GameMode } from '../../../../lib/scoring/modes/types';
import {
  buildHistoryRounds,
  localRoundYear,
  type HistoryGameInput,
  type HistoryRound,
} from '../lib/roundHistory';
import { supabase } from '../supabase';

interface HistoryRow {
  game_id: string;
  result_summary: ResultSummary | null;
  games: {
    id: string;
    scheduled_tee_off_at: string | null;
    ended_at: string | null;
    game_mode: string;
  };
}

const HISTORY_SELECT =
  'game_id, result_summary, games!inner(id, scheduled_tee_off_at, ended_at, game_mode)';

export interface RoundHistoryOptions {
  /**
   * Bare runder fra dette året (enhetens lokaltid), og slag bare for dem.
   * Utelatt = alle år. Bag-taggen trenger ett år, og slipper da å laste
   * slagene for alle rundene spilleren noen gang har spilt.
   */
  year?: number;
}

/**
 * Spillerens ferdige runder, nyeste først. Kaster når en av spørringene
 * feiler — kalleren avgjør hva skjermen viser da.
 */
export async function fetchRoundHistory(
  userId: string,
  options: RoundHistoryOptions = {},
): Promise<HistoryRound[]> {
  const { data, error } = await supabase
    .from('game_players')
    .select(HISTORY_SELECT)
    .eq('user_id', userId)
    .eq('games.status', 'finished')
    .is('games.source_game_id', null)
    .returns<HistoryRow[]>();
  if (error) throw new Error(error.message);

  const games: HistoryGameInput[] = (data ?? []).map((row) => ({
    gameId: row.games.id,
    scheduledTeeOffAt: row.games.scheduled_tee_off_at,
    endedAt: row.games.ended_at,
    // Enumet i basen er `GameMode`-unionen; PostgREST gir den som streng.
    gameMode: row.games.game_mode as GameMode,
    resultSummary: row.result_summary ?? null,
  }));
  const wanted =
    options.year == null ? games : games.filter((game) => localRoundYear(game) === options.year);
  if (wanted.length === 0) return [];

  const scores = await selectAllRows(
    (from, to) =>
      supabase
        .from('scores')
        .select('game_id, strokes')
        .eq('user_id', userId)
        .in(
          'game_id',
          wanted.map((game) => game.gameId),
        )
        .not('strokes', 'is', null)
        .order('id')
        .range(from, to),
    'fetchRoundHistory',
  );

  return buildHistoryRounds(
    wanted,
    scores
      .filter((row): row is { game_id: string; strokes: number } => row.strokes != null)
      .map((row) => ({ gameId: row.game_id, strokes: row.strokes })),
  );
}
