// native/app/src/lib/friendsCopy.ts
// #2256: tekstene på vennesiden i appen.
//
// Samme arbeidsdeling som `profileCopy.ts`: alt webbens `/profile/venner` også
// sier, er `messages/no.json → friends` tegn for tegn, og `friendsCopy.test.ts`
// leser den fila og sammenligner. Rettes en setning på webben uten at appen
// følger etter, blir testen rød.
//
// App-egent er merket under: spørsmålet før «Fjern» (webben har en egen
// bekreftelsesside med «Fjern som venn», appen et ark med «Fjern venn» og så en
// dialog), linjene for nett og lasting (webben kan ikke være offline), linja om
// ufullført profil (webben sender deg til profilen) og vennesiden (#2381). Heltekortet «Få med gjengen» og
// underlinjene med tallene har webben også fått (#2267): de faste tekstene
// speiles under, og funksjonene med tall har samme ordlyd som webbens
// ICU-meldinger (`friends.roundsTogether`, `friends.lastPlayed*` …).
//
// **Datoene er enhetens lokaltid**, som runde-lista (`roundHistory.ts`):
// Hermes mangler tidssonene, og for en spiller i Norge gir det samme dag.
import type { AddByEmailStatus, FriendStatus } from '../../../../lib/friends/friendStatus';
import {
  formatShortDateNb,
  formatShortDateNbWithYear,
} from '../../../../lib/format/date';
import type { FriendRecord, FriendRound, FriendRoundBadge, FriendStats } from '../data/friends';
import type { WebApiFailure } from '../data/webApi';
import { PROFILE_TEXT, formatHcpNb } from './profileCopy';

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
    'Er de på Tørny, får de en venneforespørsel. Hvis ikke, får de en invitasjon på e-post.',
  shareLinkSubtitle: 'Den som åpner lenken din, blir venn med deg med en gang.',
  declineLabel: 'Avslå',
  declinePending: 'Avslår …',
  acceptLabel: 'Godta',
  acceptPending: 'Godtar …',
  withdrawLabel: 'Trekk tilbake',
  withdrawPending: 'Trekker …',
  removeConfirmLabel: 'Fjern venn',
  removePending: 'Fjerner …',
  cancelLabel: 'Avbryt',
  addEmailLabel: 'E-post',
  addEmailPending: 'Sender …',
  addEmailButton: 'Legg til',
  someoneFallback: 'En venn',
  noFriendsYet: 'Du har ingen venner på Tørny ennå. Del lenken din øverst eller legg til noen du har spilt med.',
  /** Heltekortet øverst (designet). Linja under tittelen er `shareLinkSubtitle`. */
  heroTitle: 'Få med gjengen',
  /** Knappen som åpner delearket med lenka. */
  heroShareButton: 'Del lenken din',
  /** Knappen som viser e-postfeltet. */
  heroEmailButton: 'På e-post',
  /** Til høyre for «Vennene dine» når lista står etter siste runde. */
  sortedByLastPlayed: 'Sist spilt først',

  // --- App-egent ----------------------------------------------------------
  /** Radene på vennesiden for en som ikke er venn (#2381). */
  sheetHcp: 'Handicap',
  sheetRounds: 'Runder sammen',
  sheetLastPlayed: 'Sist spilt',
  /** Et tall siden ikke har: handicap uten ferdig profil, eller tall som ikke kunne leses. */
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
  /** #2878, #2381: vennesiden for en som ikke er venn. «Vil bli venn med deg» og «Godta» er webbens (over). */
  addFriendLabel: 'Legg til venn',
  addFriendPending: 'Sender …',
  friendsLine: 'Dere er venner',
} as const;

/**
 * «Bli venn med …» (#2627): skjermen QR-koden på bag-taggen og venne-lenka
 * åpner i appen. Det webbens `/venner/legg-til/[code]` også sier, er
 * `messages/no.json → friends.leggTil` tegn for tegn (testen leser fila).
 * App-egent: «Ukjent kode» (webben viser en 404), feilen ved lasting (webben
 * kan ikke være uten nett) og linja i innloggingsbåndet før innloggingen.
 */
export const FRIEND_LINK_TEXT = {
  // --- Webbens ordlyd (messages/no.json → friends.leggTil) ----------------
  kicker: 'Legg til venn',
  errorBanner: 'Noe gikk galt. Prøv igjen.',
  selfCard: 'Dette er din egen lenke. Del den med noen du vil bli venn med.',
  alreadyFriendsCard: 'Dere er allerede venner.',
  toFriendsLink: 'Til vennene dine',
  connectButton: 'Bli venner',
  connectPending: 'Blir venner …',

  // --- App-egent ----------------------------------------------------------
  unknownTitle: 'Ukjent kode',
  unknownBody: 'Koden stemmer ikke, eller kontoen er slettet.',
  loadFailed: 'Fikk ikke sjekket koden. Prøv igjen.',
  /** Linja i innloggingsbåndet når en venne-lenke venter. Navnet vises ikke før innloggingen. */
  loginTitle: 'Logg inn for å bli venner',
  loginBody: 'Etterpå ser du hvem som vil bli venn med deg.',
} as const;

/** «Bli venn med {name}? Da ser dere …» — webbens `friends.leggTil.connectCard`. */
export function friendLinkConnectCard(name: string): string {
  return `Bli venn med ${name || FRIENDS_TEXT.someoneFallback}? Da ser dere hverandres spill og kan velge hverandre når dere fyller lag.`;
}

/**
 * Toppen på Venner (#2256, #2627): ordet i midten og pila sin etikett. Fra
 * Profil står «PROFIL» og «Tilbake til profil», som i designet. Åpnet fra
 * «Bli venn med …» går pila til skjermen under (Hjem), så toppen nevner ikke
 * Profil: bare pila, med standardetiketten «Tilbake» (som Profil selv).
 */
export function friendsTopBar(from: 'friendLink' | 'notification' | undefined): { kicker: string; backLabel?: string } {
  if (from !== undefined) return { kicker: '', backLabel: undefined };
  return { kicker: PROFILE_TEXT.heading, backLabel: PROFILE_TEXT.backToProfile };
}

// Webbens `friends.status.*`, med samme koder som `?status=`. `not_found` og
// `already_decided` har ingen linje på webben heller: lista som hentes på nytt
// etter handlingen viser da hvordan det står.
const STATUS_LINES: Partial<Record<FriendStatus, string>> = {
  requested: 'Venneforespørsel sendt.',
  accepted: 'Dere er venner nå',
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

/**
 * Linja etter «Legg til venn på e-post». Webbens `friends.status.*` for samme
 * kode (`requested` er webbens `sent_by_email`). Svaret er det samme for alle
 * adresser: serveren sender en venneforespørsel eller en invitasjon, og sier
 * ikke hvilken. `profile_incomplete` er app-egen: webben sender deg til
 * profilen i stedet.
 */
const ADD_BY_EMAIL_LINES: Record<AddByEmailStatus, string> = {
  requested: 'Sendt. Vennen din får en venneforespørsel eller en invitasjon på e-post.',
  self: STATUS_LINES.self as string,
  email_required: STATUS_LINES.email_required as string,
  invalid_email: 'Det ser ikke ut som en e-postadresse. Sjekk den og prøv igjen.',
  disposable_email: 'Engangs-e-post går ikke. Be om en vanlig e-postadresse.',
  profile_incomplete: 'Fullfør profilen din først, så kan du legge til venner på e-post.',
  quota: 'Du har lagt til mange på e-post i dag. Prøv igjen i morgen.',
  error: STATUS_LINES.error as string,
};

export function addByEmailLine(status: AddByEmailStatus): StatusLine {
  return { text: ADD_BY_EMAIL_LINES[status], tone: status === 'requested' ? 'ok' : 'error' };
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

/**
 * Spørsmålet før en venn fjernes. App-egent: webben har en egen
 * bekreftelsesside med knappen «Fjern som venn» (#2267), appen et ark med
 * «Fjern venn» og så denne dialogen.
 */
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

/** «Vennene dine · 12» (i `ui.kicker`). */
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

/** Skjermleserens navn på en rad i Venner som åpner vennesiden (#2381): «Åpne Kari». */
export function openPersonA11yLabel(name: string): string {
  return `Åpne ${name || FRIENDS_TEXT.someoneFallback}`;
}

/**
 * Radene på vennesiden for en som ikke er venn (#2381): handicap, runder
 * sammen og sist spilt, som ligaarket hadde. `hcp` er `null` når siden ikke
 * har noe handicap å vise (åpnet fra Venner, eller ligaen mangler det), og da
 * står det ingen handicaprad. En strek der tallene ikke kunne leses.
 */
export function friendPageValues(
  friend: { hcp: number | null; stats: FriendStats | null },
  now: Date,
): { hcp: string | null; rounds: string; lastPlayed: string } {
  const { stats } = friend;
  const none = FRIENDS_TEXT.sheetNone;
  let lastPlayed: string = none;
  if (stats?.lastGameName) {
    lastPlayed = stats.lastPlayedAt
      ? `${stats.lastGameName}, ${lastPlayedLabel(stats.lastPlayedAt, now)}`
      : stats.lastGameName;
  }
  return {
    hcp: friend.hcp !== null ? formatHcpNb(friend.hcp) : null,
    rounds: stats ? String(stats.roundsTogether) : none,
    lastPlayed,
  };
}

// --- Vennesiden (#2381), tegning C «Dere to» ---------------------------------
// App-egent: webben har ingen venneside.

export const FRIEND_PAGE_TEXT = {
  /** Ordet i toppen og pila sin etikett, etter hvor siden ble åpnet. */
  kickerFriends: 'Venner',
  kickerLeague: 'Liga',
  backToFriends: 'Tilbake til Venner',
  backToLeague: 'Tilbake til ligaen',
  headToHead: 'Mot hverandre',
  you: 'Du',
  youAhead: 'Du foran',
  sameTeam: 'På lag',
  tied: 'Likt',
  noHeadToHead: 'Dere har ikke spilt mot hverandre ennå.',
  teamRoundsDontCount: 'Runder der dere var på samme lag, teller ikke.',
  becomeFriendsHint: 'Blir dere venner, ser du her hvordan det har gått mellom dere.',
  noRoundsTogether: 'Dere har ingen runder sammen ennå.',
} as const;

/** Toppen på vennesiden: «Venner» eller «Liga», og pila tilbake dit. */
export function friendPageTopBar(from: 'friends' | 'league'): { kicker: string; backLabel: string } {
  return from === 'friends'
    ? { kicker: FRIEND_PAGE_TEXT.kickerFriends, backLabel: FRIEND_PAGE_TEXT.backToFriends }
    : { kicker: FRIEND_PAGE_TEXT.kickerLeague, backLabel: FRIEND_PAGE_TEXT.backToLeague };
}

/** Fornavnet («Kristian» av «Kristian Holm»), til merket og stillingen. */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || FRIENDS_TEXT.someoneFallback;
}

/** Linja under navnet for en venn: «Dere er venner · handicap 12,4», uten handicap uten tallet. */
export function friendPageSubline(hcp: number | null): string {
  return hcp !== null ? `${FRIENDS_TEXT.friendsLine} · handicap ${formatHcpNb(hcp)}` : FRIENDS_TEXT.friendsLine;
}

/** «Runder sammen · 7» over lista. */
export function roundsListTitle(count: number): string {
  return `${FRIENDS_TEXT.sheetRounds} · ${count}`;
}

/** «Vis alle 7» under de fire siste. */
export function showAllRounds(count: number): string {
  return `Vis alle ${count}`;
}

/** Merket på en runde: «Du foran», «Kristian foran», «På lag», «Likt». */
export function roundBadgeLabel(badge: FriendRoundBadge, name: string): string {
  switch (badge) {
    case 'you_ahead':
      return FRIEND_PAGE_TEXT.youAhead;
    case 'them_ahead':
      return `${firstNameOf(name)} foran`;
    case 'same_team':
      return FRIEND_PAGE_TEXT.sameTeam;
    case 'tied':
      return FRIEND_PAGE_TEXT.tied;
  }
}

/** Linja under rundenavnet: «sist lørdag · Stableford». */
export function roundRowSubline(round: Pick<FriendRound, 'playedAt' | 'modeLabel'>, now: Date): string {
  const parts: string[] = [];
  if (round.playedAt) parts.push(lastPlayedLabel(round.playedAt, now));
  if (round.modeLabel) parts.push(round.modeLabel);
  return parts.join(' · ');
}

function roundsWord(count: number): string {
  return count === 1 ? '1 runde' : `${count} runder`;
}

/** Tallordet foran «endte likt»: tegningen skriver én til ti med bokstaver. */
const TIED_WORDS = ['Én', 'To', 'Tre', 'Fire', 'Fem', 'Seks', 'Sju', 'Åtte', 'Ni', 'Ti'] as const;

/**
 * Setningen om like runder bak lederlinja. Over ti står tallet inne i
 * setningen, så den heller ikke da begynner med et siffer.
 */
function tiedSentence(tied: number): string | null {
  if (tied <= 0) return null;
  const word = TIED_WORDS[tied - 1];
  return word ? `${word} endte likt.` : `Av dem endte ${tied} likt.`;
}

/**
 * Lederlinja under streken: «Du leder etter 5 runder mot hverandre.»,
 * «Kristian leder …» eller «Dere står likt …», med de like rundene bak.
 * `null` uten runder mot hverandre.
 */
export function headToHeadLine(record: FriendRecord, name: string): string | null {
  if (record.played === 0) return null;
  const after = `etter ${roundsWord(record.played)} mot hverandre.`;
  const lead =
    record.youAhead > record.themAhead
      ? `Du leder ${after}`
      : record.themAhead > record.youAhead
        ? `${firstNameOf(name)} leder ${after}`
        : `Dere står likt ${after}`;
  const tied = tiedSentence(record.tied);
  return tied ? `${lead} ${tied}` : lead;
}

/** Skjermleserens versjon av stillingen: «Du 3, Kristian 2, 1 likt». */
export function headToHeadA11yLabel(record: FriendRecord, name: string): string {
  const first = firstNameOf(name);
  if (record.played === 0) return `${FRIEND_PAGE_TEXT.you} og ${first}, ingen runder mot hverandre`;
  const score = `${FRIEND_PAGE_TEXT.you} ${record.youAhead}, ${first} ${record.themAhead}`;
  return record.tied > 0 ? `${score}, ${record.tied} likt` : score;
}
