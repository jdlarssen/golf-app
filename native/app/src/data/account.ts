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
// mønsteret ble satt: nett-gate først, så konfigurasjon, så token, så kallet;
// alle utfall som TYPEDE koder (ingen bruker-tekst i datalaget, som i
// `startGame.ts` og `rosterActions.ts`); og HTTP-status oversettes én gang, her,
// slik at skjermen aldri leser et statusnummer.
//
// Selve kallet bor ikke lenger her. #1891 ga purringen en rute til, og da måtte
// mønsteret ha ett hjem i stedet for to kopier: vakt-rekkefølgen, tokenet og
// den trygge kropp-lesingen ligger i `webApi.ts`, som denne fila og
// `remind.ts` deler. Igjen står det som er slette-spesifikt — stien, wiren og
// rekkefølgen under.
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
import { callWebRoute } from './webApi';

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
  const call = await callWebRoute(DELETE_PATH, 'GET');
  if (!call.ok) return call;

  if (call.status === 200) {
    const raw = call.body.blocked;
    // `null` betyr «ikke blokkert» og er det vanlige svaret. En ukjent streng
    // betyr at wiren har driftet: da vet vi ikke om kontoen kan slettes, og
    // fail-closed er å si nettopp det i stedet for å vise knappen.
    // Bare eksplisitt `null` er «ikke blokkert». Mangler feltet helt, har wiren
    // driftet (eller kroppen var uleselig og ble vasket til {}) — og da vet vi
    // ikke om kontoen kan slettes. Samme fail-closed som for en ukjent streng.
    if (raw === null) return { ok: true, blocked: null };
    if (raw === undefined) return { ok: false, reason: 'status_failed' };
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
  const call = await callWebRoute(DELETE_PATH, 'POST');
  if (!call.ok) return call;

  if (call.status === 200) {
    // Herfra er kontoen SLETTET. Alt under er lokal opprydding, og ingenting av
    // det kan gjøre slettingen ugjort — derfor rapporteres en feil her aldri som
    // «slettingen feilet». Sier vi det, ber vi brukeren prøve igjen på en konto
    // som ikke finnes, og neste forsøk svarer 401.
    try {
      await wipeLocalData();
    } catch (err) {
      // Basen er lokal og sesjonen ryker uansett i steget under, så enheten
      // ender uten vei tilbake til dataene. Logg og gå videre.
      console.error('[deleteAccount] lokal wipe feilet', err);
    }
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
