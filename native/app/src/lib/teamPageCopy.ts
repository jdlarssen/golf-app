// native/app/src/lib/teamPageCopy.ts
// #2840 del 3: tekstene på lagsiden i appen.
//
// Tegningen v3.1, «3. Lagsiden», er fasiten, og ordene derfra står ordrett. Feilene som
// også finnes på påmeldingen, er de samme som der (`roundInviteCopy.ts`,
// `teamSignupCopy.ts`). Resten er appens egne, gått gjennom `humanizer`.
import type { AppTeamPageTeam } from '../../../../lib/games/appRoundInviteView';
import type { TeamPageActionFailure, TeamPageLoadFailure } from '../data/teamPage';
import { ROUND_INVITE_TEXT, describeRoundInviteLoadFailure } from './roundInviteCopy';
import { OFFLINE_NOTE } from './rosterCopy';
import { answeredYes, freeSlotCount, memberState, type MemberState } from './teamPageModel';
import { TEAM_SIGNUP_TEXT, firstName } from './teamSignupCopy';
import { WEB_LINK_TEXT } from './webLink';

export const TEAM_PAGE_TEXT = {
  // --- Tegningen v3.1, ordrett -------------------------------------------------
  heading: 'Laget',
  approved: 'Med på laget',
  pending: 'Venter på svar',
  declined: 'Takket nei',
  captain: 'Kaptein',
  swap: 'Bytt med en venn',
  pickFriend: 'Velg en venn',
  freeSlot: 'Ledig plass',
  captainNote: 'Du kan endre laget til arrangøren stenger påmeldingen.',
  memberNote: 'Bare kapteinen kan endre laget.',
  resend: 'Send på nytt',
  transfer: 'Gi kapteinsrollen',
  remove: 'Fjern fra laget',
  close: 'Lukk',
  cancel: 'Avbryt',
  pickerTitle: 'Hvem skal med?',
  attachInstant: 'Invitasjonen kom på e-post. Du blir med i runden med en gang.',

  // --- Appens egne --------------------------------------------------------------
  attachApproval:
    'Invitasjonen kom på e-post. Sier du ja, må arrangøren godta laget før dere er med. Du får et varsel når det er klart.',
  onTeam: 'På laget',
  yourTeam: 'Laget ditt',
  loading: 'Henter laget …',
  loadFailed: 'Fikk ikke tak i laget. Sjekk nettet og prøv igjen.',
  noTeam: 'Du er ikke med på noe lag i denne runden.',
  teamUnknown: 'Vi fant ikke laget ditt. Spør kapteinen om en ny invitasjon, eller meld på et eget lag.',
  noCaptain: 'Laget du ble invitert til, er ikke med i runden lenger. Meld på et eget lag, så er du med.',
  solo: 'Du er påmeldt alene i denne runden, så du har ikke noe lag her.',
  toSignup: 'Til påmeldingen',
  removing: 'Fjerner …',
  transferring: 'Gir bort kapteinsrollen …',
  adding: 'Legger til …',
  resending: 'Sender …',
  notApproved: 'Bare en som har sagt ja, kan bli kaptein.',
  captainIsGuest: 'En gjest kan ikke være kaptein.',
  friendTaken: 'Vennen er alt påmeldt i runden.',
  changed: 'Laget har endret seg. Se over det og prøv igjen.',
  teamGone: 'Vi fant ikke laget. Spør kapteinen om en ny invitasjon.',
  fallbackName: 'Medspilleren',
  moreFor: 'flere valg',
  teamFallback: 'laget',
  /** Under lagnavnet, etter rundens navn. */
  metaCaptainIn: 'påmeldt',
  metaCaptainWaiting: 'venter på arrangøren',
  metaMemberIn: 'du er med på laget',
  metaMemberPending: 'du har ikke svart ennå',
  metaMemberDeclined: 'du takket nei',
} as const;

/** «Med på laget», «Venter på svar» eller «Takket nei». */
export function memberStatusLine(state: MemberState): string {
  return state === 'approved' ? TEAM_PAGE_TEXT.approved : state === 'pending' ? TEAM_PAGE_TEXT.pending : TEAM_PAGE_TEXT.declined;
}

/** Skjermleserens navn på «•••»: «Kari Nord, flere valg». */
export function moreLabel(name: string | null): string {
  return `${name ?? TEAM_PAGE_TEXT.fallbackName}, ${TEAM_PAGE_TEXT.moreFor}`;
}

/** «1 plass ledig», «2 plasser ledig». */
export function freeSeatsLine(count: number): string {
  return `${count} ${count === 1 ? 'plass' : 'plasser'} ledig`;
}

/** «2 av 3 har svart ja», eller «1 plass ledig» når laget har ledige plasser. */
export function teamProgressLine(team: Pick<AppTeamPageTeam, 'game' | 'captain' | 'members'>): string {
  const free = freeSlotCount(team);
  if (free > 0) return freeSeatsLine(free);
  const { yes, of } = answeredYes(team);
  return `${yes} av ${of} har svart ja`;
}

/**
 * Linja under lagnavnet. Kapteinen: «Onsdagsgolfen · påmeldt · 2 av 3 har svart ja».
 * Medspilleren: «Onsdagsgolfen · du er med på laget».
 */
export function teamMetaLine(team: AppTeamPageTeam): string {
  if (team.kind === 'captain') {
    const own = team.myStatus === 'approved' ? TEAM_PAGE_TEXT.metaCaptainIn : TEAM_PAGE_TEXT.metaCaptainWaiting;
    return [team.game.name, own, teamProgressLine(team)].join(' · ');
  }
  const state = memberState(team.myStatus);
  const own =
    state === 'approved'
      ? TEAM_PAGE_TEXT.metaMemberIn
      : state === 'pending'
        ? TEAM_PAGE_TEXT.metaMemberPending
        : TEAM_PAGE_TEXT.metaMemberDeclined;
  return [team.game.name, own].join(' · ');
}

/** Raden på runden og påmeldingen: «Laget ditt · 2 av 3 har svart ja». */
export function teamLinkLine(team: Pick<AppTeamPageTeam, 'game' | 'captain' | 'members'>): string {
  return `${TEAM_PAGE_TEXT.yourTeam} · ${teamProgressLine(team)}`;
}

/** Lagnavnet, eller rundens navn når laget ikke har noe. */
export function teamTitle(team: Pick<AppTeamPageTeam, 'teamName' | 'game'>): string {
  return team.teamName ?? team.game.name;
}

/** «Velg en venn»: «Birdie-jegerne · 1 plass ledig». */
export function pickerMeta(teamName: string, open: number): string {
  return `${teamName} · ${freeSeatsLine(open)}`;
}

/** «Legg Ingrid til på laget». */
export function addFriendLabel(name: string): string {
  return `Legg ${firstName(name) || name} til på laget`;
}

/** «Fjerne Kari Nord fra laget?» */
export function removeTitle(name: string | null): string {
  return `Fjerne ${name ?? TEAM_PAGE_TEXT.fallbackName.toLowerCase()} fra laget?`;
}

/**
 * Hva fjerningen gjør. Har medspilleren ikke svart, faller invitasjonen bort
 * (tegningen); har hen sagt ja, står bare plassen igjen.
 */
export function removeBody(name: string | null, teamName: string | null, pending: boolean): string {
  const who = firstName(name) || TEAM_PAGE_TEXT.fallbackName;
  const team = teamName ?? TEAM_PAGE_TEXT.teamFallback;
  return pending
    ? `${who} er ikke lenger med på ${team}, og invitasjonen faller bort. Plassen blir ledig, og du kan velge en annen venn etterpå.`
    : `${who} er ikke lenger med på ${team}. Plassen blir ledig, og du kan velge en annen venn etterpå.`;
}

/** «Fjern Kari Nord». */
export function removeButton(name: string | null): string {
  return `Fjern ${name ?? TEAM_PAGE_TEXT.fallbackName.toLowerCase()}`;
}

/** «Gi kapteinsrollen til Ola Kompis?» */
export function transferTitle(name: string | null): string {
  return `Gi kapteinsrollen til ${name ?? TEAM_PAGE_TEXT.fallbackName.toLowerCase()}?`;
}

/** «Ola blir kaptein for Birdie-jegerne. Du blir en vanlig medspiller …» */
export function transferBody(name: string | null, teamName: string | null): string {
  const who = firstName(name) || TEAM_PAGE_TEXT.fallbackName;
  return `${who} blir kaptein for ${teamName ?? TEAM_PAGE_TEXT.teamFallback}. Du blir en vanlig medspiller og kan ikke lenger endre laget.`;
}

/** «Kari har fått varselet på nytt.» */
export function resentLine(name: string | null): string {
  return `${firstName(name) || TEAM_PAGE_TEXT.fallbackName} har fått varselet på nytt.`;
}

/** Hva et ja til en gammel invitasjon gjør, etter påmeldingen i runden. */
export function attachBody(joinEffect: 'instant' | 'approval'): string {
  return joinEffect === 'instant' ? TEAM_PAGE_TEXT.attachInstant : TEAM_PAGE_TEXT.attachApproval;
}

/** Feilen når lagsiden ikke kunne hentes. «Fant ikke spillet» er påmeldingens. */
export function describeTeamPageLoadFailure(reason: TeamPageLoadFailure): string {
  return reason === 'offline' || reason === 'network' || reason === 'load_failed'
    ? TEAM_PAGE_TEXT.loadFailed
    : describeRoundInviteLoadFailure(reason);
}

/** Koden går uttømmende: en ny kode faller på `tsc`. */
export function describeTeamPageFailure(reason: TeamPageActionFailure): string {
  switch (reason) {
    case 'teammate_not_friend':
      return TEAM_SIGNUP_TEXT.teammateNotFriend;
    case 'team_full':
      return TEAM_SIGNUP_TEXT.teamFull;
    case 'game_locked':
      return ROUND_INVITE_TEXT.locked;
    case 'signup_closed':
      return ROUND_INVITE_TEXT.closed;
    case 'profile_incomplete':
      return ROUND_INVITE_TEXT.profileIncomplete;
    case 'not_approved':
      return TEAM_PAGE_TEXT.notApproved;
    case 'captain_is_guest':
      return TEAM_PAGE_TEXT.captainIsGuest;
    case 'already_registered':
      return TEAM_PAGE_TEXT.friendTaken;
    case 'team_unknown':
      return TEAM_PAGE_TEXT.teamGone;
    case 'not_found':
      return TEAM_PAGE_TEXT.changed;
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
export function isRetryableTeamPageFailure(reason: TeamPageActionFailure): boolean {
  return reason === 'network' || reason === 'offline' || reason === 'db_error';
}
