import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { isClubExpired } from './clubStatus';

/**
 * The club a game may be saved with (#2433): the one home for the check that
 * `createGameInternal` and `updateGameInternal` both run before writing
 * `games.group_id`.
 *
 * #442: valgfri klubb-tilknytning. Authz: spillet kan kun scopes til en klubb
 * brukeren selv er medlem av (en manipulert URL/form-verdi droppes til null,
 * ikke en feil). Klubb-medlemmer ser + kan melde seg på klubb-spill uansett
 * registration_mode (medlemskap ER invitasjonen). Rollen spiller ingen rolle —
 * samme regel som `getNewGameFormData`, `lib/wizard/clubChoice.ts` og
 * DB-triggeren `guard_games_competition_links` (`is_group_member`).
 *
 * #50: en utløpt klubb (frossen avtale) kan ikke ta imot nye spill — dropp
 * scopingen til null (samme «ugyldig verdi → null»-mønster).
 *
 * `rawGroupId` is the trimmed form value; an empty string makes no DB call.
 */
export async function resolveGameClubId(
  supabase: SupabaseClient<Database>,
  userId: string,
  rawGroupId: string,
): Promise<string | null> {
  if (!rawGroupId) return null;
  const { data: membership } = await supabase
    .from('group_members')
    .select('group_id, groups(valid_until)')
    .eq('group_id', rawGroupId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!membership) return null;
  // RLS client: the embed reads null-safe, a hidden groups row is possible.
  const g = membership.groups;
  return isClubExpired(g?.valid_until ?? null) ? null : rawGroupId;
}
