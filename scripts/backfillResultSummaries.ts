/**
 * Engangs-backfill av `game_players.result_summary` for spill som ble avsluttet
 * FØR #572 (de har `result_summary = null` og viser 🏆-fallback på kortet).
 *
 * Bruker `persistResultSummaries` — nøyaktig samme beregning som `endGame` —
 * så backfill og live-flyt aldri driver fra hverandre. Idempotent: kjør den så
 * mange ganger du vil, hver kjøring overskriver trygt.
 *
 * Kjør fra repo-roten med service-role-env (samme nøkler som prod bruker):
 *
 *   npx tsx --env-file=.env.local scripts/backfillResultSummaries.ts
 *
 * Krever `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` i miljøet.
 */
import { getAdminClient } from '@/lib/supabase/admin';
import { persistResultSummaries } from '@/lib/games/persistResultSummaries';
import type {
  GameMode,
  GameModeConfig,
} from '@/lib/scoring/modes/types';

interface FinishedGameRow {
  id: string;
  game_mode: GameMode;
  mode_config: GameModeConfig;
  course_id: string;
}

async function main() {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from('games')
    .select('id, game_mode, mode_config, course_id')
    .eq('status', 'finished')
    .returns<FinishedGameRow[]>();

  if (error) {
    console.error('[backfill] could not list finished games', error);
    process.exitCode = 1;
    return;
  }

  const games = data ?? [];
  console.log(`[backfill] ${games.length} finished game(s) to process`);

  let totalRows = 0;
  for (const game of games) {
    const written = await persistResultSummaries(game);
    totalRows += written;
    console.log(`[backfill] ${game.id} (${game.game_mode}) → ${written} row(s)`);
  }

  console.log(`[backfill] done — ${totalRows} player row(s) updated`);
}

main().catch((err) => {
  console.error('[backfill] fatal', err);
  process.exitCode = 1;
});
