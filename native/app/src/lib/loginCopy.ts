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
//
// #2216: appen ber om koden gjennom nettsidens rute (`data/loginCode.ts`), med
// nettsidens sperrer. Ruta svarer med en kode, ikke en GoTrue-tekst, så bare
// verify-steget klassifiseres her ({@link classifyVerifyError}). Kodene fra
// ruta har fått webbens setninger, unntatt `user_not_found`: den betyr nå
// «ingen konto, og nye kontoer er skrudd av», og appen sier det rett ut i
// stedet for å be om en admin spilleren ikke har.
import type { SendLoginCodeError } from '../../../../lib/auth/loginCodeErrors';
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

/**
 * Sifrene i koden fra mailen (#2216, åtte ruter). Speiler Supabase-innstillingen
 * og webbens `OTP_LENGTH` i `VerifyCodeForm.tsx`: endres koden i Supabase, må
 * begge følge med. Brukes bare til visningen og til å sende koden av seg selv.
 */
export const OTP_LENGTH = 8;

/**
 * Supabase gir samme adresse ny kode tidligst etter ett minutt. Speiler
 * innstillingen og styrer bare nedtellingen; avgjørelsen er Supabases.
 */
export const RESEND_SECONDS = 60;

/** Sekunder til «Send ny kode» kan trykkes, mellom 0 og {@link RESEND_SECONDS}. */
export function resendWaitSeconds(sentAtMs: number, nowMs: number): number {
  const elapsed = Math.floor((nowMs - sentAtMs) / 1000);
  return Math.min(RESEND_SECONDS, Math.max(0, RESEND_SECONDS - elapsed));
}

/**
 * Adressen i «Vi sendte den til …» på kode-steget: første tegn, én prikk per
 * resten av lokaldelen, og hele domenet — «k••••@firma.no», som i designet
 * (Innlogging-forslag). Uten `@` (eller tom) står den som den er.
 *
 * Ikke webbens `maskEmail` (`lib/users/maskEmail.ts`): den viser to tegn og
 * tre faste prikker («ka•••@firma.no»), en annen form enn designets.
 */
export function maskSentToEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  return `${local.slice(0, 1)}${'•'.repeat(local.length - 1)}${email.slice(at)}`;
}

/** Nedtellingen som «0:42». */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export const LOGIN_TEXT = {
  // --- Innloggingen etter designet (#2216, «Innlogging»-forslaget, #2349) ---
  // Ordlyden er designets. Nettsiden får den samme i #2349.
  /** Taglinen i båndet på steg 1, med «par» i gull. */
  taglinePre: 'Fyr opp golfturneringen på et ',
  taglineGold: 'par',
  taglinePost: ' minutter',
  stepOneKicker: 'Steg 1 av 2',
  stepTwoKicker: 'Steg 2 av 2',
  emailLabel: 'E-postadresse',
  sendButton: 'Send meg kode',
  sendPending: 'Sender …',
  codeHeading: 'Skriv inn koden fra mailen',
  /** «Vi sendte den til <adressen>. Feil adresse?» — adressen settes inn mellom. */
  sentToPrefix: 'Vi sendte den til ',
  sentToSuffix: '.',
  changeEmail: 'Feil adresse?',
  /** Skjermleser-etiketten på kodefeltet, som webbens `codeLabel`. */
  codeLabel: 'Kode',
  codeHint: 'Koden har åtte siffer. På iPhone kan du trykke på koden over tastaturet.',
  verifyButton: 'Logg inn',
  verifyPending: 'Sjekker …',
  noMailTitle: 'Kom ikke mailen?',
  spamHint: 'Se i søppelposten. Den kommer fra Tørny og kan ta et par minutter.',
  resendInPrefix: 'Ny kode om ',
  resendButton: 'Send ny kode',
  resendPending: 'Sender …',

  passwordLabel: 'Passord',
  passwordButton: 'Logg inn med passord',
  passwordPending: 'Logger inn …',
  // Aldri Supabases egen tekst her — den skiller mellom årsakene.
  passwordFailed: 'Feil e-post eller passord.',
  // Appen sjekker selv før den spør serveren (#1977). Webben har `required`
  // på feltet, så det tomme tilfellet når aldri serveren der. «e-post» er
  // skjermens eget ord, fra passord-feilen.
  emailRequired: 'Skriv e-posten din først.',
} as const;

/**
 * Feilene innloggingen kan vise (#1977).
 *
 * Nøkkelnavnene er webbens (`messages/no.json` → `auth.errors`), så de to
 * flatene kan sammenlignes rad for rad — og paritetstesten kan slå dem opp
 * direkte. `network` er app-egen: webben har ingen offline-tilstand her, mens
 * appen er offline-først og sier det samme her som overalt ellers.
 *
 * Alle kodene «send meg kode»-ruta kan svare med er med (`SendLoginCodeError`,
 * #2216), pluss de to fra kode-steget. `link_expired` er fra magic-link-tiden;
 * appen har ingen lenke.
 */
export type LoginErrorCode = SendLoginCodeError | 'code_invalid' | 'code_expired' | 'network';

/** Minimumsformen av en GoTrue-feil — hele `AuthError` trengs ikke. */
export interface LoginErrorLike {
  message?: string | null;
  code?: string | null;
}

const NETWORK_HINTS = ['network request failed', 'failed to fetch', 'load failed'];

/**
 * GoTrue-feilen fra kode-steget (`verifyOtp`) → kode.
 *
 * Nett-sjekken går først: en forespørsel som aldri kom fram har ingen
 * HTTP-kode, og «failed to fetch» ville ellers blitt lest som feil kode.
 */
export function classifyVerifyError(error: LoginErrorLike): LoginErrorCode {
  const msg = (error.message ?? '').toLowerCase();
  const code = error.code ?? '';

  if (NETWORK_HINTS.some((hint) => msg.includes(hint))) return 'network';

  // GoTrue svarer likt på en feiltastet og en utløpt kode («Token has
  // expired or is invalid», `otp_expired`). Webben lander derfor på «gått
  // ut» også for en ren tastefeil. Vi speiler det bevisst: å være smartere
  // enn webben her ville vært et avvik, ikke en forbedring.
  return code === 'otp_expired' || msg.includes('expired') ? 'code_expired' : 'code_invalid';
}

/**
 * Kode → setningen spilleren leser.
 *
 * Uttømmende `switch` uten `default`: legger noen til en kode uten en setning,
 * sier `tsc` fra. Ordlyden er webbens, ord for ord, fra `messages/no.json` →
 * `auth.errors` — paritetstesten sammenligner mot den fila. Unntaket er
 * `user_not_found` (#2216): webben ber om en admin, men den som finner appen i
 * App Store har ingen admin å spørre.
 */
export function describeLoginError(code: LoginErrorCode): string {
  switch (code) {
    case 'rate_limited':
      return 'Du har bedt om mange koder på kort tid. Vent et kvarter og prøv igjen.';
    case 'rate_limited_minute':
      return 'Du kan be om ny kode om ett minutt.';
    case 'rate_limited_quota':
      return 'Vi får ikke sendt flere koder akkurat nå. Prøv igjen senere.';
    case 'user_not_found':
      return 'Det finnes ingen konto med denne e-posten, og akkurat nå kan du ikke lage en ny. Be arrangøren om en invitasjon.';
    case 'invite_expired':
      return 'Invitasjonen din er utløpt. Be arrangøren om å sende en ny.';
    case 'disposable_email':
      return 'Engangs-e-post går ikke. Bruk en vanlig e-postadresse, så er du i gang.';
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
