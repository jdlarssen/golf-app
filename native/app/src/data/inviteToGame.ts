// native/app/src/data/inviteToGame.ts
// Native #1919: «Inviter med e-post» fra arrangør-seksjonen.
//
// **Hvorfor en rute og ikke en skriving.** Invitasjonen er en `invitations`-rad
// pluss en Resend-mail, og mailen er `server-only` med service-role. I tillegg
// er appens kandidatliste medspiller-scopet under RLS, mens webbens union
// (venner ∪ medspillere ∪ klubbmedlemmer) leses med service-role. Regelen om
// hvem som kan inviteres, hva som skjer når adressen alt har en konto, og
// rollbacken når mailen feiler, bor i `lib/games/inviteToGame.ts` — appen
// speiler ingenting av den (AGENTS trap 4).
//
// Fram til nå sto det en setning der handlingen skulle vært: «Nye folk inviterer
// du fra nettsiden.» #1891 ga den en lenke; nå finnes handlingen.
//
// **Wire-kontrakten er frosset** og står i ruta
// (`app/api/games/[id]/invite/route.ts`). Denne fila er den andre halvdelen av
// den; endres den ene, endres den andre i samme PR:
//   POST { email } 200 { status: 'added' | 'sent' }
//   400 invalid_email | disposable_email
//   401 unauthorized · 403 forbidden · 404 not_found
//   409 game_locked | game_full | invite_not_allowed
//   429 rate_limited · 500 invite_failed
//
// **Her MÅ kroppen leses.** `remind.ts` og `withdrawSelf.ts` slipper unna fordi
// én status er én kode hos dem; 400 og 409 bærer hver flere koder her, og
// forskjellen mellom «sjekk adressen» og «denne adressen kan vi ikke sende til»
// er forskjellen på en setning arrangøren kan handle på og en som bare sier nei.
//
// Vakt-rekkefølgen (nett → adresse → token → kall) og den trygge kropp-lesingen
// er `webApi.ts` sin. Ingen bruker-tekst — `rosterCopy.ts` eier setningene.
import { callWebRoute, type WebApiFailure } from './webApi';

/**
 * Hvorfor invitasjonen ikke gikk gjennom.
 *
 * De fire første er appens egen tilstand ({@link WebApiFailure}); resten er
 * `error`-verdiene ruta svarer med, og beholder derfor wire-stavemåten med
 * understrek — samme blanding som `ReminderFailure` og `SelfWithdrawFailure`.
 *
 * `invite_failed` er catch-all for alt ruta ikke navnga, også en 500 og en kode
 * vi ikke kjenner.
 */
export type InviteFailure =
  | WebApiFailure
  | 'forbidden'
  | 'not_found'
  | 'invalid_email'
  | 'disposable_email'
  | 'game_locked'
  | 'game_full'
  | 'invite_not_allowed'
  | 'rate_limited'
  | 'invite_failed';

/**
 * `added` = adressen hadde alt en konto, og spilleren står nå i runden.
 * `sent` = invitasjonen er på vei som e-post.
 *
 * To utfall og ikke ett, fordi kvitteringen skal si hva som faktisk skjedde: en
 * arrangør som får «Invitasjon sendt» og så ser spilleren i lista med én gang,
 * lurer på om det ble sendt en mail i tillegg.
 */
export type InviteResult =
  | { ok: true; kind: 'added' | 'sent' }
  | { ok: false; reason: InviteFailure };

/**
 * Stien for ett spill. `encodeURIComponent` selv om id-en er en uuid fra vår
 * egen bundle: en sti bygget av data skal kodes der den bygges, ikke der noen
 * senere antar at den var trygg.
 */
function invitePath(gameId: string): string {
  return `/api/games/${encodeURIComponent(gameId)}/invite`;
}

/**
 * Kodene 400 og 409 kan bære. `Record<…, true>` er porten: legger ruta til en
 * femte kode og ingen legger den til her, faller `tsc` på den manglende
 * nøkkelen i stedet for at koden stille blir til «Noe gikk galt». Samme vakt
 * som `readValidationError` i `profile.ts`.
 */
type BodyCode =
  | 'invalid_email'
  | 'disposable_email'
  | 'game_locked'
  | 'game_full'
  | 'invite_not_allowed';

const BODY_CODES: Record<BodyCode, true> = {
  invalid_email: true,
  disposable_email: true,
  game_locked: true,
  game_full: true,
  invite_not_allowed: true,
};

/** Kroppens `error`, eller `undefined` når den ikke er en kode vi kjenner. */
function readBodyCode(value: unknown): BodyCode | undefined {
  return typeof value === 'string' && Object.hasOwn(BODY_CODES, value)
    ? (value as BodyCode)
    : undefined;
}

/**
 * Status → kode, oversatt ÉN gang, slik at skjermen aldri leser et statusnummer.
 *
 * Fail-closed: en 400 eller 409 med en kode vi ikke kjenner blir `invite_failed`
 * i stedet for å bli vist som en tom setning.
 */
function failureFor(status: number, body: Record<string, unknown>): InviteFailure {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status === 400 || status === 409) {
    return readBodyCode(body.error) ?? 'invite_failed';
  }
  return 'invite_failed';
}

/**
 * Inviter en e-postadresse inn i runden.
 *
 * Kroppen bærer bare adressen. **Ingen bruker-id og ingen spill-id** — hvem som
 * inviterer er tokenets sak, og hvilken runde det gjelder står i stien. Sender
 * appen dem aldri, finnes det ingen id å forveksle med en annens.
 *
 * **Skrivingen legges aldri i sync-køen.** Den har ingen lokal-først-vei
 * (regelen og mailen kjøres på serveren), så uten nett stopper `callWebRoute`
 * med `offline`, og copyen sier at det krever tilkobling.
 *
 * **Fail-closed på et uleselig utfall.** Kommer 200 uten en `status` vi kjenner,
 * har wiren driftet: da vet vi ikke om det ble sendt en mail eller lagt til en
 * spiller, og en gjettet kvittering er verre enn en feil.
 */
export async function inviteToGame(
  gameId: string,
  email: string,
): Promise<InviteResult> {
  const call = await callWebRoute(invitePath(gameId), 'POST', { email });
  if (!call.ok) return call;

  if (call.status === 200) {
    const status = call.body.status;
    if (status === 'added' || status === 'sent') return { ok: true, kind: status };
    return { ok: false, reason: 'invite_failed' };
  }

  return { ok: false, reason: failureFor(call.status, call.body) };
}
