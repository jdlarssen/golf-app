import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { EditGamePlayerRow, EditGameRow } from '@/lib/games/editGameInitialValues';
import { planDraftResume, type DraftResumePlan, type FormatCatalog } from './draftResumePlan';

/**
 * #1385: et utkast gjenopptas i veiviseren det ble laget i. Cup-/liga-koblede
 * utkast er unntaket (veiviserens cup-gren er en opprettelses-kortslutning,
 * ikke en redigeringsflate) — de trenger ikke veiviser-oppsettet i det hele
 * tatt, og heller ikke planlagte spill. Null → GameForm.
 *
 * One home for the edit routes (#2269): they differ only in where the
 * wizard's data come from (`loadMountData`). The roster is read with the
 * caller's client, so the route's own gate and RLS decide who sees it.
 */
export async function loadDraftResume<M extends { formatsByIntent: FormatCatalog }>(
  supabase: SupabaseClient<Database>,
  gameId: string,
  game: EditGameRow,
  loadMountData: () => Promise<M>,
): Promise<{
  wizardData: M;
  plan: Extract<DraftResumePlan, { kind: 'wizard' }>;
  playerRows: EditGamePlayerRow[];
} | null> {
  const mayResumeInWizard =
    game.status === 'draft' && !game.tournament_id && !game.league_round_id;
  if (!mayResumeInWizard) return null;

  const [playersResult, wizardData] = await Promise.all([
    supabase
      .from('game_players')
      .select('user_id, team_number, flight_number, tee_gender')
      .eq('game_id', gameId)
      .returns<EditGamePlayerRow[]>(),
    loadMountData(),
  ]);
  if (playersResult.error) throw playersResult.error;

  // Katalog-vakten kan fortsatt sende utkastet til GameForm: finnes ikke
  // formatet i noen av veiviserens kataloger, ville steg 2 vist et grid uten
  // spillets eget format.
  const plan = planDraftResume(game, wizardData.formatsByIntent);
  if (plan.kind !== 'wizard') return null;
  return { wizardData, plan, playerRows: playersResult.data ?? [] };
}
