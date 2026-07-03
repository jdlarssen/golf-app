import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { formatPublicName } from '@/lib/names/formatPublicName';

/**
 * Slim, felt-whitelistet roster for den offentlige påmeldingssiden (#1022).
 * Admin-client (uinnloggede har ingen RLS-lesetilgang) — sikkerhetsgrensen er
 * SELECT-listen: kun navn/kallenavn for ikke-trukne spillere, formatert til
 * «Ola N.» før noe forlater helperen. Aldri e-post, handicap eller scores.
 */

const MAX_NAMES = 12;

export type PublicSignupRoster = {
  /** Antall påmeldte (ikke-trukne) spillere. */
  count: number;
  /** Personvern-formaterte visningsnavn, alfabetisk, maks {@link MAX_NAMES}. */
  names: string[];
  /** Hvor mange som ikke fikk plass i `names` («+N flere»). */
  overflow: number;
};

export async function getPublicSignupRoster(
  gameId: string,
): Promise<PublicSignupRoster> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('game_players')
    .select('users!game_players_user_id_fkey(name, nickname)')
    .eq('game_id', gameId)
    .is('withdrawn_at', null);

  if (error || !data) {
    if (error) console.error('[getPublicSignupRoster] lookup failed', error);
    return { count: 0, names: [], overflow: 0 };
  }

  type Row = { users: { name: string | null; nickname: string | null } | null };
  const rows = data as unknown as Row[];

  const names = rows
    .map((r) => (r.users ? formatPublicName(r.users) : null))
    .filter((n): n is string => n != null)
    .sort((a, b) => a.localeCompare(b, 'nb'));

  return {
    count: rows.length,
    names: names.slice(0, MAX_NAMES),
    overflow: Math.max(0, names.length - MAX_NAMES),
  };
}
