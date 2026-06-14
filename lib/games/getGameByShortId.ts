import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import type { RegistrationMode, RegistrationType } from './registration';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';

/**
 * Public-landing-side henter `games`-rad via 8-char short_id. Bruker
 * admin-client for å bypass RLS — vanlig SELECT-policy gater på admin OR
 * game_players-membership, og en uautentisert (eller helt ny) bruker som
 * lander på `/signup/[shortId]` matcher ingen av delene. Returnerer bare
 * felter som er trygge å eksponere uten autentisering: base-info om spillet
 * pluss påmeldings-modus.
 *
 * `mode_config` er inkludert fordi team-flyten leser `team_size` for å
 * vite hvor mange slots kaptein-formen skal vise. Solo-modi har
 * `team_size: 1` og leser ikke feltet uansett.
 */

export type ShortIdGame = {
  id: string;
  name: string;
  short_id: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  registration_mode: RegistrationMode;
  registration_type: RegistrationType;
  game_mode: GameMode;
  mode_config: GameModeConfig;
  course_id: string | null;
  // #624 — banenavn for re-lokalisering av auto-genererte spillnavn ved visning.
  courses: { name: string } | null;
  scheduled_tee_off_at: string | null;
  created_by: string | null;
  group_id: string | null;
  // #369: «Slipp venner direkte inn» — kun relevant for manual_approval.
  let_friends_skip_gate: boolean;
  // #543: arrangøren kan stenge påmeldingen manuelt.
  signups_closed_at: string | null;
};

export async function getGameByShortId(
  shortId: string,
): Promise<ShortIdGame | null> {
  // Defensiv lengde-/charset-sjekk før DB-call. CHECK-constraint i migrasjon
  // 0040 håndhever det samme på DB-nivå, men vi sparer en round-trip på
  // åpenbart ugyldige inputs (typos i URL, scrapers, osv).
  if (!/^[0-9a-z]{8}$/.test(shortId)) {
    return null;
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('games')
    .select(
      'id, name, short_id, status, registration_mode, registration_type, game_mode, mode_config, course_id, courses(name), scheduled_tee_off_at, created_by, group_id, let_friends_skip_gate, signups_closed_at',
    )
    .eq('short_id', shortId)
    .maybeSingle<ShortIdGame>();

  if (error) {
    console.error('[getGameByShortId] lookup failed', error);
    return null;
  }
  return data;
}
