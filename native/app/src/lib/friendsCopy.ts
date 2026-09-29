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
// (`?invite_error=` på `/profile` leses ikke, se PR-en). Det samme gjelder det
// designet (#2256) la til: heltekortet «Få med gjengen», underlinjene med
// tallene fra `/api/friends` og arket som åpnes fra en venn.
//
// **Datoene er enhetens lokaltid**, som runde-lista (`roundHistory.ts`):
// Hermes mangler tidssonene, og for en spiller i Norge gir det samme dag.
import type { FriendStatus, InviteStatus } from '../../../../lib/friends/friendStatus';
import {
  formatShortDateNb,
  formatShortDateNbWithYear,
} from '../../../../lib/format/date';
import type { FriendStats } from '../data/friends';
import type { WebApiFailure } from '../data/webApi';
import { formatHcpNb } from './profileCopy';

/** Tekstene vennesiden viser. Flat, som `PROFILE_TEXT`. */
export const FRIENDS_TEXT = {
  // --- Webbens ordlyd (messages/no.json → friends) ------------------------
  heading: 'Venner',
  subtitle: 'Venner ser spillene dine og dukker opp når du fyller lag.',
  incomingSection: 'Vil bli venn med deg',
  friendsSection: 'Vennene dine',
  outgoingSection: 'Venter på svar',
  suggestionsSection: 'Folk du har spilt med',
  addByEmailSubtitle:
    'Send en venneforespørsel til e-posten. Er de ikke på Tørny, kan du invitere dem.',
  shareLinkSubtitle: 'Den som åpner lenken din, blir venn med deg med en gang.',
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
  /**
   * Webben sier «Legg til noen under», men i appen står «Få med gjengen»
   * øverst, over lista.
   */
  noFriendsYet: 'Du har ingen venner på Tørny ennå. Del lenken din øverst eller legg til noen du har spilt med.',
  /** Heltekortet øverst (designet). Linja under tittelen er `shareLinkSubtitle`. */
  heroTitle: 'Få med gjengen',
  /** Knappen som åpner delearket med lenka. */
  heroShareButton: 'Del lenken din',
  /** Knappen som viser e-postfeltet. */
  heroEmailButton: 'På e-post',
  /** Til høyre for «Vennene dine» når lista står etter siste runde. */
  sortedByLastPlayed: 'Sist spilt først',
  /** Arket som åpnes fra en venn. */
  sheetHcp: 'Handicap',
  sheetRounds: 'Runder sammen',
  sheetLastPlayed: 'Sist spilt',
  sheetClose: 'Lukk',
  /** Et tall arket ikke har: handicap uten ferdig profil, eller tall som ikke kunne leses. */
  sheetNone: '–',
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

// --- Designet (#2256): overskriften og underlinjene -------------------------

/** «12 venner · de dukker opp når du fyller lag»; uten venner webbens linje. */
export function friendsSubtitle(count: number): string {
  if (count === 0) return FRIENDS_TEXT.subtitle;
  if (count === 1) return '1 venn · vennen din dukker opp når du fyller lag';
  return `${count} venner · de dukker opp når du fyller lag`;
}

/** «Vennene dine · 12» (versaler kommer fra stilen). */
export function friendsSectionTitle(count: number): string {
  return `${FRIENDS_TEXT.friendsSection} · ${count}`;
}

/** «1 runde sammen», «8 runder sammen». */
export function roundsTogetherLine(count: number): string {
  return count === 1 ? '1 runde sammen' : `${count} runder sammen`;
}

const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'] as const;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Når dere sist spilte: «i dag», «i går», «sist lørdag» den siste uka, ellers
 * «14. sep» (med år når det ikke er i år).
 */
export function lastPlayedLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  // Math.round tar sommertida: et døgn over skiftet er 23 eller 25 timer.
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return 'i dag';
  if (days === 1) return 'i går';
  if (days > 1 && days < 7) return `sist ${WEEKDAYS[date.getDay()]}`;
  return date.getFullYear() === now.getFullYear()
    ? formatShortDateNb(date)
    : formatShortDateNbWithYear(date);
}

/**
 * Underlinja til en venn: «HCP 9,4 · 8 runder sammen · sist lørdag». Det
 * serveren ikke har, står ute; `null` når ingenting er igjen.
 */
export function friendSubline(
  friend: { hcp: number | null; stats: FriendStats | null },
  now: Date,
): string | null {
  const parts: string[] = [];
  if (friend.hcp !== null) parts.push(`HCP ${formatHcpNb(friend.hcp)}`);
  if (friend.stats && friend.stats.roundsTogether > 0) {
    parts.push(roundsTogetherLine(friend.stats.roundsTogether));
  }
  if (friend.stats?.lastPlayedAt) parts.push(lastPlayedLabel(friend.stats.lastPlayedAt, now));
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** «Spilte med deg i Onsdagsgolfen» under en forespørsel, når dere har spilt sammen. */
export function incomingSubline(stats: FriendStats | null): string | null {
  return stats?.lastGameName ? `Spilte med deg i ${stats.lastGameName}` : null;
}

/** «2 runder sammen» under et forslag og en sendt forespørsel. */
export function roundsSubline(stats: FriendStats | null): string | null {
  return stats && stats.roundsTogether > 0 ? roundsTogetherLine(stats.roundsTogether) : null;
}

/**
 * Skjermleserens navn på en knapp som gjelder én person: «Avslå Kari»,
 * «Godta Kari». Med flere forespørsler sier ellers alle knappene det samme.
 */
export function personActionA11yLabel(action: string, name: string): string {
  return `${action} ${name || FRIENDS_TEXT.someoneFallback}`;
}

/** Skjermleserens navn på en vennerad: navnet og underlinja. */
export function friendRowA11yLabel(name: string, sub: string | null): string {
  const shown = name || FRIENDS_TEXT.someoneFallback;
  return sub ? `${shown}, ${sub}` : shown;
}

/** Arkets tre tall. En strek der tallet mangler. */
export function friendSheetValues(
  friend: { hcp: number | null; stats: FriendStats | null },
  now: Date,
): { hcp: string; rounds: string; lastPlayed: string } {
  const { stats } = friend;
  const none = FRIENDS_TEXT.sheetNone;
  let lastPlayed: string = none;
  if (stats?.lastGameName) {
    lastPlayed = stats.lastPlayedAt
      ? `${stats.lastGameName}, ${lastPlayedLabel(stats.lastPlayedAt, now)}`
      : stats.lastGameName;
  }
  return {
    hcp: friend.hcp !== null ? formatHcpNb(friend.hcp) : none,
    rounds: stats ? String(stats.roundsTogether) : none,
    lastPlayed,
  };
}
