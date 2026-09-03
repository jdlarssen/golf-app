// native/app/src/data/profile.ts
// Native #1906: spillerens egen profilrad til profil-rommet.
//
// **Anon-klienten leser den selv.** Egen rad er alltid lesbar gjennom
// RLS-policyen `users select own or shared games` (0092), så her trengs ingen
// serverrute og ingen service-role — samme vei `DeleteAccount.tsx` alt går for
// navnet sitt. Skrivingen er en annen sak: den kommer i PR B, gjennom
// `PUT /api/profile`, fordi handicap og de andre feltene har regler som bor på
// serveren.
//
// **Mappingen snake_case → camelCase bor i dette laget**, som i resten av
// `src/data/`. Ingen skjerm ser en rå kolonne.
import { supabase } from '../supabase';

/**
 * Feltene profil-rommet viser. Alle er nullbare her, også de kolonnene som er
 * NOT NULL i skjemaet i dag (`hcp_index`, `handicap_updated_at`): skjermen
 * tegner hvert felt med den samme «verdi eller ikke satt»-regelen, og da slipper
 * den å vite hvilke kolonner databasen tilfeldigvis har markert som påkrevd.
 *
 * `gender` og `level` leses selv om PR A ikke viser dem. PR B redigerer dem, og
 * å utvide select-en da ville vært churn i en fil som ellers ikke endres.
 */
export interface OwnProfile {
  name: string | null;
  nickname: string | null;
  hcpIndex: number | null;
  handicapUpdatedAt: string | null;
  gender: string | null;
  level: string | null;
}

interface ProfileRow {
  name: string | null;
  nickname: string | null;
  hcp_index: number | null;
  handicap_updated_at: string | null;
  gender: string | null;
  level: string | null;
}

const PROFILE_SELECT =
  'name, nickname, hcp_index, handicap_updated_at, gender, level';

/**
 * Hent egen profilrad.
 *
 * `single()`, ikke `maybeSingle()`: finnes ikke raden, er det ikke en tom
 * profil — det er noe galt (RLS, feil id, en halvferdig registrering), og
 * PostgREST svarer da med en feil vi kaster videre. Skjermen fanger kastet og
 * viser en feillinje. Et blankt profil-rom ville sett ut som en profil uten
 * innhold, og spilleren ville prøvd å fylle den ut.
 */
export async function fetchOwnProfile(userId: string): Promise<OwnProfile> {
  const { data, error } = await supabase
    .from('users')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .single<ProfileRow>();

  if (error) throw new Error(error.message);

  return {
    name: data.name,
    nickname: data.nickname,
    hcpIndex: data.hcp_index,
    handicapUpdatedAt: data.handicap_updated_at,
    gender: data.gender,
    level: data.level,
  };
}
