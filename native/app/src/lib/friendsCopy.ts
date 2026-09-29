// native/app/src/lib/friendsCopy.ts
// #2256: tekstene på vennesiden i appen.
//
// Samme arbeidsdeling som `profileCopy.ts`: alt webbens `/profile/venner` også
// sier, er `messages/no.json → friends` tegn for tegn, og `friendsCopy.test.ts`
// leser den fila og sammenligner. Rettes en setning på webben uten at appen
// følger etter, blir testen rød.
//
// App-egent er merket under: delingen (webben kopierer lenka, appen åpner
// delearket), spørsmålet før «Fjern» (webben har en to-trinns knapp, appen en
// dialog), linjene for nett og lasting (webben kan ikke være offline), og
// feilene fra invitasjonen, som webben i dag ikke viser noe sted
// (`?invite_error=` på `/profile` leses ikke, se PR-en).
import type { FriendStatus, InviteStatus } from '../../../../lib/friends/friendStatus';
import type { WebApiFailure } from '../data/webApi';

/** Tekstene vennesiden viser. Flat, som `PROFILE_TEXT`. */
export const FRIENDS_TEXT = {
  // --- Webbens ordlyd (messages/no.json → friends) ------------------------
  heading: 'Venner',
  subtitle: 'Venner ser spillene dine og dukker opp når du fyller lag.',
  incomingSection: 'Vil bli venn med deg',
  friendsSection: 'Vennene dine',
  outgoingSection: 'Venter på svar',
  suggestionsSection: 'Folk du har spilt med',
  addByEmailSection: 'Legg til på e-post',
  addByEmailSubtitle:
    'Send en venneforespørsel til e-posten. Er de ikke på Tørny, kan du invitere dem.',
  shareLinkSection: 'Del en lenke',
  shareLinkSubtitle: 'Den som åpner lenken din, blir venn med deg med en gang.',
  noFriendsYet: 'Du har ingen venner på Tørny ennå. Legg til noen under.',
  declineLabel: 'Avslå',
  declinePending: 'Avslår …',
  acceptLabel: 'Godta',
  acceptPending: 'Godtar …',
  withdrawLabel: 'Trekk tilbake',
  withdrawPending: 'Trekker …',
  removeIdleLabel: 'Fjern',
  removeConfirmLabel: 'Fjern venn',
  removePending: 'Fjerner …',
  cancelLabel: 'Avbryt',
  addEmailLabel: 'E-post',
  addEmailPending: 'Sender …',
  addEmailButton: 'Legg til',
  invitePending: 'Inviterer …',
  someoneFallback: 'En venn',

  // --- App-egent ----------------------------------------------------------
  /** Knappen som åpner delearket med lenka. */
  shareLinkButton: 'Del lenke',
  /**
   * Plassholderen i e-postfeltet. Webbens plassholder står på et domene som
   * kan være ekte, og slike adresser hører ikke hjemme i repoet (#1929);
   * `eksempel.no` peker på ingen.
   */
  addEmailPlaceholder: 'venn@eksempel.no',
  loadFailed: 'Fikk ikke hentet vennene dine. Prøv igjen.',
  offline: 'Du må være på nett for å se vennene dine. Koble til og prøv igjen.',
  retry: 'Prøv igjen',
} as const;

// Webbens `friends.status.*`, med samme koder som `?status=`. `not_found` og
// `already_decided` har ingen linje på webben heller: lista som hentes på nytt
// etter handlingen viser da hvordan det står.
const STATUS_LINES: Partial<Record<FriendStatus, string>> = {
  requested: 'Venneforespørsel sendt.',
  accepted: 'Dere er venner nå!',
  already_friends: 'Dere er allerede venner.',
  already_pending: 'Forespørselen er allerede sendt.',
  declined: 'Forespørselen er avslått.',
  removed: 'Fjernet.',
  self: 'Du kan ikke legge til deg selv.',
  email_required: 'Skriv inn en e-postadresse.',
  error: 'Noe gikk galt. Prøv igjen.',
};

/** Webbens tone for samme kode: grønn, nøytral eller rød linje. */
const ERROR_STATUSES: ReadonlySet<FriendStatus> = new Set(['self', 'email_required', 'error']);

export type StatusLine = { text: string; tone: 'ok' | 'error' };

/** Linja etter en vennehandling, eller `null` når webben heller ikke viser noe. */
export function friendStatusLine(status: FriendStatus): StatusLine | null {
  const text = STATUS_LINES[status];
  if (!text) return null;
  return { text, tone: ERROR_STATUSES.has(status) ? 'error' : 'ok' };
}

/** «Invitasjon sendt til {email}.» — webbens `friends.status.invited`. */
export function invitedLine(email: string): string {
  return `Invitasjon sendt til ${email}.`;
}

/** «{email} er ikke på Tørny ennå. Vil du invitere dem?» — `friends.invitePrompt`. */
export function invitePrompt(email: string): string {
  return `${email} er ikke på Tørny ennå. Vil du invitere dem?`;
}

/** «Inviter {email}» — `friends.inviteButton`. */
export function inviteButton(email: string): string {
  return `Inviter ${email}`;
}

/**
 * Hvorfor invitasjonen ikke ble sendt. App-egent: webben leser ikke disse
 * kodene i dag. `email_required` og `unknown` bruker webbens ordlyd for
 * samme utfall.
 */
export function inviteFailureLine(status: Exclude<InviteStatus, 'invited'>): string {
  switch (status) {
    case 'email_required':
      return STATUS_LINES.email_required as string;
    case 'invalid_email':
      return 'Det ser ikke ut som en e-postadresse. Sjekk den og prøv igjen.';
    case 'disposable_email':
      return 'Engangs-e-post går ikke. Be om en vanlig e-postadresse.';
    case 'profile_incomplete':
      return 'Fullfør profilen din først, så kan du invitere venner.';
    case 'quota':
      return 'Du har brukt opp invitasjonene dine for nå.';
    case 'already_user':
      return 'Den adressen har allerede en konto på Tørny.';
    case 'already_invited':
      return 'Den adressen er allerede invitert.';
    case 'unknown':
      return STATUS_LINES.error as string;
  }
}

/**
 * Når kallet ikke nådde fram. Vennehandlingene legges aldri i sync-køen (de
 * har ingen lokal-først-vei), så linja sier at nett er kravet.
 */
export function friendsFailureLine(reason: WebApiFailure): string {
  switch (reason) {
    case 'offline':
      return 'Du er uten nett. Koble til og prøv igjen.';
    case 'network':
      return 'Fikk ikke kontakt med serveren. Sjekk tilkoblingen og prøv igjen.';
    case 'unauthorized':
      return 'Du er ikke logget inn lenger. Logg inn på nytt og prøv igjen.';
    case 'no-web-base-url':
      return 'Appen mangler adressen til serveren. Ta kontakt med administrator.';
  }
}

/** Spørsmålet før en venn fjernes. App-egent: webben har en to-trinns knapp. */
export function removeConfirmMessage(name: string): string {
  return `Vil du fjerne ${name || FRIENDS_TEXT.someoneFallback} som venn?`;
}
