// native/app/src/lib/terminlisteCopy.ts
// #2838: tekstene på terminlista i appen («Finn turneringer»).
//
// Der nettsiden har samme tekst (`messages/no.json` → `discover`, `socialProof`),
// er appens streng nettsidens ordrett, og `terminlisteCopy.test.ts` låser det
// tegn for tegn. `no.json` er 341 KB og Metro tree-shaker ikke JSON, så
// strengene er en håndkopi (samme grunn som `appFormats.ts`); prisen er drift,
// og testen er forsikringen. Det som bare finnes i appen, står sist.
//
// Datoene står i telefonens tid, som resten av appen (`homeDates.ts`, Hermes
// mangler Oslo-sonen).
import { capacityState, type TerminDayLabel, type TerminTimeNote } from '../../../../lib/games/terminliste';
import type { GameSocialProof } from '../../../../lib/games/socialProof';
import { socialProofForm, firstName } from '../../../../lib/games/socialProof';
import type { TerminlisteLoadFailure } from '../data/terminliste';
import { formatWeekdayDayMonth } from './homeDates';
import { WEB_LINK_TEXT } from './webLink';

export const TERMIN_TEXT = {
  // --- Nettsidens ordlyd (`discover`, `discover.termin`) ----------------------
  kicker: 'Finn turneringer',
  pageTitle: 'Terminlista',
  subtitle: 'Åpne runder du kan bli med på',
  filterLabel: 'Filtrer runder',
  filterAll: 'Alle',
  filterWeekend: 'Denne helga',
  filterClub: 'Klubben min',
  myRequests: 'Mine forespørsler',
  pendingApproval: 'Venter på godkjenning',
  today: 'i dag',
  tomorrow: 'i morgen',
  undated: 'Dato ikke satt',
  signUp: 'Meld på',
  request: 'Be om plass',
  full: 'Fullt',
  nineHoles: '9 hull',
  firstTee: 'første start',
  shotgun: 'shotgun',
  courseNotSet: 'Bane ikke valgt',
  createOwn: 'Fant du ikke noe? Lag din egen runde',
  emptyWeekend: 'Ingen runder denne helga.',
  emptyClub: 'Ingen kommende runder i klubben din.',
  showAll: 'Vis alle',
  emptyBody: 'Ingen åpne turneringer akkurat nå. Men du trenger ikke vente på en invitasjon for å spille.',
  emptyAction: 'Fyr opp din egen turnering',

  // --- App-egent ---------------------------------------------------------------
  loading: 'Henter rundene …',
  loadFailed: 'Fikk ikke tak i rundene. Sjekk nettet og prøv igjen.',
  unauthorized: 'Logg inn på nytt og prøv igjen.',
  retry: 'Prøv igjen',
  retrying: 'Prøver …',
} as const;

/** Webbens `discover.termin.inDays`: «om 2 dager». Aldri 1: det er «i morgen». */
export const inDays = (days: number) => `om ${days} dager`;
/** Webbens `termin.signUpLabel`: skjermleserens navn på «Meld på». */
export const signUpLabel = (name: string) => `Meld meg på ${name}`;
/** Webbens `termin.requestLabel`. */
export const requestLabel = (name: string) => `Be om å bli med i ${name}`;
/** Webbens `termin.seatsFree`. */
export const seatsFree = (free: number, cap: number) => `${free} av ${cap} plasser ledige`;
/** Webbens `termin.seatsLeft` (flertall: «# plass igjen» / «# plasser igjen»). */
export const seatsLeft = (count: number) => (count === 1 ? `${count} plass igjen` : `${count} plasser igjen`);
/** Webbens `termin.teamOf`. */
export const teamOf = (size: number) => `lag på ${size}`;
/** Webbens `discover.pendingApprovalCaptain` og `pendingApprovalMember`. */
export const pendingTeamLine = (teamName: string, isCaptain: boolean) =>
  isCaptain ? `Lag «${teamName}» (kaptein) — venter på godkjenning` : `Lag «${teamName}» — venter på godkjenning`;

/** Dagen over en gruppe: «Lørdag 14. november», med året når det ikke er i år. */
export function dayHeading(teeOffIso: string, now: Date): string {
  const date = new Date(teeOffIso);
  const base = formatWeekdayDayMonth(date);
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/** «i dag», «i morgen» eller «om N dager»; ingenting for en dag som er gått. */
export function dayLabelText(label: TerminDayLabel): string | null {
  if (label === null) return null;
  return label.kind === 'today' ? TERMIN_TEXT.today : label.kind === 'tomorrow' ? TERMIN_TEXT.tomorrow : inDays(label.days);
}

/** Den lille linja under klokka. */
export function timeNoteText(note: TerminTimeNote): string | null {
  if (note === null) return null;
  return note === 'nine_holes' ? TERMIN_TEXT.nineHoles : note === 'shotgun' ? TERMIN_TEXT.shotgun : TERMIN_TEXT.firstTee;
}

/** «Bane · Format · lag på N». */
export function courseFormatLine(courseName: string | null, modeLabel: string, teamSize: number): string {
  const parts = [courseName ?? TERMIN_TEXT.courseNotSet, modeLabel];
  if (teamSize > 1) parts.push(teamOf(teamSize));
  return parts.join(' · ');
}

/** Plass-linja: «Fullt», «2 plasser igjen» eller «6 av 8 plasser ledige». */
export function seatLineText(capacity: { cap: number; held: number }): string {
  const { free, tone } = capacityState(capacity);
  return tone === 'full' ? TERMIN_TEXT.full : tone === 'low' ? seatsLeft(free) : seatsFree(free, capacity.cap);
}

/**
 * Det skjermleseren sier for en rad. Knappen kommer først («Meld meg på {spill}»,
 * som nettets knapp), så det raden ellers viser: klokka, den lille linja,
 * «Bane · Format», og plass-linja eller vennene. Nettet har raden som vanlig tekst,
 * så der leses alt; i appen er hele raden ett trykkpunkt og må ta det med selv.
 */
export function rowA11yLabel(args: {
  name: string;
  full: boolean;
  cta: 'direct' | 'request';
  clock: string | null;
  note: string | null;
  courseFormat: string;
  third: string | null;
}): string {
  const head = args.full ? `${args.name}. ${TERMIN_TEXT.full}` : args.cta === 'direct' ? signUpLabel(args.name) : requestLabel(args.name);
  const when = args.clock ? [`kl. ${args.clock}`, args.note] : [TERMIN_TEXT.undated, null];
  return [head, ...when, args.courseFormat, args.full ? null : args.third].filter((part) => part !== null && part !== '').join('. ');
}

/** Webbens `socialProof` (fornavn, som i raden på nettet). */
export function socialProofText(proof: GameSocialProof): string | null {
  const form = socialProofForm(proof, firstName);
  if (form === null) return null;
  switch (form.kind) {
    case 'friendsOverflow':
      return `${form.name} og ${form.count === 1 ? `${form.count} annen` : `${form.count} andre`} du kjenner er med`;
    case 'friendsTwo':
      return `${form.name1} og ${form.name2} er med`;
    case 'friendsOne':
      return `${form.name} er med`;
    case 'count':
      return `${form.count} har blitt med`;
  }
}

/** Én ærlig setning per grunn; en ukjent grunn er ikke en tekst vi gjetter. */
export function describeTerminlisteFailure(reason: TerminlisteLoadFailure): string {
  switch (reason) {
    case 'no-web-base-url':
      return WEB_LINK_TEXT.missingBaseUrl;
    case 'unauthorized':
      return TERMIN_TEXT.unauthorized;
    case 'offline':
    case 'network':
    case 'load_failed':
      return TERMIN_TEXT.loadFailed;
  }
}
