import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  buildModeResultForGame,
  type GameForScoring,
} from '@/lib/scoring/buildModeResultForGame';
import { computeResultSummaries } from '@/lib/scoring/resultSummary';

/**
 * Beregner og persisterer per-spiller-`result_summary` på `game_players` for et
 * (nettopp) avsluttet spill (#572). Lest billig på avsluttede-spill-kortene.
 *
 * Kjører med service-role-klienten (RLS-bypass) — skriver til ALLE spilleres
 * rader, ikke bare den innloggede. Beregningen bruker `buildModeResultForGame`,
 * samme `ModeResult` som leaderboard-flaten, så kort og leaderboard aldri driver.
 *
 * **Best-effort:** all feil svelges og logges (`Promise.allSettled` + console.error),
 * akkurat som Resend-helperne — en feil her skal ALDRI blokkere at spillet
 * avsluttes. Returnerer antall spiller-rader som faktisk fikk et sammendrag.
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
    if (result === null) return 0;

    const summaries = computeResultSummaries(result);
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
