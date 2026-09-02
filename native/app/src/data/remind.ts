// native/app/src/data/remind.ts
// Native #1889: «Purr på dem som mangler» fra avslutt-skjermen.
//
// **Hvorfor en rute og ikke en skriving.** Purringen er `notify()` + Resend +
// push, og alle tre er `server-only` med service-role. Regelen om HVEM som
// purres bor i `selectDeliveryReminderTargets` (`lib/games/deliveryStatus.ts`)
// og kanal-regelen i `notify()` — appen speiler ingen av dem (AGENTS trap 4).
// Den spør ruta og viser svaret.
//
// Uten dette sto arrangøren med bare én vei videre når noen manglet kort: å
// merke dem som trukket. En destruktiv handling presentert som eneste
// alternativ. Nå finnes den ikke-destruktive.
//
// **Wire-kontrakten er frosset** og står i ruta
// (`app/api/games/[id]/remind/route.ts`). Denne fila er den andre halvdelen av
// den; endres den ene, endres den andre i samme PR:
//   GET  200 { targets: number, lastRemindedAt: string | null }
//   POST 200 { reminded: number }
//   401 unauthorized · 403 forbidden · 404 not_found · 409 not_active
//   500 remind_failed
//
// Vakt-rekkefølgen (nett → adresse → token → kall) og den trygge kropp-lesingen
// er `webApi.ts` sin; her ligger bare oversettelsen fra status til kode og
// avlesningen av de tre feltene. Ingen bruker-tekst — skjermen eier setningene,
// slik `endGameCopy.ts` eier dem for `endGame.ts`.
import { callWebRoute, type WebApiFailure } from './webApi';

/**
 * Hvorfor purringen ikke gikk gjennom.
 *
 * De fire første er appens egen tilstand ({@link WebApiFailure}); resten er
 * `error`-verdiene ruta svarer med, og beholder derfor wire-stavemåten med
 * understrek. Blandingen er den samme som i `accountCopy.ts` og med vilje: en
 * kode som kom fra nettverket skal se ut som det den kom som.
 *
 * `remind_failed` er catch-all for alt ruta ikke navnga — også en 500 på GET.
 * Wiren har bare den ene 500-koden, og to app-egne synonymer for «dette gikk
 * ikke» ville bare gitt skjermen et valg den ikke trenger å ta.
 */
export type ReminderFailure =
  | WebApiFailure
  | 'forbidden'
  | 'not_found'
  | 'not_active'
  | 'remind_failed';

/**
 * Hvor mange purringen ville truffet, og når noen sist fikk en.
 *
 * `targets` er de som er FERDIGE uten å ha levert — ikke alle som mangler kort.
 * Differansen er de som fortsatt spiller, og dem hjelper det ikke å purre på;
 * skjermen sier det med en setning i stedet for en knapp.
 *
 * `lastRemindedAt` er `max(deliver_reminder_sent_at)` over spillet, altså også
 * auto-purringens stempel. Det ER «sist noen fikk purring», og det er det
 * spørsmålet arrangøren stiller før hen trykker igjen.
 */
export type ReminderPreview =
  | { ok: true; targets: number; lastRemindedAt: string | null }
  | { ok: false; reason: ReminderFailure };

export type ReminderResult =
  | { ok: true; reminded: number }
  | { ok: false; reason: ReminderFailure };

/**
 * Stien for ett spill. `encodeURIComponent` selv om id-en er en uuid fra vår
 * egen bundle: en sti bygget av data skal kodes der den bygges, ikke der noen
 * senere antar at den var trygg.
 */
function remindPath(gameId: string): string {
  return `/api/games/${encodeURIComponent(gameId)}/remind`;
}

/**
 * Status → kode, oversatt ÉN gang. Alt over 200 ender her, slik at skjermen
 * aldri leser et statusnummer.
 *
 * Kroppens `error`-felt leses bevisst ikke: ruta sender de samme kodene som
 * statusene betyr, og å stole på begge ville gitt to sannheter om samme svar.
 */
function failureForStatus(status: number): ReminderFailure {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'not_active';
  return 'remind_failed';
}

/** Et endelig, ikke-negativt heltall, eller `undefined` når feltet ikke er det. */
function readCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

/** Tidsstempelet som streng, eller `null` for både `null` og alt uleselig. */
function readTimestamp(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Hvor mange en purring ville truffet nå. Kalles FØR knappen tegnes.
 *
 * Svaret er kun til visning. POST-en teller på nytt og er den autoritative —
 * noen kan ha levert i mellomtiden, og appen avgjør ingenting selv.
 *
 * **Fail-closed på et uleselig antall.** Kommer 200 uten et brukbart `targets`,
 * har wiren driftet, og da vet vi ikke hvem knappen ville truffet. Å gjette 0
 * ville skjult knappen for en arrangør som trengte den; å gjette noe annet
 * ville satt et tall på den vi ikke kan stå for. Samme fail-closed som
 * `fetchDeleteStatus` gjør på en ukjent blokk-kode.
 */
export async function fetchReminderPreview(gameId: string): Promise<ReminderPreview> {
  const call = await callWebRoute(remindPath(gameId), 'GET');
  if (!call.ok) return call;

  if (call.status === 200) {
    const targets = readCount(call.body.targets);
    if (targets === undefined) return { ok: false, reason: 'remind_failed' };
    return {
      ok: true,
      targets,
      lastRemindedAt: readTimestamp(call.body.lastRemindedAt),
    };
  }

  return { ok: false, reason: failureForStatus(call.status) };
}

/**
 * Purr på dem som er ferdige uten å ha levert.
 *
 * **200 ER kvitteringen.** Mail og push er best-effort på serversiden
 * (`Promise.allSettled`), så ruta svarer 200 med antallet mål selv om én
 * adresse er død — og appen skal si det samme. `reminded` er derfor
 * informasjon, ikke resultatet: mangler feltet, faller det til 0 og svaret er
 * fortsatt suksess. Samme resonnement som `mode` i slette-flyten — å kalle en
 * fullført handling mislykket fordi et informasjonsfelt manglet, forteller
 * arrangøren det motsatte av det som skjedde.
 *
 * Ingen idempotens-sperre (eiervalg): to fullførte trykk gir to purringer.
 * Skjermen viser «Sist purret kl. …» i stedet for å nekte.
 */
export async function sendReminder(gameId: string): Promise<ReminderResult> {
  const call = await callWebRoute(remindPath(gameId), 'POST');
  if (!call.ok) return call;

  if (call.status === 200) {
    return { ok: true, reminded: readCount(call.body.reminded) ?? 0 };
  }

  return { ok: false, reason: failureForStatus(call.status) };
}
