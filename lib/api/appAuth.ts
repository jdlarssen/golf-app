import 'server-only';
import type { NextRequest } from 'next/server';
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

/**
 * Bruker-id fra Bearer-tokenet, eller `null` når kalleren ikke er autentisert.
 *
 * Repoet har ingen fabrikk for en cookie-løs anon server-klient
 * (`getServerClient()` leser cookies, `getBrowserClient()` er browser-only), så
 * vi kaller `auth.getUser(token)` på admin-klienten: auth-js legger tokenet i
 * `Authorization` og lar service-nøkkelen stå som `apikey`, altså validerer
 * GoTrue tokenets signatur og utløp — ikke oss. Kaster `getAdminClient()`
 * (manglende service-nøkkel), bobler det opp til kallerens 500.
 */
export async function authenticatedUserId(
  request: NextRequest,
): Promise<string | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;

  const { data, error } = await getAdminClient().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
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
 *    selv spiller får `peer` her — før arrangør-grenen.
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
    .select('user_id, flight_number, withdrawn_at')
    .eq('game_id', gameId)
    .returns<FlightPlayer[]>();
  if (rosterError) throw new Error(`scorecardReviewAccess: ${rosterError.message}`);
  if (canApproveScorecardFor(roster ?? [], game.game_mode, userId, playerUserId)) {
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
