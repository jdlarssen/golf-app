// native/app/src/lib/roundInviteCopy.ts
// #2748: tekstene på skjermen den delte påmeldingslenka åpner.
//
// Der nettsiden har samme tekst, er appens streng nettsidens ordrett, og
// `roundInviteCopy.test.ts` låser det mot `messages/no.json` (`signup`). Resten finnes
// bare i appen. Datoen står i enhetens lokaltid, som på Hjem (`homeDates.ts`).
import type { AppRoundInviteView } from '../../../../lib/games/appRoundInviteView';
import { isCappedFull } from '../../../../lib/games/seatCapacity';
import type { RoundInviteAnswerFailure, RoundInviteLoadFailure } from '../data/roundInvite';
import { formatStubClock, formatWeekdayDayMonth } from './homeDates';
import { OFFLINE_NOTE } from './rosterCopy';
import { PAYMENT_TEXT } from './paymentCopy';
import { WEB_LINK_TEXT } from './webLink';

export const ROUND_INVITE_TEXT = {
  // --- Nettsidens ordlyd (`signup`) -------------------------------------------
  kicker: 'Påmelding',
  joinIntro: 'Trykk «Meld meg på» for å bli med i spillet med en gang.',
  joinButton: 'Meld meg på',
  joinPending: 'Melder deg på …',
  requestIntro: 'Send en forespørsel til arrangøren. Du får varsel når den er godkjent.',
  requestPending: 'Sender forespørsel …',
  messageLabel: 'Valgfri hilsen til arrangøren',
  messagePlaceholder: '«Hei! Jeg er kompis av Per — håper det er plass.»',
  closed: 'Påmeldingen er stengt. Arrangøren gjør de siste justeringene før start.',
  locked: 'Spillet er startet eller avsluttet — påmelding er stengt.',
  notFound: 'Fant ikke spillet. Lenken kan være feil.',
  wrongMode: 'Påmelding er ikke åpen for dette spillet.',
  gameFull: 'Spillet er fullt — alle plassene er tatt.',
  profileIncomplete: 'Du må fylle inn profilen din først.',
  rateLimited: 'Du har gjort for mange påmeldinger den siste tida. Prøv igjen senere.',
  messageTooLong: 'Hilsenen er for lang (maks 200 tegn).',
  saveFailed: 'Klarte ikke å fullføre handlingen. Prøv igjen om litt.',

  // --- App-egent --------------------------------------------------------------
  requestButton: 'Be om å bli med',
  sentTitle: 'Forespørselen er sendt',
  sentBody: 'Du får varsel når arrangøren har bestemt seg.',
  webIntro: 'Denne påmeldingen gjør du på nettsiden.',
  webButton: 'Åpne påmeldingen',
  loading: 'Henter runden …',
  loadFailed: 'Fikk ikke tak i runden. Sjekk nettet og prøv igjen.',
  retry: 'Prøv igjen',
  retrying: 'Prøver …',
  toHome: 'Til Hjem',
  completeProfile: 'Fyll ut profilen',
  unauthorized: 'Logg inn på nytt og prøv igjen.',
  // #2837: full runde, og forespørselen som kan trekkes.
  fullIntro: 'Runden er full. Be om plass, så får arrangøren beskjed.',
  fullButton: 'Be om plass',
  cancelButton: 'Trekk forespørselen',
  cancelPending: 'Trekker forespørselen …',
  /** Linja i innloggingsbåndet. Runden vises ikke før innloggingen. */
  loginTitle: 'Logg inn for å melde deg på',
  loginBody: 'Etterpå ser du runden og kan melde deg på.',
} as const;

/** «Stableford · Larvik GK · Gul tee», uten det runden ikke har. */
export function roundPlaceLine(round: AppRoundInviteView['round']): string {
  return [round.modeLabel, round.courseName, round.teeName ? `${round.teeName} tee` : null]
    .filter((part) => part !== null)
    .join(' · ');
}

/** «Lørdag 21. november · kl. 09:20», eller ingenting uten tee-off. */
export function roundWhenLine(teeOffAt: string | null): string | null {
  const clock = formatStubClock(teeOffAt);
  if (teeOffAt === null || clock === null) return null;
  return `${formatWeekdayDayMonth(new Date(teeOffAt))} · ${clock}`;
}

/**
 * #2837: alle plassene er tatt, etter terminlistas regel for «Fullt» (`isCappedFull`).
 * Bare formater med tak fyller seg opp.
 */
export function isRoundFull(seats: AppRoundInviteView['seats']): boolean {
  return isCappedFull(seats);
}

/**
 * «9 av 12 plasser», og «12 av 12 plasser · fullt» når runden er full. Har arrangøren
 * godkjent noen over taket, står den som full. Uten tak (og på matchplay, som har sidene
 * sine): ingenting.
 */
export function roundSeatsLine(seats: AppRoundInviteView['seats']): string | null {
  if (seats?.kind !== 'capped') return null;
  const taken = Math.min(seats.held, seats.cap);
  return isRoundFull(seats) ? `${taken} av ${seats.cap} plasser · fullt` : `${taken} av ${seats.cap} plasser`;
}

/**
 * Ingen skal melde seg på uten å vite hva det koster (#2749: kontingenten står i
 * appen). Over null, ellers ingenting.
 */
export function roundFeeLine(entryFeeKr: number): string | null {
  // Beløpet som på kontingentkortet og nettet (`formatKr`): «1 500 kr».
  return entryFeeKr > 0 ? `${PAYMENT_TEXT.label} ${PAYMENT_TEXT.amount(entryFeeKr)}` : null;
}

export function describeRoundInviteLoadFailure(reason: RoundInviteLoadFailure): string {
  switch (reason) {
    case 'not_found':
      return ROUND_INVITE_TEXT.notFound;
    case 'no-web-base-url':
      return WEB_LINK_TEXT.missingBaseUrl;
    case 'unauthorized':
      return ROUND_INVITE_TEXT.unauthorized;
    case 'offline':
    case 'network':
    case 'load_failed':
      return ROUND_INVITE_TEXT.loadFailed;
  }
}

/**
 * Svar uten skriving. Skjermen bytter tilstand på `game_locked`, `signup_closed`,
 * `use_web` og `not_found`, og de har derfor tekstene sine der. `not_pending` (#2837)
 * henter runden på nytt og viser det som gjelder.
 */
export type RoundInviteFailureWithText = Exclude<
  RoundInviteAnswerFailure,
  'game_locked' | 'signup_closed' | 'use_web' | 'not_found' | 'not_pending'
>;

/** Koden går uttømmende: en ny kode faller på `tsc`. */
export function describeRoundInviteFailure(reason: RoundInviteFailureWithText): string {
  switch (reason) {
    case 'wrong_mode':
      return ROUND_INVITE_TEXT.wrongMode;
    case 'game_full':
      return ROUND_INVITE_TEXT.gameFull;
    case 'profile_incomplete':
      return ROUND_INVITE_TEXT.profileIncomplete;
    case 'rate_limited':
      return ROUND_INVITE_TEXT.rateLimited;
    case 'message_too_long':
      return ROUND_INVITE_TEXT.messageTooLong;
    case 'offline':
      return OFFLINE_NOTE;
    case 'no-web-base-url':
      return WEB_LINK_TEXT.missingBaseUrl;
    case 'unauthorized':
      return ROUND_INVITE_TEXT.unauthorized;
    case 'network':
    case 'db_error':
      return ROUND_INVITE_TEXT.saveFailed;
  }
}
