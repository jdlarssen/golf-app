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
 * eget nettverk. Adressen går maskert til nettleseren (#2207); et valg sendes
 * tilbake som id.
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
  return shapeCandidates(await loadCandidateRows(userId));
}

/**
 * #2840: the team form's candidates — the captain's friends only, shaped and
 * sorted like `getTeamCandidates`. Only a friend can be on the team; the
 * server checks it again (`checkTeammatesAreFriends`). Best effort like its
 * sibling: a failed read gives an empty list, which the form shows as «no
 * friends yet», and the submit gate never trusts this list.
 */
export async function getTeamFriendCandidates(
  userId: string,
): Promise<TeamCandidate[]> {
  const friendIds = (await getFriendIds(userId)).filter((id) => id !== userId);
  return shapeCandidates(await loadUserRows(friendIds));
}

function shapeCandidates(rows: CandidateRow[]): TeamCandidate[] {
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

async function loadCandidateRows(userId: string): Promise<CandidateRow[]> {
  const [friendIds, coPlayerIds] = await Promise.all([
    getFriendIds(userId),
    getCoPlayerIds(userId),
  ]);

  const candidateIds = [...new Set([...friendIds, ...coPlayerIds])].filter(
    (id) => id !== userId,
  );
  return loadUserRows(candidateIds);
}

async function loadUserRows(candidateIds: string[]): Promise<CandidateRow[]> {
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
