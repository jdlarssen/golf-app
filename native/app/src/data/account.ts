// native/app/src/data/account.ts
// Native #1876: konto-sletting fra appen (App Store 5.1.1(v)).
//
// **Hvorfor appen går via web-deployen.** Slettingen er ren service-role:
// `anonymize_user`-RPC-en er `security definer` med execute kun for
// `service_role`, og GoTrue-softdeleten er et admin-API. En telefon kan aldri
// holde den nøkkelen, så regelen bor der den alltid har bodd
// (`lib/users/deleteAccount.ts`) og appen snakker med den gjennom ruta
// `app/api/account/delete/route.ts`. Appen speiler ingen blokk-regel — den
// spør, og viser svaret.
//
// **Appens første fetch-modul.** Alt annet i `src/data/` går gjennom
// `supabase.from`/`.rpc`. Her finnes ingen postgrest-vei, så dette er stedet
// mønsteret settes: nett-gate først, så konfigurasjon, så token, så kallet;
// alle utfall som TYPEDE koder (ingen bruker-tekst i datalaget, som i
// `startGame.ts` og `rosterActions.ts`); og HTTP-status oversettes én gang, her,
// slik at skjermen aldri leser et statusnummer.
//
// **Wire-kontrakten er frosset** og står i ruta. Denne fila er den andre halvdelen
// av den; endres den ene, endres den andre i samme PR:
//   GET  200 { blocked: 'admin_account' | 'active_engagements' | null }
//        401 { error: 'unauthorized' }   500 { error: 'status_failed' }
//   POST 200 { mode: 'hard' | 'anonymized' }
//        401 · 403 { error: <blokk-kode> } · 500 { error: 'delete_failed' }
//
// **Rekkefølgen i {@link deleteAccount} er selve kontrakten**, ikke en
// preferanse: POST → (kun ved 200) wipe av lokal base → lokal `signOut`. Det er
// den ene tingen i slicen som kan ødelegge data for en bruker som IKKE ble
// slettet, og den er testet som rekkefølge, ikke bare som «begge ble kalt».
import type { AccountDeleteFailure, DeleteBlockReason } from '../lib/accountCopy';
import { supabase } from '../supabase';
import { wipeLocalData } from './db';
import { isDeviceOnline } from './syncTriggers';

/** Ruta appen snakker med. Én sti, to verb. */
const DELETE_PATH = '/api/account/delete';

/** Hvilken gren serveren tok. Kun til logg og staging-bevis, aldri til copy. */
export type DeleteMode = 'hard' | 'anonymized';

/**
 * Svaret på «kan denne kontoen slettes?».
 *
 * `blocked: null` er det normale ja-et. Er den satt, viser skjermen banneret og
 * INGEN slette-knapp — samme oppførsel som webbens `/profile/slett-konto`.
 */
export type AccountDeleteStatus =
  | { ok: true; blocked: DeleteBlockReason | null }
  | { ok: false; reason: AccountDeleteFailure };

/**
 * Utfallet av selve slettingen.
 *
 * `mode` er informasjon, ikke et resultat: ved `ok: true` ER kontoen borte
 * uansett hva som står der. Se {@link readMode} for hvorfor den kan være null.
 */
export type AccountDeleteResult =
  | { ok: true; mode: DeleteMode | null }
  | { ok: false; reason: AccountDeleteFailure };

/** Det ruta kan svare med, etter at JSON-en er lest trygt. */
type WireCall =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; reason: AccountDeleteFailure };

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
 * Ett kall mot ruta, med alle guardene foran i fast rekkefølge.
 *
 * 1. **Nett.** Skrivingen går aldri i sync-køen (samme v1-linje som
 *    starten og roster-skrivingene), og statusen er heller ikke noe vi kan
 *    gjette lokalt. Uten nett stopper begge her, i stedet for i en rå «Network
 *    request failed».
 * 2. **Adressen.** `EXPO_PUBLIC_WEB_BASE_URL` bakes inn ved bundling. Mangler
 *    den, er bygget feil — og da skal appen si det (ærlig-feil-guardrailen fra
 *    `supabase.ts`), ikke la knappen gjøre ingenting. Lest her og ikke på
 *    modulnivå: et kast ved import ville tatt ned hele appen for en skjerm de
 *    fleste aldri åpner.
 * 3. **Tokenet.** Uten sesjon finnes det ingenting å autentisere med, og vi
 *    sender ikke et kall vi vet blir avvist.
 *
 * Kallet har **ingen kropp og ingen query**. Bruker-id-en kommer utelukkende fra
 * tokenet serveren validerer; sender appen aldri en id, finnes det ingen id å
 * forveksle med en annens.
 */
async function callRoute(method: 'GET' | 'POST'): Promise<WireCall> {
  if (!isDeviceOnline()) return { ok: false, reason: 'offline' };

  const baseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim();
  if (!baseUrl) return { ok: false, reason: 'no-web-base-url' };

  const token = await accessToken();
  if (!token) return { ok: false, reason: 'unauthorized' };

  try {
    const response = await fetch(
      `${baseUrl.replace(/\/+$/, '')}${DELETE_PATH}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
    );
    return { ok: true, status: response.status, body: await readBody(response) };
  } catch (err) {
    console.error(`[account] ${method} ${DELETE_PATH} feilet`, err);
    return { ok: false, reason: 'network' };
  }
}

/**
 * Blokk-koden fra kroppen, eller `undefined` når den ikke er en vi kjenner.
 *
 * En ukjent kode slippes ALDRI videre: `describeDeleteBlock` og
 * `describeDeleteFailure` har uttømmende switch-er uten `default`, så en streng
 * utenfra ville gitt `undefined` som setning. Kaller-ne oversetter derfor
 * `undefined` til sin egen «dette gikk ikke»-kode.
 */
function readBlockReason(value: unknown): DeleteBlockReason | undefined {
  return value === 'admin_account' || value === 'active_engagements'
    ? value
    : undefined;
}

/**
 * Hvilken gren serveren tok, eller `null` hvis svaret ikke sa det.
 *
 * Null er ikke en feil. Vi er her fordi statusen var 200 — kontoen ER slettet —
 * og å kalle det mislykket fordi et informasjonsfelt manglet, ville fortalt
 * spilleren det motsatte av det som skjedde.
 */
function readMode(value: unknown): DeleteMode | null {
  return value === 'hard' || value === 'anonymized' ? value : null;
}

/**
 * Kan kontoen slettes? Kalles FØR bekreftelsesskjermen viser knappen.
 *
 * Svaret er kun til visning. POST-en sjekker regelen på nytt og er den
 * autoritative — noe kan ha startet i mellomtiden, og appen avgjør ingenting
 * selv.
 */
export async function fetchDeleteStatus(): Promise<AccountDeleteStatus> {
  const call = await callRoute('GET');
  if (!call.ok) return call;

  if (call.status === 200) {
    const raw = call.body.blocked;
    // `null` betyr «ikke blokkert» og er det vanlige svaret. En ukjent streng
    // betyr at wiren har driftet: da vet vi ikke om kontoen kan slettes, og
    // fail-closed er å si nettopp det i stedet for å vise knappen.
    if (raw === null || raw === undefined) return { ok: true, blocked: null };
    const blocked = readBlockReason(raw);
    return blocked
      ? { ok: true, blocked }
      : { ok: false, reason: 'status_failed' };
  }

  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  return { ok: false, reason: 'status_failed' };
}

/**
 * Slett kontoen, og etterlat ingenting på enheten.
 *
 * Rekkefølgen er regelen:
 *
 * 1. **POST.** Serveren sletter eller anonymiserer og revokerer sesjonene.
 * 2. **Kun ved 200: {@link wipeLocalData}.** Lokal base tømmes først, mens
 *    appen fortsatt står på skjermen og kan vente på at kallet fullfører.
 * 3. **`signOut({ scope: 'local' })`.** Sesjonene er alt revokert av GoTrue, så
 *    global scope ville bare gitt 403-støy. Dette steget er også det som
 *    rydder opp etter seg selv: `App.tsx` lytter på `onAuthStateChange`, setter
 *    sesjonen til null og bytter til Login-stacken, hvorpå hver skjerm
 *    unmountes og `useEffect`-opprydingene deres stopper sync-triggerne og
 *    realtime-abonnementene. Appen har ingen `stopSync()`-primitiv, og trenger
 *    ingen — unmount-kaskaden ER stoppen.
 *
 * **Aldri wipe på 401, 403, 500 eller nettverksfeil.** En 401 betyr som oftest
 * bare at tokenet gikk ut mens skjermen sto åpen; kontoen lever, og en wipe der
 * ville slettet lokale data for en bruker som fortsatt har dem. Det samme
 * gjelder de andre grenene: ingenting er slettet på serveren, altså skal
 * ingenting slettes her.
 *
 * Om wipen: den står i `withTxn`-køen og kolliderer derfor aldri med en åpen
 * skriving fra sync-drainen. Den lover ikke mer enn det — en drain som er
 * midt i en nettverks-rundtur når wipen commiter, kan rekke å legge igjen en
 * rad etterpå. I praksis tar signOut-kaskaden rett under den, og blokk-regelen
 * har alt garantert at brukeren ikke er med i noe aktivt spill, så køen er tom.
 */
export async function deleteAccount(): Promise<AccountDeleteResult> {
  const call = await callRoute('POST');
  if (!call.ok) return call;

  if (call.status === 200) {
    await wipeLocalData();
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      // Kontoen ER slettet. Feiler den lokale utloggingen, er sesjonen uansett
      // død på serversiden og neste kall faller på 401 — å svare «det gikk
      // galt» her ville sagt det motsatte av det som skjedde.
      console.error('[deleteAccount] lokal signOut feilet', err);
    }
    return { ok: true, mode: readMode(call.body.mode) };
  }

  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status === 403) {
    return { ok: false, reason: readBlockReason(call.body.error) ?? 'delete_failed' };
  }
  return { ok: false, reason: 'delete_failed' };
}
