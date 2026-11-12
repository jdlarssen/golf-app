// native/app/src/lib/teamSignupCopy.ts
// #2840: tekstene i lagskjemaet og svaret på en laginvitasjon i appen.
//
// Tegningen v3.1 er fasiten («Ja, bygg etter den»), og ordene derfra står ordrett.
// Feilene som også finnes på nettsiden, er nettsidens (`signup.errors` i
// `messages/no.json`), låst i `teamSignupCopy.test.ts`. Resten er appens egne.
// Datoene står i enhetens lokaltid, som resten av påmeldingen (`roundInviteCopy.ts`).
import type { AppRoundInviteView, AppTeamSlotResult } from '../../../../lib/games/appRoundInviteView';
import type { TeamNameValidationError } from '../../../../lib/games/teamName';
import type { FriendStats } from '../data/friends';
import type { TeamSignupFailure } from '../data/roundInvite';
import { roundsTogetherLine } from './friendsCopy';
import { formatStubClock, formatStubDate } from './homeDates';
import { formatHcpNb } from './profileCopy';
import { ROUND_INVITE_TEXT, roundSeatsLine } from './roundInviteCopy';
import { OFFLINE_NOTE } from './rosterCopy';
import { WEB_LINK_TEXT } from './webLink';

export const TEAM_SIGNUP_TEXT = {
  // --- Tegningen v3.1, ordrett -------------------------------------------------
  you: 'Deg',
  free: 'Ledig',
  captainBadge: 'K',
  search: 'Søk i vennene',
  addFriend: 'Legg til venn',
  addFirstFriend: 'Legg til en venn',
  noFriends: 'Du har ingen venner på Tørny ennå. Bare venner kan være på laget ditt.',
  unavailable: 'Alt påmeldt i runden',
  noRoundsTogether: 'Ingen runder sammen ennå',
  done: 'Ferdig',
  sheetTitle: 'Legg til en venn',
  sheetBody: 'La kompisen skanne koden, eller send lenken din.',
  sheetShare: 'Del lenken din',
  sheetClose: 'Lukk',
  sentTitle: 'Laget er sendt til arrangøren',
  sentBody: 'Når arrangøren godtar laget, er dere med, og du får et varsel.',
  willBeNotified: 'Får varsel',
  slotAlreadyRegistered: 'Er alt påmeldt',
  seeTeam: 'Se laget',
  full: 'Runden er full. Det er ikke plass til et lag til.',
  joinTeam: 'Bli med på laget',
  noThanks: 'Nei takk',
  joinInstant: 'Sier du ja, er du med i runden med en gang.',
  joinApproval: 'Sier du ja, må arrangøren godta laget før dere er med. Du får et varsel når det er klart.',

  // --- Nettsidens ordlyd (`signup.errors`) --------------------------------------
  teammateNotFriend: 'Du kan bare melde på venner. Legg dem til som venner først.',
  duplicateMembers: 'Du har valgt samme venn to ganger.',
  teamFull: 'Laget er fullt.',
  gameFull: 'Spillet er fullt — alle plassene er tatt.',
  teamNameInvalid: 'Lag-navnet må være 3–40 tegn.',
  slotsCountWrong: 'Feil antall medspillere. Fyll inn alle plassene.',
  selfInSlots: 'Du kan ikke legge til deg selv som medspiller.',
  alreadyRegistered: 'Du er allerede påmeldt dette spillet.',
  wrongType: 'Dette spillet tar ikke imot lag-påmelding.',
  modeNoTeams: 'Spillmodusen støtter ikke lag. Be arrangøren bytte påmeldingen til «Individuelt».',

  // --- Appens egne ----------------------------------------------------------------
  nameEmpty: 'Skriv inn et lagnavn.',
  editName: 'Endre lagnavnet',
  nameField: 'Lagnavn',
  submitting: 'Melder på laget …',
  joining: 'Blir med …',
  declining: 'Sier nei …',
  slotFailed: 'Ble ikke lagt til',
  friendsLoading: 'Henter vennene dine …',
  friendsFailed: 'Fikk ikke tak i vennene dine. Sjekk nettet og prøv igjen.',
  noFriendLink: 'Lenken din er ikke klar ennå. Prøv igjen om litt.',
  captainFallback: 'Kapteinen',
  selfCaptain: 'Deg, kaptein',
  freeSlot: 'Ledig plass',
} as const;

/** Skjermleserens navn på en valgt venn i oppstillingen: et trykk tar vennen ut. */
export function removeFromTeamLabel(name: string): string {
  return `Ta ${firstName(name) || name} ut av laget`;
}

/** Det første ordet i navnet, «Kari» for «Kari Nord». Tomt uten navn. */
export function firstName(name: string | null): string {
  return name?.trim().split(/\s+/)[0] ?? '';
}

/** «Velg 3 til»: knappen nederst før laget er fullt. */
export function pickMoreLabel(open: number): string {
  return `Velg ${open} til`;
}

/** «Meld på Birdie-jegerne»: knappen når laget er fullt. */
export function submitTeamLabel(teamName: string): string {
  return `Meld på ${teamName}`;
}

/** «2/40» i navnefeltet. */
export function nameCounter(length: number, max: number): string {
  return `${length}/${max}`;
}

/** Feilen under navnefeltet. Regelen er `validateTeamName` i `lib/games/teamName.ts`. */
export function describeTeamNameError(error: TeamNameValidationError): string {
  switch (error.code) {
    case 'teamNameEmpty':
      return TEAM_SIGNUP_TEXT.nameEmpty;
    case 'teamNameTooShort':
      return `Lagnavnet må ha minst ${error.min} tegn.`;
    case 'teamNameTooLong':
      return `Lagnavnet kan ha maks ${error.max} tegn.`;
  }
}

/** «Ingen av vennene dine heter «Jonas».» når søket ikke treffer. */
export function noHitLine(query: string): string {
  return `Ingen av vennene dine heter «${query.trim()}».`;
}

/**
 * Underlinja til en venn i lagskjemaet: «HCP 18,0 · 6 runder sammen», eller «Ingen
 * runder sammen ennå». Kunne ikke tallene leses (`stats` er `null`), står bare det som
 * finnes, og `null` når ingenting er igjen.
 */
export function friendTeamLine(friend: { hcp: number | null; stats: FriendStats | null }): string | null {
  const parts: string[] = [];
  if (friend.hcp !== null) parts.push(`HCP ${formatHcpNb(friend.hcp)}`);
  if (friend.stats) {
    parts.push(
      friend.stats.roundsTogether > 0
        ? roundsTogetherLine(friend.stats.roundsTogether)
        : TEAM_SIGNUP_TEXT.noRoundsTogether,
    );
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** «ons 19. nov», med liten forbokstav inne i en linje. */
function shortDay(teeOffAt: string | null): string | null {
  const day = formatStubDate(teeOffAt);
  return day ? day.charAt(0).toLowerCase() + day.slice(1) : null;
}

/** «ons 19. nov kl. 17:30», eller bare dagen uten klokkeslett. */
function shortDayAndClock(teeOffAt: string | null): string | null {
  const day = shortDay(teeOffAt);
  if (!day) return null;
  const clock = formatStubClock(teeOffAt);
  return clock ? `${day} ${clock}` : day;
}

/** Linja under lagnavnet i skjemaet: «Onsdagsgolfen · ons 19. nov · 8 av 12 plasser». */
export function teamFormMeta(view: Pick<AppRoundInviteView, 'round' | 'seats'>): string {
  return [view.round.name, shortDay(view.round.teeOffAt), roundSeatsLine(view.seats)]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** Runden og tiden: «Onsdagsgolfen · ons 19. nov kl. 17:30». */
export function teamRoundLine(round: AppRoundInviteView['round']): string {
  return [round.name, shortDayAndClock(round.teeOffAt)]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** Under rundens navn når den er full: «Ons 19. nov kl. 17:30 · 12 av 12 plasser · fullt». */
export function fullRoundPlace(view: Pick<AppRoundInviteView, 'round' | 'seats'>): string {
  const when = shortDayAndClock(view.round.teeOffAt);
  return [when ? when.charAt(0).toUpperCase() + when.slice(1) : null, roundSeatsLine(view.seats)]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** «Kari vil ha deg med på laget». */
export function inviteTitle(captainName: string | null): string {
  return `${firstName(captainName) || TEAM_SIGNUP_TEXT.captainFallback} vil ha deg med på laget`;
}

/** Hva et ja gjør, etter påmeldingen i runden. */
export function inviteBody(joinEffect: 'instant' | 'approval'): string {
  return joinEffect === 'instant' ? TEAM_SIGNUP_TEXT.joinInstant : TEAM_SIGNUP_TEXT.joinApproval;
}

/** Svaret for én venn etter sendingen: «Får varsel», eller hvorfor vennen ikke kom med. */
export function slotResultLabel(result: AppTeamSlotResult): string {
  if (result.ok) return TEAM_SIGNUP_TEXT.willBeNotified;
  return result.reason === 'alreadyRegistered' ? TEAM_SIGNUP_TEXT.slotAlreadyRegistered : TEAM_SIGNUP_TEXT.slotFailed;
}

/**
 * Feilene skjemaet og svaret viser. `game_locked`, `signup_closed` og `not_found` viser
 * de ikke: der spør skjermen på nytt og viser det som gjelder nå. `game_full` står
 * (#2840): står skjemaet også etter ny henting, skal trykket ikke ende i ingenting.
 */
export type TeamSignupFailureWithText = Exclude<
  TeamSignupFailure,
  'game_locked' | 'signup_closed' | 'not_found'
>;

/** Koden går uttømmende: en ny kode faller på `tsc`. */
export function describeTeamSignupFailure(reason: TeamSignupFailureWithText): string {
  switch (reason) {
    case 'teammate_not_friend':
      return TEAM_SIGNUP_TEXT.teammateNotFriend;
    case 'duplicate_members':
      return TEAM_SIGNUP_TEXT.duplicateMembers;
    case 'team_full':
      return TEAM_SIGNUP_TEXT.teamFull;
    case 'game_full':
      return TEAM_SIGNUP_TEXT.gameFull;
    case 'team_name_invalid':
      return TEAM_SIGNUP_TEXT.teamNameInvalid;
    case 'slots_count_wrong':
      return TEAM_SIGNUP_TEXT.slotsCountWrong;
    case 'self_in_slots':
      return TEAM_SIGNUP_TEXT.selfInSlots;
    case 'already_registered':
      return TEAM_SIGNUP_TEXT.alreadyRegistered;
    case 'wrong_type':
      return TEAM_SIGNUP_TEXT.wrongType;
    case 'mode_does_not_support_teams':
      return TEAM_SIGNUP_TEXT.modeNoTeams;
    case 'wrong_mode':
      return ROUND_INVITE_TEXT.wrongMode;
    case 'profile_incomplete':
      return ROUND_INVITE_TEXT.profileIncomplete;
    case 'rate_limited':
      return ROUND_INVITE_TEXT.rateLimited;
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

/** Feil der et nytt trykk kan gå: knappen sier «Prøv igjen», som på påmeldingen. */
export function isRetryableTeamFailure(reason: TeamSignupFailureWithText): boolean {
  return reason === 'network' || reason === 'offline' || reason === 'db_error';
}
