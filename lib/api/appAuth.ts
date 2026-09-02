import 'server-only';
import type { NextRequest } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

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
