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

/**
 * Hvor lenge overskriften må holdes inne før passordfeltet vises.
 *
 * Lengre enn RN-standarden (500 ms) med vilje: et vanlig trykk, eller en
 * tommel som hviler på skjermen mens spilleren leser, skal ikke åpne noe.
 */
export const REVEAL_PASSWORD_LOGIN_MS = 1_500;

/** Navnet overskriften faller tilbake på når appen ikke kjenner sitt eget. */
export const APP_NAME_FALLBACK = 'Tørny';

export const LOGIN_TEXT = {
  passwordLabel: 'Passord',
  passwordButton: 'Logg inn med passord',
  passwordPending: 'Logger inn …',
  // Aldri Supabases egen tekst her — den skiller mellom årsakene.
  passwordFailed: 'Feil e-post eller passord.',
} as const;
