// native/app/src/data/logout.ts
// Native #1877: utlogging som rydder etter seg — uten å kaste et eneste slag.
//
// **Hvorfor regelen bor her og ikke i skjermen.** Webben har den samme regelen i
// `lib/sync/localDataCleanup.ts` (#1404, som stammer fra #819: én brukers data
// skal aldri nå den neste på samme telefon). Den koden kan ikke importeres — den
// er bundet til Dexie hele veien inn i beslutningen — så appen speiler MENINGEN,
// ikke koden: drain best-effort, tøm KUN når køen er tom. Speilet skal ha ett
// hjem, og det er denne fila. Skjermen spør og viser svaret.
//
// **Rekkefølgen ER kontrakten**, og den er motsatt av `deleteAccount`:
//
//   tell kø → (drain) → tell på nytt → signOut → wipe (kun når køen var tom)
//
// Ved sletting er kontoen borte når vi rydder, og wipen er ren opprydding —
// derfor wipe FØR signOut der. Her lever kontoen: sesjonen skal dø FØRST, slik
// at en drain som fortsatt puster mister tilgangen sin og ikke rekker å skrive
// nye rader inn ETTER at basen er tømt.
//
// **Det ene som aldri får skje:** at et utastet slag forsvinner fordi spilleren
// logget ut på en teeboks uten dekning. Er køen ikke tom, logger vi ikke ut i
// det hele tatt — vi svarer `unsent` og lar skjermen spørre. Sier spilleren ja
// (`keepUnsent`), logger vi ut UTEN wipe: radene blir liggende på enheten.
// (De blir liggende — ikke mer enn det. Karantene-rader (#668) er gitt opp for
// godt og prøver aldri igjen, og logger en ANNEN bruker inn på telefonen, har
// appen ingen eier-vakt som rydder dem. Copyen lover derfor ikke levering.)
import { supabase } from '../supabase';
import { getDb, listQueue, wipeLocalData } from './db';
import { drainQueue } from './syncWorker';

/**
 * Hvor lenge utloggingen venter på drainen. Samme tall som webbens
 * `LOGOUT_DRAIN_TIMEOUT_MS` — en utlogging skal aldri stå og henge på et nett
 * som ikke svarer, og et tidsavbrudd er alltid trygt: da ser køen fortsatt
 * ikke-tom ut, og vi beholder alt.
 */
export const LOGOUT_DRAIN_TIMEOUT_MS = 4_000;

/**
 * Utfallet av et utloggingsforsøk.
 *
 * `unsent` er ikke en feil — det er et spørsmål. Ingenting har skjedd når den
 * returneres: ingen signOut, ingen wipe. Spilleren kan avbryte og står nøyaktig
 * der hen sto, med `pending` slag fortsatt på enheten.
 *
 * `signout-failed` er derimot en ekte feil, og den betyr én bestemt ting: vi vet
 * IKKE at sesjonen er borte, så vi har ikke rørt basen. Se
 * {@link signOutAndConfirm}.
 */
export type LogoutResult =
  | { ok: true }
  | { ok: false; reason: 'unsent'; pending: number }
  | { ok: false; reason: 'signout-failed' };

/**
 * Hvor mange kø-rader som ligger igjen — ALLE, også karantene-radene (#668).
 *
 * En karantene-rad er et slag som ga opp etter fem permanente feil; den kommer
 * aldri til å gå opp av seg selv. For spilleren er det likevel et slag som ikke
 * kom fram, og det teller like mye som et som fortsatt prøver. `listQueue`
 * leser hele tabellen, og det er med vilje.
 */
async function pendingCount(): Promise<number> {
  const db = await getDb();
  return (await listQueue(db)).length;
}

/**
 * Ett forsøk på å tømme køen, med tak på ventetiden.
 *
 * Et kast fra drainen er IKKE en feil her — offline er den vanligste grunnen
 * til at noen har rader i kø i det hele tatt. Tellingen etterpå avgjør, ikke
 * dette kallet. Timeren ryddes uansett hvem som vinner kappløpet, ellers holder
 * den jest-suiten (og enhetens event-loop) i live i fire sekunder til ingen
 * nytte.
 */
async function drainWithinTimeout(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, LOGOUT_DRAIN_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      drainQueue('utlogging').then(
        () => undefined,
        () => undefined,
      ),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Logg ut, og svar på om den lokale sesjonen FAKTISK ble borte.
 *
 * **Hvorfor dette ikke bare er `!error`.** auth-js 2.112.4 kaster ikke, den
 * resolver med `{ error }` — men en feil betyr to helt forskjellige ting, og
 * bare den ene er trygg å tømme basen på (lest i
 * `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js`):
 *
 * - **Sesjonen ble fjernet, og så kom feilen.** Serveren svarte ikke, eller
 *   svarte noe annet enn 401/403/404. `_signOut` kaller `removeCurrentSession()`
 *   FØR den returnerer feilen. Dette er den vanlige offline-utloggingen, og
 *   spilleren ER logget ut.
 * - **Sesjonen ble stående.** Er access-tokenet utløpt OG refresh-forsøket
 *   feiler med en nettverksfeil, hopper `_callRefreshToken` over `_removeSession`
 *   (den grenen kjører kun for feil som IKKE er retryable), `__loadSession`
 *   svarer `{ session: null, error }`, og `_signOut` returnerer den feilen med
 *   en tidlig `return` — før `removeCurrentSession()`. Sesjonen ligger fortsatt
 *   i AsyncStorage. Dette treffer nøyaktig én situasjon, og det er en vi må
 *   regne med: offline i mer enn en time, altså en runde uten dekning.
 *
 * `getSession()` kan ikke skille dem — den svarer `session: null` i BEGGE
 * tilfellene. Det som kan, er `SIGNED_OUT`: `_removeSession()` avslutter med å
 * varsle abonnentene, og `_signOut` venter på det kallet. Har eventet kommet når
 * `signOut()` resolver, ER sesjonen borte. Derfor lyttes det her.
 *
 * Uten denne sjekken ville den nest siste grenen tømt hele den lokale basen for
 * en spiller som fortsatt er innlogget — og svart at utloggingen gikk bra.
 */
async function signOutAndConfirm(): Promise<boolean> {
  let removed = false;
  // Abonnementet settes FØR kallet: `_notifyAllSubscribers` kjører inne i
  // `signOut()`, ikke etter den.
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') removed = true;
  });
  try {
    const { error } = await supabase.auth.signOut();
    if (!error) return true;
    console.error('[logOut] signOut svarte med feil', error);
    return removed;
  } finally {
    data.subscription.unsubscribe();
  }
}

/**
 * Logg ut, og la ingenting ligge igjen til neste bruker av telefonen.
 *
 * @param opts.keepUnsent Spilleren har svart ja på «logg ut likevel». Da hoppes
 * `unsent`-porten over OG wipen droppes — det er hele poenget med å beholde.
 *
 * Merk `inFlight`-vakten i `syncWorker`: pågår det alt en drain (intervallet,
 * app-i-forgrunnen, nett tilbake), returnerer `drainQueue` med én gang uten å
 * gjøre noe. Køen ser da fortsatt ikke-tom ut, og vi beholder alt. Det er ingen
 * bug — vi mister ingenting, spilleren får spørsmålet, og neste utlogging (eller
 * neste drain) rydder. Låst i test så det ikke leses som en glipp.
 *
 * Om unmount-kaskaden: appen har ingen `stopSync()`-primitiv og skal ikke få en.
 * `signOut` fyrer `SIGNED_OUT`, `App.tsx` setter sesjonen til null og bytter til
 * Login-stacken, og da unmountes hver skjerm og `useEffect`-oppryddingene deres
 * stopper triggerne. Kaskaden ER stoppen — samme mekanikk som `deleteAccount`
 * hviler på.
 */
export async function logOut(opts?: {
  keepUnsent?: boolean;
}): Promise<LogoutResult> {
  let pending = await pendingCount();

  if (pending > 0) {
    await drainWithinTimeout();
    pending = await pendingCount();
  }

  if (pending > 0 && !opts?.keepUnsent) {
    return { ok: false, reason: 'unsent', pending };
  }

  // Vet vi ikke at sesjonen er borte, rører vi ingenting. Se
  // `signOutAndConfirm` for det ene tilfellet der auth-js svarer med feil OG
  // beholder sesjonen — det er nettopp en teeboks uten dekning.
  if (!(await signOutAndConfirm())) {
    return { ok: false, reason: 'signout-failed' };
  }

  // Kun når køen var tom. Med `keepUnsent` står radene igjen med vilje.
  if (pending === 0) {
    try {
      await wipeLocalData();
    } catch (err) {
      // Sesjonen er alt borte, så enheten har ingen vei tilbake til dataene.
      // Å rapportere utloggingen som mislykket her ville sendt spilleren tilbake
      // til en skjerm hen ikke lenger er innlogget på.
      console.error('[logOut] lokal wipe feilet', err);
    }
  }

  return { ok: true };
}
