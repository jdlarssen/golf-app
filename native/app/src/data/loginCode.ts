// native/app/src/data/loginCode.ts
// #2216: appen ber om innloggingskode og kjører stegene etter innloggingen
// gjennom nettsiden.
//
// **Hvorfor ikke rett mot Supabase.** Fram til #2216 sendte appen koden selv,
// alltid uten å kunne lage en ny konto. Da fikk en ny spiller fra App Store en
// blindvei, og ingen av nettsidens sperrer gjaldt. Nå går «Send meg kode»
// gjennom `POST /api/auth/send-code`, som kaller samme kjerne som nettsidens
// skjema: fartsgrensen, bryteren for nye kontoer, sperren mot engangs-e-post og
// invitasjonen som åpner for ny konto. Appen har ingen av de reglene selv.
//
// **Etter innloggingen.** Appen verifiserer koden selv (`verifyOtp`), og
// kaller så `POST /api/auth/after-login`. Der tas invitasjonene i bruk som på
// nettsiden, så en invitert finner spillet sitt på Hjem. Kallet er
// best-effort: innloggingen er alt gjort, og en feil her skal aldri stoppe den.
//
// Fila står på aldri-auto-merge-lista (`lib/loops/autoMerge.ts`): den er en
// innloggingsflate.
import {
  SEND_LOGIN_CODE_ERRORS,
  type SendLoginCodeError,
} from '../../../../lib/auth/loginCodeErrors';
import type { LoginErrorCode } from '../lib/loginCopy';
import { callPublicWebRoute, callWebRoute } from './webApi';

export type RequestLoginCodeResult = { ok: true } | { ok: false; code: LoginErrorCode };

const KNOWN_CODES: ReadonlySet<string> = new Set(SEND_LOGIN_CODE_ERRORS);

function isSendLoginCodeError(value: unknown): value is SendLoginCodeError {
  return typeof value === 'string' && KNOWN_CODES.has(value);
}

/**
 * Be om en innloggingskode til `email`.
 *
 * Svaret er en kode, aldri en tekst: skjermen slår opp setningen med
 * `describeLoginError`. En kode ruta ikke burde kunne svare med blir `unknown`.
 * Uten nett, eller når kallet ikke kom fram, er svaret `network`. Mangler
 * bygget adressen til nettsiden, er det en byggefeil spilleren ikke kan gjøre
 * noe med, så den logges og vises som `unknown`.
 */
export async function requestLoginCode(email: string): Promise<RequestLoginCodeResult> {
  const call = await callPublicWebRoute('/api/auth/send-code', 'POST', { email });

  if (!call.ok) {
    if (call.reason === 'offline' || call.reason === 'network') {
      return { ok: false, code: 'network' };
    }
    console.error('[loginCode] send-code stoppet før kallet', call.reason);
    return { ok: false, code: 'unknown' };
  }

  if (call.status === 200) return { ok: true };
  const code = call.body.error;
  return { ok: false, code: isSendLoginCodeError(code) ? code : 'unknown' };
}

/**
 * Skal appen gå til kode-steget? Ja når koden ble sendt, og ved
 * ett-minutts-sperren: da ligger det alt en kode i innboksen, som på nettsiden
 * (`sendCode` sender deg til kodefeltet med samme feil).
 */
export function landsOnCodeStep(result: RequestLoginCodeResult): boolean {
  return result.ok || result.code === 'rate_limited_minute';
}

/**
 * Den pågående `finishLogin`, eller `null`. Porten foran stacken venter på den
 * ({@link afterLoginSettled}), så Hjem og «Fullfør profilen» leser etter at
 * invitasjonene er tatt i bruk.
 *
 * Settes synkront i starten av {@link finishLogin}. Login kaller den rett etter
 * at `verifyOtp` er ferdig; sesjonsbyttet som monterer porten rendres av React
 * etterpå, så porten finner alltid kallet som er i gang.
 */
let inFlight: Promise<void> | null = null;

/**
 * Stegene etter innloggingen: invitasjoner, vennskap, klubbinvitasjoner og
 * gjest-flagget, på serveren. Kalles rett etter at `verifyOtp` har satt
 * sesjonen. Kaster aldri, og logger alt som ikke er 200.
 */
export function finishLogin(): Promise<void> {
  const run = (async () => {
    try {
      const call = await callWebRoute('/api/auth/after-login', 'POST');
      if (!call.ok) {
        console.error('[loginCode] after-login stoppet før kallet', call.reason);
      } else if (call.status !== 200) {
        console.error('[loginCode] after-login svarte', call.status, call.body.error);
      }
    } catch (err) {
      console.error('[loginCode] after-login kastet', err);
    }
  })();
  inFlight = run;
  void run.finally(() => {
    if (inFlight === run) inFlight = null;
  });
  return run;
}

/** Hvor lenge porten venter på stegene etter innloggingen, i millisekunder. */
export const AFTER_LOGIN_WAIT_MS = 8_000;

/**
 * Svarer når en pågående {@link finishLogin} er ferdig, eller med en gang når
 * ingen er i gang. Aldri lenger enn `maxMs`: henger nettet, slipper porten
 * spilleren inn likevel, og spillet kommer på Hjem neste gang lista hentes.
 * Kaster aldri.
 */
export function afterLoginSettled(maxMs: number = AFTER_LOGIN_WAIT_MS): Promise<void> {
  const pending = inFlight;
  if (!pending) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, maxMs);
    void pending.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
