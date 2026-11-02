import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { expireTournamentCache } from '@/lib/games/expireGameCache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getAdminClient } from '@/lib/supabase/admin';
import { planTournamentGameDeletion } from './tournamentGameDeletion';

export type DeleteCupResult = { ok: true; name: string } | { ok: false; error: 'not_found' | 'delete_failed' };

/**
 * Sletter en cup, for nettets `deleteTournament` og appens rute (#2752). Kalleren har gjort
 * autorisasjonen, og `caller` er kalleren sin egen klient, så RLS også står bak cup-raden.
 */
export async function deleteCupCore(caller: SupabaseClient<Database>, id: string): Promise<DeleteCupResult> {
  const { data: cup } = await caller.from('tournaments').select('id, name').eq('id', id).maybeSingle();
  if (!cup) return { ok: false, error: 'not_found' };

  // #1441 (owner-QA finding A): matcher som aldri egentlig ble spilt (draft/
  // scheduled, eller active uten en eneste score-rad) er cup-genererings-støy
  // — sletter man cupen skal de bli med i stedet for å strande på spillernes
  // hjemmeskjerm. Avledede matcher trenger ingen egen sletting her: FK-en
  // `source_game_id … on delete cascade` (migrasjon 0151) tar dem automatisk
  // når verten deres slettes under.
  //
  // #2214: slettingen går på admin-klienten. Kampene eies av den som genererte
  // dem, og games-DELETE-policyen krever `created_by = auth.uid()` eller
  // `is_admin()`. En annen klubbadmin (for eksempel klubbeieren) fikk 0 rader
  // og delete_failed, eller slettet bare sine egne mens resten ble frittstående
  // planlagte spill på hjemskjermen. Kalleren har gjort autorisasjonen, samme
  // mønster som finishTournament.
  // `.eq('tournament_id')` er et ekstra vern nå som RLS ikke står bak, og
  // `.neq('status', 'finished')` verner mot en kamp som ble ferdig etter planen
  // ble lest (TOCTOU). Alle planlagte rader må gå: ellers stopper vi FØR
  // cup-raden slettes, så ingen kamp strandes, og et nytt forsøk lager en ny plan.
  const plan = await planTournamentGameDeletion(id);
  if (plan.hostIdsToDelete.length > 0) {
    const { data: deleted, error: deleteError } = await getAdminClient()
      .from('games')
      .delete()
      .in('id', plan.hostIdsToDelete)
      .eq('tournament_id', id)
      .neq('status', 'finished')
      .select('id');
    if (deleteError || (deleted ?? []).length !== plan.hostIdsToDelete.length) {
      console.error('[cup] deleteTournament neverPlayedGames failed', {
        id,
        planned: plan.hostIdsToDelete.length,
        deleted: deleted?.length ?? 0,
        error: deleteError,
      });
      return { ok: false, error: 'delete_failed' };
    }
  }

  // FK på games.tournament_id er ON DELETE SET NULL — de GJENVÆRENDE matchene
  // (reell spilling, eller status='finished') blir frittstående spill, ikke
  // slettet. Aldri-spilte matcher er allerede fjernet av batchen over.
  // #2214: 0 rader er en feil, ikke «cup slettet» (bug-prevention #2).
  const { data: deletedCup, error } = await caller.from('tournaments').delete().eq('id', id).select('id');
  if (error || (deletedCup ?? []).length === 0) {
    console.error('[cup] deleteTournament failed', { id, error });
    return { ok: false, error: 'delete_failed' };
  }

  return { ok: true, name: cup.name };
}

export function revalidateCupDeleted(id: string, groupId: string | null) {
  expireTournamentCache(id);
  if (groupId) revalidatePath(`/klubber/${groupId}`);
}
