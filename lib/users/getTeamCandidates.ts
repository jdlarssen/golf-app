import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

export type TeamCandidate = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string;
};

/**
 * Kandidat-kilden for autocomplete i lag-påmelding (#362). Returnerer
 * spillere kapteinen kan velge som «eksisterende spiller» — i dag de hen
 * har delt minst ett spill med (co-players via felles `game_players`).
 *
 * **Personvern:** vi eksponerer ALDRI alle brukere her — bare kapteinens
 * eget nettverk. Det er forskjellen fra admin-spiller-velgeren, som har
 * lov til å se alle. En fri-tekst e-post-modus dekker folk utenfor lista.
 *
 * **Utvidelsespunkt for «Venner» ([#408]):** når venne-systemet kommer,
 * unioner venner inn her — autocomplete-UI-et trenger da ingen endring,
 * det leser bare fra denne resolveren:
 *
 *     kandidater = venner(userId) ∪ co-players(userId)
 *
 * Best-effort: ved query-feil returnerer vi tom liste. Autocomplete er en
 * bekvemmelighet; kapteinen kan alltid taste e-post manuelt.
 */
export async function getTeamCandidates(
  userId: string,
): Promise<TeamCandidate[]> {
  const admin = getAdminClient();

  // 1. Spill kapteinen er med i.
  const { data: myGames, error: myGamesError } = await admin
    .from('game_players')
    .select('game_id')
    .eq('user_id', userId)
    .returns<{ game_id: string }[]>();
  if (myGamesError || !myGames || myGames.length === 0) {
    if (myGamesError) {
      console.error('[getTeamCandidates] my games lookup failed', myGamesError);
    }
    return [];
  }
  const gameIds = [...new Set(myGames.map((g) => g.game_id))];

  // 2. Andre spillere i de samme spillene.
  const { data: coRows, error: coError } = await admin
    .from('game_players')
    .select('user_id')
    .in('game_id', gameIds)
    .neq('user_id', userId)
    .returns<{ user_id: string }[]>();
  if (coError || !coRows || coRows.length === 0) {
    if (coError) {
      console.error('[getTeamCandidates] co-player lookup failed', coError);
    }
    return [];
  }
  const coPlayerIds = [...new Set(coRows.map((r) => r.user_id))];

  // 3. Hent visningsdata. Bare fullførte profiler (har e-post) er
  //    meningsfulle som autocomplete-treff.
  const { data: users, error: usersError } = await admin
    .from('users')
    .select('id, name, nickname, email')
    .in('id', coPlayerIds)
    .returns<TeamCandidate[]>();
  if (usersError || !users) {
    if (usersError) {
      console.error('[getTeamCandidates] user lookup failed', usersError);
    }
    return [];
  }

  return users
    .filter((u) => u.email)
    .sort((a, b) =>
      (a.name ?? a.email).localeCompare(b.name ?? b.email, 'nb'),
    );
}
