import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * #1175: server-side aggregert innbetalt pott for signup-/plakat-flatene, der
 * den fulle `game_players`-listen IKKE er lastet (`getGameByShortId` henter kun
 * `games`-raden). Kjører en `count`-query via admin-client — kun ETT tall
 * forlater serveren, aldri per-spiller `paid_at`. Uinnloggede/vanlige klienter
 * ser bare det aggregerte `potKr`.
 *
 * Predikatet (`paid_at IS NOT NULL AND withdrawn_at IS NULL`) er identisk med
 * `computePaidPotKr` og admin-sidens «X av Y betalt» — samme regel, ingen
 * divergens (#1145).
 *
 * Returnerer 0 uten DB-runde når det ikke er noen kontingent (`entryFeeKr <=
 * 0`), og 0 ved query-feil (best-effort — potten er en berikelse, ikke en
 * blokker; en manglende pott skjuler bare ankeret).
 */
export async function getPaidPotKr(
  gameId: string,
  entryFeeKr: number,
): Promise<number> {
  if (entryFeeKr <= 0) return 0;

  const admin = getAdminClient();
  const { count, error } = await admin
    .from('game_players')
    .select('user_id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .not('paid_at', 'is', null)
    .is('withdrawn_at', null);

  if (error || count == null) {
    if (error) console.error('[getPaidPotKr] count failed', error);
    return 0;
  }
  return entryFeeKr * count;
}
