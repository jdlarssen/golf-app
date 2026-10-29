// native/app/src/lib/leagueCopy.ts
// #2638 Del 2: tekstene på ligaskjermene i appen (tegningene 1–6).
//
// Der nettsiden har samme tekst, er appens streng nettsidens ordrett, og
// `leagueCopy.test.ts` låser det mot `messages/no.json`: avslagene ved start
// (`liga.player.runde.errorMap`), «Har spilt / I gang / Mangler», rundechipene,
// kolonneoverskriftene i tabellen og innstillingskortet. Resten finnes bare i
// appen.
//
// **Datoer i enhetens lokaltid, ingen `Intl`** (samme grunn som
// `homeDates.ts`: Hermes mangler ICU-tidssonene). Klokkeslettet skrives
// «23.59» som på tegningene.
import { firstName, sharesFirstName } from '../../../../lib/firstName';
import { formatShortDateNb } from '../../../../lib/format/date';
import { MAX_FLIGHT_PLAYERS } from '../../../../lib/league/flightRules';
import type {
  AppLeagueParticipant,
  AppLeagueRound,
  AppLeagueView,
} from '../../../../lib/league/appLeagueView';
import type { LeagueFormat, LeagueScoring, LeagueStatus, StandingsModel } from '../../../../lib/league/types';
import type { LeagueLoadFailure, LeagueStartFailure } from '../data/league';
import { OFFLINE_NOTE } from './rosterCopy';
import { WEB_LINK_TEXT } from './webLink';

export const LEAGUE_TEXT = {
  /** Toppen på ligasiden (`liga.player.kicker`). */
  kicker: 'Liga',
  /** Toppen på startskjermen (`liga.player.runde.kicker`). */
  startKicker: 'Start runde',
  /** Seksjonen på Hjem (tegning 1). */
  homeSection: 'Ligaene dine',
  homeNoOpenRound: 'Ingen åpen runde nå',
  homeNotStarted: 'Ikke startet ennå',
  notPlayed: 'Ikke spilt',
  /** `liga.player.playedBy.*`. */
  delivered: 'Har spilt',
  inProgress: 'I gang',
  missing: 'Mangler',
  /** Spilleren selv i «hvem har spilt» (`liga.player.playedBy.you`, med stor forbokstav først i lista). */
  you: 'Deg',
  /** `liga.player.playedBy.unknownPlayer`. */
  unknownPlayer: 'Ukjent spiller',
  /** `liga.player.seasonTableHeading`. */
  seasonTable: 'Sesong-tabell',
  /** `liga.player.roundsHeading`. */
  rounds: 'Runder',
  playRound: 'Spill runden',
  youDelivered: 'Du har levert',
  /** `liga.player.runde.missingSetup`. */
  missingSetup: 'Runden mangler bane eller tee — admin fullfører oppsettet snart.',
  /** `liga.standings.colRank` og `colPlayer`. */
  colRank: '#',
  colPlayer: 'Spiller',
  /** `liga.standings.groupNotRanked` og `groupNotRankedYet`. */
  groupNotRanked: 'Ikke rangert',
  groupNotRankedYet: 'Ikke rangert ennå',
  /** `liga.standings.emptyState`. */
  standingsEmpty: 'Ingen resultater ennå — første runde teller når flights er levert.',
  /** `liga.player.noRoundsYet`. */
  noRounds: 'Ingen runder er satt opp ennå.',
  /** Feil og uten nett (tegning 6). */
  loadFailed: 'Fikk ikke tak i ligaen. Sjekk nettet og prøv igjen.',
  retry: 'Prøv igjen',
  retrying: 'Prøver …',
  stale: 'Viser lagret liga — fikk ikke kontakt med serveren.',
  needNetToStart: 'Du trenger nett for å starte runden.',
  notFound: 'Fant ikke ligaen. Den kan ha blitt slettet, eller du er ikke med i den.',
  loading: 'Henter ligaen …',
} as const;

/** Innstillingskortet (`liga.simSettings.*`). */
export const SIM_SETTINGS_TEXT = {
  summary: 'Rundeinnstillinger · Trackman',
  overridden: 'Endret denne runden',
  tee: 'Tee',
} as const;

/** Startskjermen (`liga.player.runde.*`). */
export const ROUND_START_TEXT = {
  coPlayersLegend: 'Velg medspillere',
  simulatorRule: 'Velg de som står i simulatoren sammen med deg. Markør velger du når du leverer runden.',
  markerRule: 'Velg hvem du spiller med. Du trenger minst én medspiller (markørregelen).',
  noCoPlayers: 'Ingen andre deltakere i ligaen. Du trenger minst én medspiller (markørregelen).',
  startButton: 'Start runden',
  startPending: 'Starter runden …',
  lockDelivered: 'Har levert',
  lockInProgress: 'Spiller nå',
} as const;

/** `liga.player.windowChip.*`: rundas vindu sett fra nå. */
export const WINDOW_CHIP = { open: 'Åpen', upcoming: 'Kommer', closed: 'Lukket' } as const;

export type RoundWindow = keyof typeof WINDOW_CHIP;

/** Rundas vindu nå: før det åpner, mens det er åpent, eller etter at det stengte. */
export function roundWindow(round: Pick<AppLeagueRound, 'opensAt' | 'closesAt'>, now: Date): RoundWindow {
  const t = now.getTime();
  if (t < new Date(round.opensAt).getTime()) return 'upcoming';
  if (t > new Date(round.closesAt).getTime()) return 'closed';
  return 'open';
}

/** Den åpne runden: den første i sekvens med åpent vindu, som serverens `getMyLeagues`. */
export function openRoundOf(rounds: readonly AppLeagueRound[], now: Date): AppLeagueRound | null {
  return [...rounds].sort((a, b) => a.sequence - b.sequence).find((r) => roundWindow(r, now) === 'open') ?? null;
}

/** Neste runde som ikke har åpnet ennå. */
export function nextRoundOf(rounds: readonly AppLeagueRound[], now: Date): AppLeagueRound | null {
  return [...rounds].sort((a, b) => a.sequence - b.sequence).find((r) => roundWindow(r, now) === 'upcoming') ?? null;
}

const STATUS: Record<LeagueStatus, string> = {
  draft: 'Ikke startet',
  active: 'Pågår',
  finished: 'Ferdig',
};

/** Statuspillen på ligasiden: «Pågår». */
export function leagueStatusLabel(status: LeagueStatus): string {
  return STATUS[status];
}

/** `liga.create.format*Label`. */
const FORMAT: Record<LeagueFormat, string> = {
  stroke: 'Slagspill',
  stableford: 'Stableford',
  modified_stableford: 'Modifisert Stableford',
};

const SCORING: Record<LeagueScoring, string> = { net: 'netto', gross: 'brutto', both: 'netto' };

/** Hvordan sesongen telles, slik det står i formatlinja. */
function modelPhrase(model: StandingsModel, bestN: number | null, roundCount: number): string {
  switch (model) {
    case 'best_n':
      return bestN ? `beste ${bestN} av ${roundCount}` : 'beste runder teller';
    case 'total':
      return 'sum av alle runder';
    case 'average':
      return 'snitt per runde';
    case 'points':
      return 'poeng per plassering';
  }
}

/**
 * Formatlinja under navnet: «Stableford netto 75 % · maks 32 slag · beste 5 av
 * 7». Handicapandelen står etter «netto», også ved 100 %, og taket etter den
 * (#2660). En bruttoliga spiller uten handicapslag og viser ingen av dem.
 * Samme ord som nettsidens linje (`liga.player.formatLine`).
 */
export function formatLine(view: Pick<AppLeagueView, 'league' | 'rounds'>): string {
  const { format, scoring, standingsModel, bestN, hcpAllowancePct, hcpMaxStrokes } = view.league;
  const gross = scoring === 'gross';
  // En server fra før #2660 sender ikke andelen; da står linja som før.
  const head =
    gross || hcpAllowancePct == null
      ? `${FORMAT[format]} ${SCORING[scoring]}`
      : `${FORMAT[format]} ${SCORING[scoring]} ${hcpAllowancePct}\u00A0%`;
  const cap = !gross && hcpMaxStrokes != null ? `maks ${hcpMaxStrokes} slag` : null;
  return [head, cap, modelPhrase(standingsModel, bestN, view.rounds.length)]
    .filter((part): part is string => part != null)
    .join(' · ');
}

export function isPointsBased(format: LeagueFormat): boolean {
  return format === 'stableford' || format === 'modified_stableford';
}

/**
 * Hva tallet i tabellen betyr (tegning 3): «Poeng med handicapslag». I en
 * bruttoliga og i stableford er det ikke selvsagt, så tabellen sier det.
 */
export function tableCaption(league: Pick<AppLeagueView['league'], 'format' | 'scoring' | 'standingsModel'>): string {
  if (league.standingsModel === 'points') return 'Poeng for plassering i hver runde';
  const gross = league.scoring === 'gross';
  if (isPointsBased(league.format)) return gross ? 'Poeng uten handicapslag' : 'Poeng med handicapslag';
  return gross ? 'Slag mot par uten handicapslag' : 'Slag mot par';
}

/** Overskriften over sesongverdien (`liga.standings.col*`): «Beste 5». */
export function valueHeader(model: StandingsModel, bestN: number | null): string {
  switch (model) {
    case 'points':
      return 'Poeng';
    case 'average':
      return 'Snitt';
    case 'best_n':
      return bestN ? `Beste ${bestN}` : 'Beste N';
    case 'total':
      return 'Totalt';
  }
}

/** `Date#getDay()`-rekkefølge: søndag først. */
const WEEKDAYS_SHORT = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'] as const;
const MONTHS_LONG = [
  'januar',
  'februar',
  'mars',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'desember',
] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** «tor. 23.59», i enhetens lokaltid. */
function weekdayClock(date: Date): string {
  return `${WEEKDAYS_SHORT[date.getDay()]}. ${pad(date.getHours())}.${pad(date.getMinutes())}`;
}

/** En ren dato («2026-11-02») som kalenderdag i lokaltid, ikke UTC-midnatt. */
function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** «Sesong 2. nov – 4. feb». */
export function seasonLine(seasonStart: string, seasonEnd: string): string {
  return `Sesong ${formatShortDateNb(parseDateOnly(seasonStart))} – ${formatShortDateNb(parseDateOnly(seasonEnd))}`;
}

/** Raden på Hjem: «Runde 3 · stenger tor. 23.59». */
export function homeRoundLine(label: string, closesAt: string): string {
  return `${label} · stenger ${weekdayClock(new Date(closesAt))}`;
}

/** Tittelen på rundekortet: «Stenger tor. 23.59». */
export function roundClosesTitle(closesAt: string): string {
  return `Stenger ${weekdayClock(new Date(closesAt))}`;
}

/** Linja under: «10. desember · åpnet 30. november». */
export function roundWindowSub(opensAt: string, closesAt: string): string {
  const close = new Date(closesAt);
  const open = new Date(opensAt);
  return `${close.getDate()}. ${MONTHS_LONG[close.getMonth()]} · åpnet ${open.getDate()}. ${MONTHS_LONG[open.getMonth()]}`;
}

/** Datoene i rundelista: «30. nov – 10. des». */
export function roundDates(opensAt: string, closesAt: string): string {
  return `${formatShortDateNb(new Date(opensAt))} – ${formatShortDateNb(new Date(closesAt))}`;
}

/** Under «Du har levert»: «Neste runde åpner man. 14. des.». */
export function nextRoundOpens(opensAt: string): string {
  const date = new Date(opensAt);
  return `Neste runde åpner ${WEEKDAYS_SHORT[date.getDay()]}. ${formatShortDateNb(date)}.`;
}

/** Seksjonsoverskriften over kortet: «Innstillinger · Runde 3». */
export function settingsHeading(roundLabel: string): string {
  return `Innstillinger · ${roundLabel}`;
}

/**
 * En deltaker slik ligaskjermene skriver dem: fornavnet («Martin», tegningene),
 * eller hele navnet når en annen i ligaen har samme fornavn.
 */
export function participantLabel(
  participant: Pick<AppLeagueParticipant, 'name'> | undefined,
  all: readonly Pick<AppLeagueParticipant, 'name'>[],
): string {
  const name = participant?.name ?? null;
  if (!name) return LEAGUE_TEXT.unknownPlayer;
  const others = all.filter((p) => p !== participant).map((p) => p.name);
  return sharesFirstName(name, others) ? name : (firstName(name) ?? name);
}

/** Navnene i én rad av «hvem har spilt»: «Deg» først, så de andre. */
export function playedByNames(
  userIds: readonly string[],
  meId: string,
  participants: readonly AppLeagueParticipant[],
): string {
  const byId = new Map(participants.map((p) => [p.userId, p]));
  const names = userIds
    .filter((id) => id !== meId)
    .map((id) => participantLabel(byId.get(id), participants));
  return (userIds.includes(meId) ? [LEAGUE_TEXT.you, ...names] : names).join(', ');
}

/** Feilen på ligasiden, når det ikke finnes noen liga å vise (tegning 6). */
export function describeLeagueLoadFailure(reason: LeagueLoadFailure): string {
  switch (reason) {
    case 'not_found':
      return LEAGUE_TEXT.notFound;
    case 'no-web-base-url':
      return WEB_LINK_TEXT.missingBaseUrl;
    case 'unauthorized':
      return 'Logg inn på nytt og prøv igjen.';
    case 'offline':
    case 'network':
    case 'load_failed':
      return LEAGUE_TEXT.loadFailed;
  }
}

/** `liga.player.runde.errorMap.*`, ordrett; `{max}` satt inn. */
export const START_REFUSAL_TEXT = {
  need_marker: 'Du må velge minst én medspiller.',
  outside_window: 'Runden er ikke åpen for spill nå.',
  already_played: 'Du har allerede spilt denne runden.',
  round_not_ready: 'Runden mangler bane eller tee — si fra til admin.',
  not_member: 'En eller flere av de valgte er ikke deltakere i ligaen.',
  members_failed: 'Klarte ikke å hente deltakerliste. Prøv igjen om litt.',
  league_not_active: 'Ligaen er ikke aktiv.',
  round_not_found: 'Fant ikke runden.',
  league_not_found: 'Fant ikke ligaen.',
  insert_failed: 'Noe gikk galt under oppretting av flight. Prøv igjen.',
  flight_in_progress:
    'Du er allerede med i en flight i denne runden. Spill den ferdig eller trekk deg fra den først.',
  co_player_locked:
    'En av medspillerne har allerede levert denne runden eller spiller den nå. Last inn siden på nytt og velg igjen.',
  round_check_failed: 'Klarte ikke å sjekke hvem som allerede har spilt runden. Prøv igjen om litt.',
  flight_too_large: `Det er plass til høyst ${MAX_FLIGHT_PLAYERS} spillere i en flight. Fjern noen og prøv igjen.`,
  round_read_failed: 'Klarte ikke å hente runden. Prøv igjen om litt.',
  league_read_failed: 'Klarte ikke å hente ligaen. Prøv igjen om litt.',
  settings_freeze_failed: 'Klarte ikke å låse rundeinnstillingene. Prøv igjen om litt.',
  fallback: 'Noe gikk galt, prøv igjen.',
} as const;

/**
 * Hvorfor «Start runden» ikke gikk (tegning 5b), med nettsidens ord: kjernens
 * koder får `errorMap`-teksten, og koder nettsiden ikke har egen tekst for,
 * får dens `fallback`. Det bare appen kan møte (ingen nett, ingen sesjon,
 * manglende adresse i bygget) får appens egne setninger.
 */
export function describeLeagueStartRefusal(reason: LeagueStartFailure): string {
  switch (reason) {
    case 'offline':
    case 'network':
      return OFFLINE_NOTE;
    case 'no-web-base-url':
      return WEB_LINK_TEXT.missingBaseUrl;
    case 'unauthorized':
      return 'Logg inn på nytt og prøv igjen.';
    case 'not_found':
      return START_REFUSAL_TEXT.round_not_found;
    case 'need_marker':
    case 'outside_window':
    case 'already_played':
    case 'round_not_ready':
    case 'not_member':
    case 'members_failed':
    case 'league_not_active':
    case 'round_not_found':
    case 'league_not_found':
    case 'insert_failed':
    case 'flight_in_progress':
    case 'co_player_locked':
    case 'round_check_failed':
    case 'flight_too_large':
    case 'round_read_failed':
    case 'league_read_failed':
    case 'settings_freeze_failed':
      return START_REFUSAL_TEXT[reason];
    default:
      return START_REFUSAL_TEXT.fallback;
  }
}
