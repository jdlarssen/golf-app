import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { getFriendIds } from '@/lib/friends/getFriendIds';
import { maskEmail } from '@/lib/users/maskEmail';
import { getCoPlayerIds } from './getCoPlayerIds';

export type TeamCandidate = {
  id: string;
  name: string | null;
  nickname: string | null;
  /**
   * #2207: the address masked (`ol•••@…`), enough to tell two people apart.
   * The full address never leaves the server on this surface.
   */
  maskedEmail: string;
  /** #1017: true = skygge-bruker (`users.is_guest`) → «Gjest»-chip i lista. */
  isGuest?: boolean;
};

type CandidateRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string;
  is_guest: boolean;
};

/**
 * Kandidat-kilden for autocomplete i lag-påmelding (#362) og arrangørens
 * spillerliste (#429). Returnerer spillere kapteinen kan velge som
 * «eksisterende spiller».
 *
 * **Personvern:** vi eksponerer ALDRI alle brukere her — bare kapteinens
 * eget nettverk. En fri-tekst e-post-modus dekker folk utenfor lista.
 * Adressen går maskert til nettleseren (#2207); et valg sendes tilbake som
 * id, og `getTeamCandidateEmails` gjør den om til adressen på serveren.
 *
 * Kilden er nå unionen av venner og co-players (#408):
 *
 *     kandidater = venner(userId) ∪ co-players(userId)
 *
 * Best-effort: ved query-feil returneres tom liste.
 */
export async function getTeamCandidates(
  userId: string,
): Promise<TeamCandidate[]> {
  const rows = await loadCandidateRows(userId);
  return rows
    .map(({ email, is_guest, ...rest }) => ({
      ...rest,
      maskedEmail: maskEmail(email),
      isGuest: is_guest,
    }))
    .sort((a, b) =>
      (a.name ?? a.maskedEmail).localeCompare(b.name ?? b.maskedEmail, 'nb'),
    );
}

/**
 * The full addresses behind candidate ids a captain picked (#2207), for the
 * server-side team registration. Only ids that really are in `userId`'s
 * candidate set come back; any other id is simply missing from the map.
 */
export async function getTeamCandidateEmails(
  userId: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const wanted = new Set(ids);
  const rows = await loadCandidateRows(userId);
  return new Map(rows.filter((r) => wanted.has(r.id)).map((r) => [r.id, r.email]));
}

async function loadCandidateRows(userId: string): Promise<CandidateRow[]> {
  const [friendIds, coPlayerIds] = await Promise.all([
    getFriendIds(userId),
    getCoPlayerIds(userId),
  ]);

  const candidateIds = [...new Set([...friendIds, ...coPlayerIds])].filter(
    (id) => id !== userId,
  );
  if (candidateIds.length === 0) return [];

  // Hent visningsdata. Bare rader med e-post er meningsfulle som
  // autocomplete-treff. Slettede kontoer (#1012) filtreres: co-player-id-ene
  // deres består (game_players-radene beholdes ved anonymisering).
  const admin = getAdminClient();
  const { data: users, error } = await admin
    .from('users')
    .select('id, name, nickname, email, is_guest')
    .in('id', candidateIds)
    .is('deleted_at', null)
    .returns<CandidateRow[]>();
  if (error || !users) {
    if (error) {
      console.error('[getTeamCandidates] user lookup failed', error);
    }
    return [];
  }

  return users.filter((u) => u.email);
}
