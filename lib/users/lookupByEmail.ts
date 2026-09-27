import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { emailMatchPattern } from '@/lib/supabase/emailMatch';

/**
 * Slå opp en eksisterende Tørny-bruker via e-post. Brukes av team-
 * formasjons-flyten (#199 chunk 8) for å avgjøre om kapteinens medspiller
 * er en kjent bruker (in-app `team_invite`-varsel) eller ukjent (mail-
 * invitasjon med `invitations`-rad + game_id).
 *
 * Sanitering matcher login-flyten: lowercase + trim. E-post i `users`-
 * tabellen er lagret i lowercase ved insert, men vi matcher uten hensyn til
 * store/små bokstaver siden eldre rader kan ha case-variasjon (pre-cleanup).
 * Eksakt treff via `emailMatchPattern` (#2207): `_` og `%` er vanlige tegn.
 *
 * Returnerer null hvis bruker ikke finnes, eller hvis input er åpenbart
 * ugyldig (tom/manglende @). Caller skal aldri blokkere selv-påmelding
 * på cosmetic lookup-feil — null-resultat betyr "behandle som ukjent".
 */
export async function lookupUserByEmail(
  email: string,
): Promise<{ id: string; name: string | null; email: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    return null;
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('id, name, email')
    .filter('email', 'imatch', emailMatchPattern(normalized))
    .maybeSingle<{ id: string; name: string | null; email: string }>();

  if (error) {
    console.error('[lookupUserByEmail] lookup failed', error);
    return null;
  }

  return data;
}
