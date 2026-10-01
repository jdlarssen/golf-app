import 'server-only';
import type { NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  canApproveScorecardFor,
  type FlightPlayer,
} from '@/lib/games/flightScope';
import type { GameMode } from '@/lib/scoring/modes/types';

// Adgangssjekken for app→server-rutene (#1891). Første kunde var
// `app/api/account/delete/route.ts` (#1876); den bor her nå, og #1917–#1919
// arver den uten å lage en tredje variant.
//
// **Hvorfor `api/` må eie sin egen auth.** Ruter under `api/` ligger utenfor
// proxy-matcheren (`proxy.ts` config.matcher), så det finnes hverken
// sesjons-cookie eller `x-torny-user-id` å lene seg på. Appen sender et
// `Authorization: Bearer <supabase access_token>`, og vi validerer det
// server-side mot GoTrue.
//
// **Bruker-id-en kommer KUN fra det validerte tokenet.** Ingen rute her leser
// en id fra body eller query. Da finnes det ingen vei til å utgi seg for en
// annen — og ingen rute kan gjøre den feilen ved et uhell, fordi hjelperen
// under er den eneste kilden til «hvem er dette».

/** Den autentiserte kalleren: alt kommer fra det validerte tokenet. */
export type AuthenticatedUser = {
  id: string;
  /** E-posten GoTrue har på brukeren, eller `null` når den mangler. */
  email: string | null;
  /** Tokenet selv, for en klient som skal lese som kalleren. */
  accessToken: string;
};

/**
 * Kalleren fra Bearer-tokenet, eller `null` når kalleren ikke er autentisert.
 * Det ene stedet tokenet leses og valideres (#2216); `authenticatedUserId`
 * under bygger på den.
 *
 * Vi kaller `auth.getUser(token)` på admin-klienten: auth-js legger tokenet i
 * `Authorization` og lar service-nøkkelen stå som `apikey`, altså validerer
 * GoTrue tokenets signatur og utløp — ikke oss. Kaster `getAdminClient()`
 * (manglende service-nøkkel), bobler det opp til kallerens 500. En klient som
 * leser SOM kalleren under RLS er `callerScopedClient` lenger ned.
 */
export async function authenticatedUser(
  request: NextRequest,
): Promise<AuthenticatedUser | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const { data, error } = await getAdminClient().auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null, accessToken: token };
}

/** Bruker-id fra Bearer-tokenet, eller `null` når kalleren ikke er autentisert. */
export async function authenticatedUserId(
  request: NextRequest,
): Promise<string | null> {
  return (await authenticatedUser(request))?.id ?? null;
}

/** Tokenet fra `Authorization: Bearer <token>`, eller `null`. */
function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * En Supabase-klient som leser med KALLERENS rettigheter under RLS (#2358).
 *
 * For de få oppslagene der svaret skal være det kalleren selv ser, slik
 * webbens RLS-klient gir det — ikke det tjenesteklienten ser. Første kunde:
 * synlighetssjekken i `inviteEmailToGameCore`, der tjenesteklienten så alle
 * kontoer og appen derfor avviste en registrert ikke-venn som nettsiden sendte
 * en e-postinvitasjon til.
 *
 * Anon-nøkkelen + kallerens token i `Authorization`, Supabase sitt mønster for
 * en klient på vegne av en bruker; supabase-js overstyrer ikke en header som
 * alt er satt. Kalles bare etter `authenticatedUser` eller `authenticatedUserId`,
 * så tokenet er validert. `null` uten token.
 */
export function callerScopedClient(
  request: NextRequest,
): SupabaseClient<Database> | null {
  const token = bearerToken(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) return null;
  return createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * Utfallet av arrangør-sjekken.
 *
 * Tre verdier og ikke en boolean, fordi ruta må kunne skille «spillet finnes
 * ikke» (404) fra «du er ikke arrangøren her» (403) — en boolean ville
 * kollapset dem til samme svar, og da måtte hver rute gjort sitt eget
 * oppslag for å skille dem. Da har regelen to hjem (AGENTS trap 4).
 */
export type GameOrganiserAccess = 'organiser' | 'not_organiser' | 'game_not_found';

/**
 * Den token-baserte tvillingen av `requireAdminOrCreator`: er brukeren
 * arrangør for dette spillet?
 *
 * Arrangør = klubb-admin (`users.is_admin`) ELLER den som opprettet runden
 * (`games.created_by`). Nøyaktig samme to-veis-regel som webbens
 * `loadAdminOrCreatorContext` bruker, uttrykt mot en id i stedet for en
 * cookie-sesjon.
 *
 * Lest med admin-klienten fordi ruta ikke har en RLS-klient å lese med (ingen
 * cookies). Det er derfor **kalleren** som er porten: hjelperen svarer, ruta
 * håndhever. Ingen rute skal kalle denne og så gjøre noe annet enn å svare
 * 403/404 på et negativt svar.
 */
export async function gameOrganiserAccess(
  userId: string,
  gameId: string,
): Promise<GameOrganiserAccess> {
  const admin = getAdminClient();

  const { data: game } = await admin
    .from('games')
    .select('created_by')
    .eq('id', gameId)
    .maybeSingle<{ created_by: string | null }>();

  // Ukjent spill svares som ukjent for ALLE — også for en admin. Ellers ville
  // 404-vs-403 lekket hvem som er admin til en tilfeldig kaller.
  if (!game) return 'game_not_found';

  if (game.created_by === userId) return 'organiser';

  const { data: profile } = await admin
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle<{ is_admin: boolean | null }>();

  return profile?.is_admin === true ? 'organiser' : 'not_organiser';
}

/** Hva appen vil gjøre med et levert scorekort (#2215). */
export type ScorecardDecision = 'approve' | 'reject' | 'reopen';

/**
 * Utfallet av porten foran `POST /api/games/{id}/scorecards/{userId}`.
 *
 * `role` går videre til kjernen som `approver_role` i `scorecard_approved`, så
 * kortet velger riktig reserve-tekst når godkjenneren mangler navn (#1598).
 * `organizer` (admin eller arrangør) er også vaktas unntak fra regelen om at
 * den som leverte kortet, ikke kan godkjenne det (#2200, 0191); ruta sender
 * det videre som `delivererMayApprove`.
 * `gameMode` og `gameName` er lest her uansett, og kjernen trenger dem (lagkort-
 * kaskaden, reopen-payloaden) — ruta slipper et andre oppslag.
 */
export type ScorecardReviewAccess =
  | {
      ok: true;
      role: 'peer' | 'organizer';
      gameMode: GameMode;
      gameName: string;
    }
  | { ok: false; reason: 'game_not_found' | 'not_active' | 'forbidden' };

/**
 * Får `userId` godkjenne, avvise eller åpne `playerUserId`s scorekort?
 *
 * **Dette er hele tilgangssjekken for ruta.** Kjernen skriver med service-role,
 * så vakt-triggerne (0103/0106/0168) no-op-er (`auth.uid()` er NULL) og RLS
 * slipper alt gjennom. Porten speiler derfor webbens regler, i denne
 * rekkefølgen, og rekkefølgen skal ikke snus:
 *
 * 1. Spillet finnes ikke → `game_not_found`, også for admin (samme regel som
 *    `gameOrganiserAccess`). Runden er ikke i gang → `not_active`.
 * 2. `reopen`: arrangøren (`gameOrganiserAccess`), også på egen rad — det er
 *    webbens `loadAdminOrCreatorContext`, og 0159 åpner egen rad for oppretteren.
 * 3. Attestant-regelen (`canApproveScorecardFor`) → `peer`. I et spill med én
 *    flight (≤4 aktive eller wolf) er alle i samme flight, så en oppretter som
 *    selv spiller får `peer` her — før arrangør-grenen. #2200: regelen får
 *    kortets `submitted_by_user_id`, så den som leverte kortet, ikke er
 *    attestant for det (vakta i 0191, som service-role hopper over). Er hen
 *    admin eller arrangør, faller hen til grenene under, som i vakta.
 * 4. Global admin → `organizer`, for begge valg og også på egen rad: webbens
 *    `loadAndAuthorize` slipper admin gjennom, og 0106 slipper admin forbi på
 *    egen rad.
 * 5. `approve` på en ANNENS rad fra arrangøren → `organizer`. Det er webbens
 *    overstyring (`adminApproveScorecard`). Oppretteren kan ikke avvise utenfor
 *    flighten (webben lar henne heller ikke) og aldri godkjenne sin egen rad
 *    (0106) — begge faller til `forbidden`.
 *
 * En feilet lesing kaster (ruta svarer 500), i stedet for å bli «ingen tilgang»
 * eller «finnes ikke»: databasen som ikke svarer er ikke et nei.
 */
export async function scorecardReviewAccess(
  userId: string,
  gameId: string,
  playerUserId: string,
  decision: ScorecardDecision,
): Promise<ScorecardReviewAccess> {
  const admin = getAdminClient();

  const { data: game, error: gameError } = await admin
    .from('games')
    .select('name, status, game_mode')
    .eq('id', gameId)
    .maybeSingle<{ name: string; status: string; game_mode: GameMode }>();
  if (gameError) throw new Error(`scorecardReviewAccess: ${gameError.message}`);
  if (!game) return { ok: false, reason: 'game_not_found' };
  if (game.status !== 'active') return { ok: false, reason: 'not_active' };

  const granted = (role: 'peer' | 'organizer'): ScorecardReviewAccess => ({
    ok: true,
    role,
    gameMode: game.game_mode,
    gameName: game.name,
  });
  const forbidden: ScorecardReviewAccess = { ok: false, reason: 'forbidden' };

  if (decision === 'reopen') {
    return (await gameOrganiserAccess(userId, gameId)) === 'organiser'
      ? granted('organizer')
      : forbidden;
  }

  const { data: roster, error: rosterError } = await admin
    .from('game_players')
    .select('user_id, flight_number, withdrawn_at, submitted_by_user_id')
    .eq('game_id', gameId)
    .returns<(FlightPlayer & { submitted_by_user_id: string | null })[]>();
  if (rosterError) throw new Error(`scorecardReviewAccess: ${rosterError.message}`);
  const submittedBy =
    roster?.find((p) => p.user_id === playerUserId)?.submitted_by_user_id ?? null;
  if (
    canApproveScorecardFor(roster ?? [], game.game_mode, userId, playerUserId, submittedBy)
  ) {
    return granted('peer');
  }

  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle<{ is_admin: boolean | null }>();
  if (profileError) throw new Error(`scorecardReviewAccess: ${profileError.message}`);
  if (profile?.is_admin === true) return granted('organizer');

  if (
    decision === 'approve' &&
    playerUserId !== userId &&
    (await gameOrganiserAccess(userId, gameId)) === 'organiser'
  ) {
    return granted('organizer');
  }

  return forbidden;
}

/** Utfallet av porten foran `POST /api/games/{id}/refresh`. */
export type GameRefreshAccess = 'allowed' | 'forbidden' | 'game_not_found';

/**
 * Får `userId` tømme web-cachen for dette spillet (#2215)?
 *
 * Bredere enn arrangøren, fordi wolf- og BBB-valgene i appen kommer fra
 * spillere: arrangøren (`gameOrganiserAccess`), ellers en AKTIV spiller i
 * runden (`game_players`-rad med `withdrawn_at IS NULL`). Ruta skriver ingen
 * rad — verst tenkelige misbruk er at en spiller tømmer sin egen rundes cache,
 * og det er ufarlig. En trukket spiller eller en fremmed får nei.
 */
export async function gameRefreshAccess(
  userId: string,
  gameId: string,
): Promise<GameRefreshAccess> {
  const organiser = await gameOrganiserAccess(userId, gameId);
  if (organiser === 'game_not_found') return 'game_not_found';
  if (organiser === 'organiser') return 'allowed';

  const { data: membership, error } = await getAdminClient()
    .from('game_players')
    .select('user_id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .is('withdrawn_at', null)
    .maybeSingle<{ user_id: string }>();
  // Samme regel som `scorecardReviewAccess`: en feilet lesing er ikke et nei.
  if (error) throw new Error(`gameRefreshAccess: ${error.message}`);
  return membership ? 'allowed' : 'forbidden';
}
