import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { getFriendIds } from '@/lib/friends/getFriendIds';
import { getCoPlayerIds } from './getCoPlayerIds';

export type TeamCandidate = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string;
  /** #1017: true = skygge-bruker (`users.is_guest`) → «Gjest»-chip i lista. */
  isGuest?: boolean;
};

type TeamCandidateRow = Omit<TeamCandidate, 'isGuest'> & { is_guest: boolean };

/**
 * Kandidat-kilden for autocomplete i lag-påmelding (#362). Returnerer
 * spillere kapteinen kan velge som «eksisterende spiller».
 *
 * **Personvern:** vi eksponerer ALDRI alle brukere her — bare kapteinens
 * eget nettverk. En fri-tekst e-post-modus dekker folk utenfor lista.
 *
 * Kilden er nå unionen av venner og co-players (#408):
 *
 *     kandidater = venner(userId) ∪ co-players(userId)
 *
 * Autocomplete-UI-et (`TeamRegistrationForm`) leser bare denne resolveren og
 * trengte ingen endring. Best-effort: ved query-feil returneres tom liste.
 */
export async function getTeamCandidates(
  userId: string,
): Promise<TeamCandidate[]> {
  const [friendIds, coPlayerIds] = await Promise.all([
    getFriendIds(userId),
    getCoPlayerIds(userId),
  ]);

  const candidateIds = [...new Set([...friendIds, ...coPlayerIds])].filter(
    (id) => id !== userId,
  );
  if (candidateIds.length === 0) return [];

  // Hent visningsdata. Bare fullførte profiler (har e-post) er meningsfulle
  // som autocomplete-treff. Slettede kontoer (#1012) filtreres: co-player-id-ene
  // deres består (game_players-radene beholdes ved anonymisering).
  const admin = getAdminClient();
  const { data: users, error } = await admin
    .from('users')
    .select('id, name, nickname, email, is_guest')
    .in('id', candidateIds)
    .is('deleted_at', null)
    .returns<TeamCandidateRow[]>();
  if (error || !users) {
    if (error) {
      console.error('[getTeamCandidates] user lookup failed', error);
    }
    return [];
  }

  return users
    .filter((u) => u.email)
    .sort((a, b) =>
      (a.name ?? a.email).localeCompare(b.name ?? b.email, 'nb'),
    )
    .map(({ is_guest, ...rest }) => ({ ...rest, isGuest: is_guest }));
}
