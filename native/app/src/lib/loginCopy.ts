// native/app/src/lib/loginCopy.ts
// Native #1954 (P1b): tekstene og tallet bak den skjulte passord-inngangen.
//
// Inngangen finnes for App Review (#1284/#1909): Apples reviewere kan ikke
// motta engangskodene våre på mail, og App Store Connect vil ha et
// brukernavn/passord-par. Bare review-kontoen HAR passord; alle andre får
// `invalid_credentials` fra Supabase uansett hva de taster.
//
// Samme arbeidsdeling som resten av `lib/*Copy.ts`: skjermen viser, teksten
// bor her. Én feilmelding uansett årsak er en del av sikkerhetsmodellen (se
// `docs/native/app-store-review-konto.md` §Sikkerhetsmodellen): ukjent adresse,
// konto uten passord og feil passord skal ikke kunne skilles fra hverandre.
//
// #1977: kode-innlogging har fått samme behandling. Fram til da satte skjermen
// `err.message` rått, så første skjerm i appen — den Apples anmelder ser først
// — svarte på engelsk fra GoTrue: «One of email or phone must be set», «Email
// address "…" is invalid», «email rate limit exceeded». Passord-inngangen
// under gjorde det riktig hele tiden; den er unntaket som ble regelen.
import { OFFLINE_NOTE } from './rosterCopy';

/**
 * Hvor lenge overskriften må holdes inne før passordfeltet vises.
 *
 * Lengre enn RN-standarden (500 ms) med vilje: et vanlig trykk, eller en
 * tommel som hviler på skjermen mens spilleren leser, skal ikke åpne noe.
 */
export const REVEAL_PASSWORD_LOGIN_MS = 1_500;

/**
 * Navnet appen faller tilbake på når den ikke kjenner sitt eget.
 *
 * Brukes to steder, begge med `Constants.expoConfig?.name` foran seg:
 * login-overskriften og hjem-headeren (#1975). Butikk-varianten setter `name`
 * til «Tørny», dev-varianten til «Tørny Dev» — ingen av dem skal stå hardkodet
 * i en skjerm.
 */
export const APP_NAME_FALLBACK = 'Tørny';

export const LOGIN_TEXT = {
  passwordLabel: 'Passord',
  passwordButton: 'Logg inn med passord',
  passwordPending: 'Logger inn …',
  // Aldri Supabases egen tekst her — den skiller mellom årsakene.
  passwordFailed: 'Feil e-post eller passord.',
  // Appen sjekker selv før den ringer Supabase (#1977). Webben har `required`
  // på feltet, så det tomme tilfellet når aldri serveren der. Ordene låner
  // skjermens eget vokabular: «e-post» fra passord-feilen, «mailen» fra
  // kode-feilen.
  emailRequired: 'Skriv e-posten din først.',
  codeRequired: 'Skriv koden fra mailen.',
} as const;

/**
 * Hvilken av de to kode-rundene som feilet.
 *
 * Samme GoTrue-tekst betyr ikke det samme i de to stegene, så klassifisereren
 * må vite hvor den står: «expired» på send-steget er noe helt annet enn på
 * verify-steget.
 */
export type LoginStep = 'send-code' | 'verify-code';

/**
 * Feilene innloggingen kan vise (#1977).
 *
 * Nøkkelnavnene er webbens (`messages/no.json` → `auth.errors`), så de to
 * flatene kan sammenlignes rad for rad — og paritetstesten kan slå dem opp
 * direkte. `network` er app-egen: webben har ingen offline-tilstand her, mens
 * appen er offline-først og sier det samme her som overalt ellers.
 *
 * Webbens `rate_limited`, `invite_expired` og `disposable_email` er bevisst
 * IKKE med: alle tre krever noe bare serveren har (webbens egen 15-minutters
 * bøtte, et service-role-oppslag etter utløpt invitasjon, og self-reg-flagget).
 * `link_expired` er fra magic-link-tiden; appen har ingen lenke.
 */
export type LoginErrorCode =
  | 'rate_limited_minute'
  | 'rate_limited_quota'
  | 'user_not_found'
  | 'code_invalid'
  | 'code_expired'
  | 'network'
  | 'unknown';

/** Minimumsformen av en GoTrue-feil — hele `AuthError` trengs ikke. */
export interface LoginErrorLike {
  message?: string | null;
  code?: string | null;
}

const NETWORK_HINTS = ['network request failed', 'failed to fetch', 'load failed'];

/**
 * GoTrue-feil → kode.
 *
 * Reglene er webbens (`app/[locale]/(auth)/login/actions.ts`), med de typede
 * `error.code`-verdiene lagt på som en ekstra sikring: matcher teksten ikke,
 * fanger koden det likevel. Delstreng-reglene beholdes, for det er DE som er
 * webbens shippede oppførsel — dropper vi dem, driver flatene fra hverandre.
 *
 * Rekkefølgen er lastbærende to steder:
 *  1. Nett-sjekken først. En forespørsel som aldri kom fram har ingen
 *     HTTP-kode, og «failed to fetch» ville ellers falt til `unknown`.
 *  2. Kvoten FØR den generelle rate-heuristikken. De to deler `error.code`
 *     (`over_email_send_rate_limit`), og kvote-teksten inneholder selv ordet
 *     «rate» — teksten er den eneste som skiller dem. Forskjellen er ekte:
 *     ved 60-sekunders-sperren ligger det alt en kode i innboksen, ved kvoten
 *     ble det aldri sendt noen.
 */
export function classifyLoginError(step: LoginStep, error: LoginErrorLike): LoginErrorCode {
  const msg = (error.message ?? '').toLowerCase();
  const code = error.code ?? '';

  if (NETWORK_HINTS.some((hint) => msg.includes(hint))) return 'network';

  if (step === 'verify-code') {
    // GoTrue svarer likt på en feiltastet og en utløpt kode («Token has
    // expired or is invalid», `otp_expired`). Webben lander derfor på
    // «gått ut» også for en ren tastefeil. Vi speiler det bevisst: å være
    // smartere enn webben her ville vært et avvik, ikke en forbedring.
    return code === 'otp_expired' || msg.includes('expired') ? 'code_expired' : 'code_invalid';
  }

  if (msg.includes('email rate limit exceeded')) return 'rate_limited_quota';
  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    msg.includes('rate') ||
    msg.includes('too many') ||
    msg.includes('security purposes')
  ) {
    return 'rate_limited_minute';
  }
  if (
    code === 'otp_disabled' ||
    code === 'signup_disabled' ||
    code === 'user_not_found' ||
    code === 'validation_failed' ||
    msg.includes('not found') ||
    msg.includes('signups not allowed') ||
    msg.includes('signups are disabled') ||
    msg.includes('otp_disabled') ||
    msg.includes('disabled') ||
    msg.includes('is invalid')
  ) {
    return 'user_not_found';
  }
  return 'unknown';
}

/**
 * Kode → setningen spilleren leser.
 *
 * Uttømmende `switch` uten `default`: legger noen til en kode uten en setning,
 * sier `tsc` fra. Ordlyden er webbens, ord for ord, fra `messages/no.json` →
 * `auth.errors` — paritetstesten sammenligner mot den fila.
 */
export function describeLoginError(code: LoginErrorCode): string {
  switch (code) {
    case 'rate_limited_minute':
      return 'Du kan be om ny kode om ett minutt.';
    case 'rate_limited_quota':
      return 'Vi får ikke sendt flere koder akkurat nå. Prøv igjen senere.';
    case 'user_not_found':
      return 'Denne mailen er ikke registrert. Be admin om en invitasjon.';
    case 'code_invalid':
      return 'Feil kode. Sjekk mailen og prøv igjen.';
    case 'code_expired':
      return 'Koden er gått ut. Be om ny kode.';
    case 'network':
      return OFFLINE_NOTE;
    case 'unknown':
      return 'Noe gikk galt. Prøv igjen.';
  }
}
