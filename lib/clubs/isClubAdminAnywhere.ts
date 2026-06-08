import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { isClubExpired } from '@/lib/clubs/clubStatus';

type Row = {
  role: 'owner' | 'admin' | 'member';
  groups: { valid_until: string | null } | { valid_until: string | null }[] | null;
};

/**
 * True hvis brukeren er owner/admin i ≥1 ikke-utløpt klubb. Driver om
 * «Klubb-turnering»-flisen vises i veiviseren (#525): en vanlig spiller uten
 * klubb å arrangere for skal ikke se den — flisen ville bare vært en blindvei
 * (klubb-velgeren i steg 2 har ingenting å plukke). En global admin behandles
 * separat i IntentSelector, så denne dekker kun klubb-admin-stien.
 *
 * Admin-client fordi `group_members`-RLS ellers ville krevd request-scoped
 * sesjon her; vi leser kun brukerens egne rader. Best-effort → `false` ved feil
 * (flisen forblir skjult, aldri en hard feil i opprett-flyten). En utløpt klubb
 * teller ikke — en frossen klubb tilbyr ikke nye spill (samme regel som
 * klubb-velgeren i `getNewGameFormData`).
 */
export async function isClubAdminAnywhere(userId: string): Promise<boolean> {
  if (!userId) return false;
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('group_members')
    .select('role, groups(valid_until)')
    .eq('user_id', userId)
    .in('role', ['owner', 'admin'])
    .returns<Row[]>();
  if (error || !data) {
    if (error) console.error('[isClubAdminAnywhere] lookup failed', error);
    return false;
  }
  return data.some((r) => {
    const g = Array.isArray(r.groups) ? r.groups[0] ?? null : r.groups;
    return g !== null && !isClubExpired(g.valid_until);
  });
}
