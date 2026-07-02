import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { toSignedHcp } from '@/lib/handicap/sign';

/**
 * Gjestespiller-lite (#1009): en gjest er en EKTE bruker-rad («skygge-bruker»)
 * med plassholder-e-post på et subdomene uten MX — adressen kan aldri motta
 * OTP, så kontoen er utilgjengelig til arrangøren claimer den over på gjestens
 * ekte e-post. Hele scoring-/leaderboard-/RLS-maskineriet ser gjesten som en
 * vanlig spiller; `users.is_guest` styrer kun stats-/mail-eksklusjoner og
 * «Gjest»-chipen.
 *
 * Alle skriv går via service-role (`getAdminClient`) — kontrakt-beslutning 8:
 * klient-side inserts av vilkårlige user_ids skal fortsatt blokkeres av
 * invite-eligibility-guarden (0115), og `is_guest` er selv-endrings-sperret
 * av guard_users_self_update (0127).
 */

export const GUEST_EMAIL_DOMAIN = 'guest.tornygolf.no';

/** Claim-UI-ene bruker denne til å skille «ikke claimet» fra «claim sendt». */
export function isGuestPlaceholderEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);
}

/** Tee-kategori fra gjeste-skjemaet — samme M/D/J-vokabular som wizard-en. */
export type GuestTee = 'M' | 'D' | 'J';

export type GuestProfile = {
  name: string;
  /** Signert WHS-index (plusshandicap lagret negativt, jf. lib/handicap/sign). */
  hcpIndex: number;
  tee: GuestTee;
};

export type GuestValidationError =
  | 'guest_invalid_name'
  | 'guest_invalid_hcp'
  | 'guest_invalid_tee';

export type ParseGuestProfileResult =
  | { ok: true; profile: GuestProfile }
  | { ok: false; error: GuestValidationError };

const GUEST_NAME_MAX = 80;
// Samme grenser som profil-/admin-skjemaene (HCP_MIN/HCP_MAX der).
const HCP_MIN = -10;
const HCP_MAX = 54.0;

/**
 * Parse + valider rå skjemafelter for en gjest. HCP-reglene speiler
 * profil-skjemaets validering (komma-tolerant, magnitude 0–54, signert verdi
 * innenfor [-10, 54]); plusshandicap tastes med ledende «+» («+2» → -2,
 * via `toSignedHcp`) siden gjeste-skjemaet ikke har eget plus-checkbox-felt.
 */
export function parseGuestProfile(raw: {
  name: unknown;
  hcp: unknown;
  tee: unknown;
}): ParseGuestProfileResult {
  const name = String(raw.name ?? '').trim();
  if (name.length === 0 || name.length > GUEST_NAME_MAX) {
    return { ok: false, error: 'guest_invalid_name' };
  }

  const tee = String(raw.tee ?? '');
  if (tee !== 'M' && tee !== 'D' && tee !== 'J') {
    return { ok: false, error: 'guest_invalid_tee' };
  }

  const hcpRaw = String(raw.hcp ?? '').trim();
  if (hcpRaw === '') return { ok: false, error: 'guest_invalid_hcp' };
  const isPlus = hcpRaw.startsWith('+');
  const magnitude = Number(
    (isPlus ? hcpRaw.slice(1) : hcpRaw).replace(',', '.'),
  );
  if (!Number.isFinite(magnitude) || magnitude < 0 || magnitude > HCP_MAX) {
    return { ok: false, error: 'guest_invalid_hcp' };
  }
  const hcpIndex = toSignedHcp(magnitude, isPlus);
  if (hcpIndex < HCP_MIN || hcpIndex > HCP_MAX) {
    return { ok: false, error: 'guest_invalid_hcp' };
  }

  return { ok: true, profile: { name, hcpIndex, tee } };
}

/** M/D/J → game_players.tee_gender (styrer per-kjønn par/rating på tee-en). */
export function guestTeeToTeeGender(tee: GuestTee): 'mens' | 'ladies' | 'juniors' {
  return tee === 'D' ? 'ladies' : tee === 'J' ? 'juniors' : 'mens';
}

/** M/D/J → users.gender. user_gender-enumet har ingen junior-verdi → null. */
export function guestTeeToUserGender(tee: GuestTee): 'mens' | 'ladies' | null {
  return tee === 'M' ? 'mens' : tee === 'D' ? 'ladies' : null;
}

/** M/D/J → users.level. Junior-tee-valget er det eneste junior-signalet vi har. */
export function guestTeeToLevel(tee: GuestTee): 'junior' | 'normal' {
  return tee === 'J' ? 'junior' : 'normal';
}

/**
 * Hvilke av `userIds` er gjester (users.is_guest)? Brukes av publish-/edit-
 * flytene til å rute gjeste-rader via service-role-insert (0115-guarden ville
 * ellers blokkert en ikke-admin-arrangørs klient-insert av en skygge-bruker —
 * gjesten er verken venn, medspiller eller klubbmedlem).
 *
 * Feiler oppslaget returneres tomt sett: gjeste-radene går da klient-veien og
 * feiler kontrollert i guarden (kompensert rollback + db_players-feil) i
 * stedet for å omgå den.
 */
export async function findGuestIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('id')
    .in('id', userIds)
    .eq('is_guest', true);
  if (error) {
    console.error('[findGuestIds] lookup failed', error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.id));
}

export type GuestCreateError =
  | 'guest_auth_create_failed'
  | 'guest_profile_update_failed'
  | 'guest_roster_insert_failed';

export type CreateGuestUserResult =
  | { ok: true; userId: string; placeholderEmail: string }
  | { ok: false; error: GuestCreateError };

type CreateGuestOpts = {
  /** Testbar retry-pause for polling på trigger-opprettet users-rad. */
  retryDelayMs?: number;
};

const PROFILE_UPDATE_ATTEMPTS = 5;

/**
 * Opprett skygge-brukeren: GoTrue admin `createUser` (trigger
 * `on_auth_user_created` lager `public.users`-raden i samme transaksjon) →
 * oppdater profil-feltene + `is_guest` + `profile_completed_at`.
 *
 * `profile_completed_at` MÅ settes: både publish-gaten
 * (`incomplete_profiles_for_ids`) og start-gaten (`findPendingPlayers` i
 * startScheduledGame) nekter spill med ukomplette profiler, og
 * invitasjons-orphan-sweeperen i admin/spillere sletter auth-brukere uten den.
 *
 * Kompensasjon: feiler profil-oppdateringen slettes auth-brukeren
 * (FK-cascade rydder public.users) så ingen halvferdig skygge-rad blir igjen.
 */
export async function createGuestUser(
  profile: GuestProfile,
  opts?: CreateGuestOpts,
): Promise<CreateGuestUserResult> {
  const admin = getAdminClient();
  const placeholderEmail = `gjest+${crypto.randomUUID()}@${GUEST_EMAIL_DOMAIN}`;

  const { data, error } = await admin.auth.admin.createUser({
    email: placeholderEmail,
    email_confirm: true,
  });
  if (error || !data?.user) {
    console.error('[createGuestUser] auth createUser failed', error);
    return { ok: false, error: 'guest_auth_create_failed' };
  }
  const userId = data.user.id;

  // Triggeren inserter public.users i samme transaksjon som auth-raden, så
  // raden finnes normalt umiddelbart — kort poll absorberer replikerings-lag
  // (samme mønster som e2e seedEphemeralPlayers).
  const retryDelayMs = opts?.retryDelayMs ?? 200;
  const nowIso = new Date().toISOString();
  let updated = false;
  for (let attempt = 0; attempt < PROFILE_UPDATE_ATTEMPTS && !updated; attempt++) {
    const { data: rows } = await admin
      .from('users')
      .update({
        name: profile.name,
        hcp_index: profile.hcpIndex,
        handicap_updated_at: nowIso,
        gender: guestTeeToUserGender(profile.tee),
        level: guestTeeToLevel(profile.tee),
        is_guest: true,
        profile_completed_at: nowIso,
      })
      .eq('id', userId)
      .select('id');
    updated = (rows ?? []).length > 0;
    if (!updated && retryDelayMs > 0) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }

  if (!updated) {
    console.error('[createGuestUser] profile update affected 0 rows — compensating deleteUser');
    try {
      await admin.auth.admin.deleteUser(userId);
    } catch (err) {
      console.error('[createGuestUser] compensating deleteUser failed', err);
    }
    return { ok: false, error: 'guest_profile_update_failed' };
  }

  return { ok: true, userId, placeholderEmail };
}

export type CreateGuestPlayerResult = CreateGuestUserResult;

/**
 * Skygge-bruker + roster-rad i én operasjon (roster-cockpit-flatene).
 * Insertet går via service-role — invite-eligibility-guarden (0115) no-oper
 * for service-role og forblir urørt for klient-side skriv.
 *
 * `accepted_at` settes til nå: en gjest kan aldri selv bekrefte deltakelse
 * (ingen innlogging), og arrangøren har per definisjon avklart den — uten
 * dette ville gjesten stått som «Ikke bekreftet» for alltid.
 *
 * Kompensasjon: feiler roster-insertet slettes auth-brukeren (cascade rydder
 * users-raden) så gjesten aldri eksisterer uten spillet den ble laget for.
 */
export async function createGuestPlayer(
  gameId: string,
  profile: GuestProfile,
  opts?: CreateGuestOpts,
): Promise<CreateGuestPlayerResult> {
  const created = await createGuestUser(profile, opts);
  if (!created.ok) return created;

  const admin = getAdminClient();
  const { error: insertError } = await admin.from('game_players').insert({
    game_id: gameId,
    user_id: created.userId,
    team_number: null,
    flight_number: null,
    course_handicap: null,
    tee_gender: guestTeeToTeeGender(profile.tee),
    accepted_at: new Date().toISOString(),
  });

  if (insertError) {
    console.error('[createGuestPlayer] roster insert failed — compensating deleteUser', insertError);
    try {
      await admin.auth.admin.deleteUser(created.userId);
    } catch (err) {
      console.error('[createGuestPlayer] compensating deleteUser failed', err);
    }
    return { ok: false, error: 'guest_roster_insert_failed' };
  }

  return created;
}
