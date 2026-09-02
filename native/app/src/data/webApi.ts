// native/app/src/data/webApi.ts
// Native #1891: appens ene vei til en autentisert HTTP-rute på web-deployen.
//
// **Hvorfor rutene finnes.** Alt som krever Node — `notify()`, Resend-mail,
// push, service-role — er utenfor rekkevidde for en telefon. Regelen bor der
// den alltid har bodd, på serveren, og appen spør. #1876 (konto-sletting) satte
// mønsteret; #1889 (purring) er den andre brukeren, og #1917–#1919 arver det.
// Denne fila er grunnen til at det ikke blir en tredje variant.
//
// **Vakt-rekkefølgen ER kontrakten**, ikke en preferanse:
//
// 1. **Nett.** Disse kallene går ALDRI i sync-køen (samme v1-linje som starten
//    og roster-skrivingene), og svaret er heller ikke noe vi kan gjette lokalt.
//    Uten nett stopper vi her, i stedet for i en rå «Network request failed».
// 2. **Adressen.** `EXPO_PUBLIC_WEB_BASE_URL` bakes inn ved bundling. Mangler
//    den, er bygget feil — og da skal appen si det (ærlig-feil-guardrailen fra
//    `supabase.ts`), ikke la knappen gjøre ingenting. Selve lesingen bor i
//    `lib/webLink.ts`, som lenke-knappene deler med oss: én adresse-regel, ett
//    hjem (AGENTS trap 4). Lest her og ikke på modulnivå: et kast ved import
//    ville tatt ned hele appen for en skjerm de fleste aldri åpner.
// 3. **Tokenet.** Uten sesjon finnes det ingenting å autentisere med, og vi
//    sender ikke et kall vi vet blir avvist.
//
// **Kallet har ingen kropp og ingen query.** Bruker-id-en kommer utelukkende
// fra tokenet serveren validerer; sender appen aldri en id, finnes det ingen id
// å forveksle med en annens. Alt som skal identifisere noe annet enn brukeren
// står i STIEN (`/api/games/<id>/remind`), og gates av ruta.
//
// Utfallene er TYPEDE koder, aldri bruker-tekst (samme linje som `startGame.ts`
// og `rosterActions.ts`). HTTP-status oversettes én gang, i kaller-modulen, slik
// at skjermen aldri leser et statusnummer.
import { webUrl } from '../lib/webLink';
import { supabase } from '../supabase';
import { isDeviceOnline } from './syncTriggers';

/**
 * Det som kan stoppe et kall FØR ruta har sagt noe.
 *
 * Bevisst uten wire-koder: alt her er appens egen tilstand. Hva ruta svarte
 * oversetter hver kaller selv, med sitt eget vokabular (`AccountDeleteFailure`,
 * `ReminderFailure`) — statusnumrene betyr ikke det samme for to ulike ruter.
 */
export type WebApiFailure = 'offline' | 'no-web-base-url' | 'unauthorized' | 'network';

/** Det ruta kan svare med, etter at JSON-en er lest trygt. */
export type WebApiCall =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; reason: WebApiFailure };

/**
 * Bearer-tokenet for denne enheten, eller `null` når vi ikke har en sesjon.
 *
 * Samme form som `currentDeviceUserId` i `supabase.ts`: `getSession` leser
 * lokalt lager og svarer også uten nett, og et kast skal aldri velte flyten —
 * det leses som «ingen sesjon», og kalleren stopper med `unauthorized` i stedet
 * for å sende et kall uten token.
 */
async function accessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Kroppen som et objekt, uansett hva som kom.
 *
 * En 500 kan komme fra et lag foran appen vår og være HTML, og en 401 kan være
 * tom. `response.json()` kaster på begge. Statusen har vi allerede lest, så et
 * uleselig svar skal ikke bli en annen feil enn den statusen sier.
 */
async function readBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await response.json();
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Ett kall mot en app→server-rute, med alle guardene foran i fast rekkefølge.
 *
 * @param path stien på web-deployen, f.eks. `/api/account/delete`.
 * @param method verbet ruta forventer. Ingen av rutene tar en kropp.
 */
export async function callWebRoute(
  path: string,
  method: 'GET' | 'POST',
): Promise<WebApiCall> {
  if (!isDeviceOnline()) return { ok: false, reason: 'offline' };

  const target = webUrl(path);
  if (!target.ok) return { ok: false, reason: target.reason };

  const token = await accessToken();
  if (!token) return { ok: false, reason: 'unauthorized' };

  try {
    const response = await fetch(target.url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    return { ok: true, status: response.status, body: await readBody(response) };
  } catch (err) {
    console.error(`[webApi] ${method} ${path} feilet`, err);
    return { ok: false, reason: 'network' };
  }
}
