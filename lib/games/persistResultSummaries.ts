import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  buildModeResultForGame,
  type GameForScoring,
} from '@/lib/scoring/buildModeResultForGame';
import {
  computeResultSummaries,
  type ResultSummary,
} from '@/lib/scoring/resultSummary';

/**
 * Beregner og persisterer per-spiller-`result_summary` på `game_players` for et
 * (nettopp) avsluttet spill (#572). Lest billig på avsluttede-spill-kortene.
 *
 * Kjører med service-role-klienten (RLS-bypass) — skriver til ALLE spilleres
 * rader, ikke bare den innloggede. Beregningen bruker `buildModeResultForGame`,
 * samme `ModeResult` som leaderboard-flaten, så kort og leaderboard aldri driver.
 *
 * Spillere uten et meningsfullt utfall får `null`, også de som hadde et fra før
 * (#2213: en spiller som trekkes etter gjenåpning skal ikke beholde gammel
 * plassering). Kaster lesingen, røres ingenting.
 *
 * **Best-effort:** all feil svelges og logges (`Promise.allSettled` + console.error),
 * akkurat som Resend-helperne — en feil her skal ALDRI blokkere at spillet
 * avsluttes. Returnerer antall spiller-rader som faktisk fikk et sammendrag
 * (nullingen telles ikke med).
 *
 * Brukes av begge ende-spill-actionene (`endGame`, `endGameWithSideWinners`) og
 * av backfill-scriptet (`scripts/backfillResultSummaries.ts`).
 */
export async function persistResultSummaries(
  game: GameForScoring,
): Promise<number> {
  try {
    const admin = getAdminClient();
    const result = await buildModeResultForGame(admin, game);
    const summaries =
      result === null
        ? new Map<string, ResultSummary>()
        : computeResultSummaries(result);

    // Runs before the writes, so it could never null a row written below.
    await clearStaleSummaries(admin, game.id, Array.from(summaries.keys()));
    if (summaries.size === 0) return 0;

    const writes = await Promise.allSettled(
      Array.from(summaries.entries()).map(([userId, summary]) =>
        admin
          .from('game_players')
          .update({ result_summary: summary })
          .eq('game_id', game.id)
          .eq('user_id', userId)
          .then(({ error }) => {
            if (error) throw error;
          }),
      ),
    );

    let written = 0;
    for (const w of writes) {
      if (w.status === 'fulfilled') {
        written += 1;
      } else {
        console.error('[persistResultSummaries] row write failed', {
          gameId: game.id,
          reason: w.reason,
        });
      }
    }
    return written;
  } catch (err) {
    console.error('[persistResultSummaries] failed', { gameId: game.id, err });
    return 0;
  }
}

/**
 * #2213 (D6): nulls every stored summary in the game except the ranked
 * players', so a player who dropped out of the ranking (withdrawn after a
 * reopen, or no result at all) loses the old placement. Best-effort: an error
 * is logged, never thrown.
 */
async function clearStaleSummaries(
  admin: ReturnType<typeof getAdminClient>,
  gameId: string,
  rankedUserIds: string[],
): Promise<void> {
  let query = admin
    .from('game_players')
    .update({ result_summary: null })
    .eq('game_id', gameId)
    .not('result_summary', 'is', null);
  if (rankedUserIds.length > 0) {
    query = query.not('user_id', 'in', `(${rankedUserIds.join(',')})`);
  }
  // 0 rows is legal (nothing stale to clear), so no expectAffected (trap 2).
  const { error } = await query;
  if (error) {
    console.error('[persistResultSummaries] stale-summary cleanup failed', {
      gameId,
      error,
    });
  }
}
