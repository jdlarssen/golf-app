// #2752: teksten i «Styr cupen», trekket og byttet. Der nettet sier det samme, er
// ordlyden nettets (`cup.manage`, `cup.withdraw`, `cup.swap` i messages/no.json),
// låst i `cupManageCopy.test.ts`. Det som er nytt i appen, står i `MANAGE_APP_TEXT`.
import type {
  AppCupManageMatch,
  AppCupSideAward,
  AppCupWithdrawalMatch,
} from '../../../../lib/cup/appCupManageView';
import type { CupGirReport, CupReportMatch, CupSlotReports } from '../../../../lib/cup/cupSideReports';
import { MAX_PERSONAL_CUP_PLAYERS } from '../../../../lib/cup/limits';
import { formatMessage } from './kavalkadeCopy';
import { CUP_TEXT, matchStatusLabel } from './cupCopy';
import { reportedDistance } from './endGameCopy';

export const WITHDRAW_TEXT = {
  kicker: 'Trekk fra cupen',
  headingAdmin: 'Trekk {name} fra {cup}?',
  headingSelf: 'Trekk deg fra {cup}?',
  warning: 'Det kommer ingen inn i stedet. Kampene under spilles ikke.',
  matchesHeading: 'Dette skjer med kampene',
  untouchedHeading: 'Disse røres ikke',
  untouchedNote: 'Kamper som er i gang eller ferdigspilt står som de står.',
  outcomeHalved: 'halveres',
  outcomeWalkover: 'walkover til {team} — under 30 minutter før start',
  outcomePlayOn: '{partner} spiller alene',
  teeOffMissing: 'uten klokkeslett',
  playOnLegend: '{partner} står igjen alene',
  playOnYes: '{partner} spiller alene',
  playOnNo: 'La kampen avgjøres uten spill',
  playOnHelp: 'Hør med makkeren først. Du kan endre valget helt fram til kampen starter.',
  nothingPending: 'Alle kampene er enten i gang eller ferdigspilt. Det er ingenting å trekke seg fra.',
  alreadyWithdrawnSelf:
    'Du har allerede trukket deg fra cupen. Vil du inn igjen, må arrangøren angre trekket.',
  withdrawButtonAdmin: 'Registrer trekket',
  withdrawButtonSelf: 'Trekk meg',
  withdrawPending: 'Registrerer …',
  cancelButton: 'Avbryt',
  selfNote: 'Arrangøren ser trekket på cup-siden med en gang.',
  undoHeading: 'Angre trekket for {name}?',
  undoBody:
    'Kampene som ennå ikke har startet spilles som normalt igjen. Har tee-tiden passert, starter de i løpet av et minutt.',
  undoButton: 'Angre trekket',
  undoPending: 'Angrer …',
} as const;

const WITHDRAW_ERRORS: Record<string, string> = {
  wrong_status: 'Cupen er ikke i gang.',
  not_participant: 'Du er ikke med i denne cupen.',
  no_pending_matches: 'Du har ingen kamper igjen å trekke deg fra.',
  not_withdrawn: 'Spilleren er ikke trukket.',
  match_not_eligible: 'Valget passer ikke på denne kampen.',
  withdraw_failed: 'Klarte ikke å registrere trekket. Prøv igjen.',
  not_found: 'Cupen finnes ikke.',
};

export const SWAP_TEXT = {
  heading: 'Bytt spiller',
  outLabel: 'Hvem går ut?',
  inLabel: 'Hvem går inn?',
  submitButton: 'Bytt',
  submitPending: 'Bytter …',
  cancelButton: 'Avbryt',
  noReserves: 'Alle du kan bytte inn står allerede i kampen.',
} as const;

const SWAP_ERRORS: Record<string, string> = {
  not_found: 'Fant ikke kampen.',
  already_started: 'Kampen er i gang. Nå er det for sent å bytte.',
  match_has_withdrawal: 'Kampen har et registrert trekk, så du kan ikke bytte spillere.',
  player_not_in_match: 'Spilleren står ikke i denne kampen lenger.',
  already_in_match: 'Den spilleren er allerede med i kampen.',
  not_candidate: 'Den spilleren kan du ikke bytte inn i denne cupen.',
  profile_incomplete: 'Spilleren må fylle ut profilen sin før hen kan settes inn.',
  not_member: 'Spilleren er ikke medlem av klubben lenger.',
  swap_failed: 'Klarte ikke å bytte spilleren. Prøv igjen.',
  too_many_players:
    'Cupen er full — en personlig cup tar maks {cap} spillere. Fjern en deltaker først, eller bytt inn en som allerede er påmeldt.',
};

/** `cup.manage`. */
export const MANAGE_TEXT = {
  withdrawnChip: 'Trukket',
  withdrawLink: 'Trekk fra cupen',
  undoWithdrawLink: 'Angre trekk',
  playOnPendingHeading: 'Valg som venter',
  playerSwapped: 'Spilleren er byttet.',
  playerWithdrawn: 'Trekket er registrert. Hvert kampkort viser hva som skjedde med kampen.',
  playerWithdrawnPartial: 'Trekket er registrert. Kamper som rakk å starte, spilles som normalt.',
  withdrawalUndone: 'Trekket er angret. Kampene står som før.',
  playOnSaved: 'Valget er lagret.',
} as const;

/** Det som er nytt i appen. */
export const MANAGE_APP_TEXT = {
  kicker: 'Styr cupen',
  roomLink: 'Styr cupen',
  playersHeading: 'Spillere',
  matchesHeading: 'Kamper som ikke har startet',
  noMatches: 'Alle kampene er i gang eller ferdigspilt.',
  swapLink: 'Bytt spiller',
  stale: 'Viser lagret cup. Fikk ikke kontakt med serveren. Du trenger nett for å trekke eller bytte spillere.',
  needsNet: 'Du trenger nett for å gjøre dette. Sjekk nettet og prøv igjen.',
  loading: 'Henter cupen …',
  loadFailed: 'Fikk ikke tak i cupen. Prøv igjen.',
  notFound: 'Fant ikke cupen. Den finnes ikke, eller du har ikke tilgang.',
  notManager: 'Det er arrangøren som styrer cupen.',
  retry: 'Prøv igjen',
  swapSummary: '{in} går inn for {out}.',
  swapBundled: 'Byttet gjelder alle kampene på denne dagen.',
  playOnQuestion: 'Skal {partner} spille alene, eller avgjøres kampen uten spill?',
} as const;

/** `cup.manage`: avslutningen. */
export const FINISH_TEXT = {
  button: 'Avslutt cupen',
  pending: 'Avslutter …',
  sideAwardsHint: 'Registrer alle sidepoeng før du kan avslutte cupen: {awards}',
  notSubmitted:
    'Noen kamper mangler leverte scorekort: {matches}. Du kan avslutte cupen likevel. Slagene til dem som ikke har levert, teller fortsatt.',
  anywayButton: 'Avslutt likevel',
  anywayPending: 'Avslutter …',
  failed:
    'Disse kampene lot seg ikke avslutte: {matches}. Prøv igjen — kampene som allerede er avsluttet, står.',
  failedPlain: 'Klarte ikke å avslutte cupen.',
  alreadyFinished: 'Cupen er allerede avsluttet.',
  finishedNotice: 'Cupen er avsluttet. Resultatet er sendt til alle deltakere.',
} as const;

/** `cup.sideAwards`: registreringen etter runden. */
export const SIDE_AWARD_TEXT = {
  heading: 'Sidepoeng',
  empty: 'Ingen sidepoeng ble satt opp for denne cupen.',
  finishedHint: 'Cupen er avsluttet. Retter du et sidepoeng, regnes vinneren på nytt.',
  none: 'Ingen kvalifiserte',
  register: 'Registrer',
  registerPending: 'Lagrer …',
  registered: 'Vinneren er registrert.',
  registeredNone: 'Registrert: ingen vant her.',
  girCount: 'Hvor mange GIR klarte {team}?',
  girRegistered: 'GIR-tellingen er registrert.',
} as const;

/**
 * `cup.sideAwards.reported*`: det kampene har meldt inn (#2283, tegning V3). De tre
 * faste setningene; resten er byggeklosser under. Ordlyden er nettets, tegn for tegn,
 * låst mot `lib/cup/cupSideReportsCopyCases.ts` i `cupSideReportsCopy.parity.test.ts`.
 */
export const SIDE_REPORTED_TEXT = {
  heading: 'Meldt inn fra kampene',
  readFailed: 'Fikk ikke hentet det kampene har meldt inn.',
  none: 'Ingen kamper har meldt inn ennå.',
} as const;

const REPORTED_NO_ONE = { ctp: 'Ingen på green', ld: 'Ingen på fairway' } as const;
const REPORTED_MISSING = '{match} har ikke meldt inn';
const REPORTED_GIR_MAX = 'maks {max} GIR';

const SIDE_AWARD_ERRORS: Record<string, string> = {
  not_found: 'Fant ikke cupen.',
  not_a_participant: 'Spilleren er ikke med i cupens spillerliste.',
  invalid_counts: 'Tallet må være mellom 0 og {max}.',
  save_failed: 'Klarte ikke å lagre. Prøv igjen om litt.',
};

/** Det som er nytt i appen. */
export const FINISH_APP_TEXT = {
  activeHeading: 'Kamper som pågår',
  matchLink: 'Avslutt kampen',
  matchHeading: 'Avslutt {match}?',
  matchButton: 'Avslutt kampen',
  matchPending: 'Avslutter …',
  matchNotSubmitted:
    'Noen har ikke levert scorekort i {match}. Du kan avslutte kampen likevel. Slagene deres teller fortsatt.',
  matchFinished: 'Kampen er avsluttet.',
  cancel: 'Avbryt',
  registerLink: 'Registrer sidepoeng',
  notRunning: 'Cupen er ikke i gang.',
  stale: 'Viser lagret cup. Fikk ikke kontakt med serveren. Du trenger nett for å registrere og avslutte.',
  girOfMax: 'av {max}',
  boardFinal: 'Sluttresultat',
  boardLoading: 'Henter tavla …',
  boardFailed: 'Fikk ikke tak i tavla. Prøv igjen.',
  boardOffline: 'Fikk ikke tak i tavla. Sjekk nettet og prøv igjen.',
  boardNotFound: 'Fant ikke kampen. Tavla åpner når kampen er ferdig.',
} as const;

const MATCH_FINISH_ERRORS: Record<string, string> = {
  not_found: 'Fant ikke kampen.',
  not_active: 'Kampen er ikke i gang lenger. Noen andre rakk kanskje å avslutte den.',
  no_players: 'Det står ingen spillere i kampen.',
  not_all_submitted: 'Noen har fortsatt ikke levert. Prøv igjen.',
  not_all_approved: 'Et levert scorekort venter på godkjenning. Det må godkjennes før kampen kan avsluttes.',
  finish_failed: 'Klarte ikke å avslutte kampen. Prøv igjen.',
};

export type CupManageNotice =
  | 'player_withdrawn'
  | 'player_withdrawn_partial'
  | 'withdrawal_undone'
  | 'play_on_saved'
  | 'player_swapped';

const NOTICES: Record<CupManageNotice, string> = {
  player_withdrawn: MANAGE_TEXT.playerWithdrawn,
  player_withdrawn_partial: MANAGE_TEXT.playerWithdrawnPartial,
  withdrawal_undone: MANAGE_TEXT.withdrawalUndone,
  play_on_saved: MANAGE_TEXT.playOnSaved,
  player_swapped: MANAGE_TEXT.playerSwapped,
};

export function manageNoticeText(notice: CupManageNotice): string {
  return NOTICES[notice];
}

const APP_FAILURES: Record<string, string> = {
  offline: MANAGE_APP_TEXT.needsNet,
  network: MANAGE_APP_TEXT.needsNet,
  unauthorized: 'Logg inn på nytt og prøv igjen.',
  not_manager: MANAGE_APP_TEXT.notManager,
};

/** Hvorfor et trekk eller et valg ikke gikk. */
export function withdrawFailureText(reason: string): string {
  return APP_FAILURES[reason] ?? WITHDRAW_ERRORS[reason] ?? WITHDRAW_ERRORS.withdraw_failed;
}

/** Hvorfor et bytte ikke gikk. */
export function swapFailureText(reason: string): string {
  const known = APP_FAILURES[reason] ?? SWAP_ERRORS[reason];
  if (known) return formatMessage(known, { cap: MAX_PERSONAL_CUP_PLAYERS });
  return SWAP_ERRORS.swap_failed;
}

/** Hvorfor et sidepoeng ikke ble lagret. */
export function sideAwardFailureText(reason: string, max?: number): string {
  const known = APP_FAILURES[reason] ?? SIDE_AWARD_ERRORS[reason] ?? SIDE_AWARD_ERRORS.save_failed;
  return formatMessage(known, { max: max ?? 0 });
}

/** Hvorfor en kamp ikke ble avsluttet. */
export function matchFinishFailureText(reason: string): string {
  return APP_FAILURES[reason] ?? MATCH_FINISH_ERRORS[reason] ?? MATCH_FINISH_ERRORS.finish_failed;
}

/** Hvorfor cupen ikke ble avsluttet. `matches` er kampene som fortsatt pågår. */
export function cupFinishFailureText(reason: string, matches: string): string {
  if (reason === 'match_finish_failed') return formatMessage(FINISH_TEXT.failed, { matches });
  return APP_FAILURES[reason] ?? FINISH_TEXT.failedPlain;
}

/** «Nærmest pinnen (hull 7), GIR (hull 12)», som i nettets hint. */
export function missingAwardsLine(awards: readonly { kind: 'ctp' | 'ld' | 'gir'; holeNumber: number }[]): string {
  return awards
    .map((award) => `${sideAwardKind(award.kind)} (${formatMessage(CUP_TEXT.holeShort, { n: award.holeNumber })})`)
    .join(', ');
}

/** Når tavla ikke kunne leses. «Sjekk nettet» bare når det er nettet det står på. */
export function boardFailureText(reason: string): string {
  if (reason === 'offline' || reason === 'network') return FINISH_APP_TEXT.boardOffline;
  if (reason === 'unauthorized') return APP_FAILURES.unauthorized;
  return FINISH_APP_TEXT.boardFailed;
}

/** Når skjermen ikke fikk lest det den skal vise. */
export function manageLoadFailureText(reason: string): string {
  if (reason === 'not_found') return MANAGE_APP_TEXT.notFound;
  return APP_FAILURES[reason] ?? MANAGE_APP_TEXT.loadFailed;
}

/** «Singel 1 · man. 2. nov → halveres», ordrett som på nettsiden. */
export function withdrawalMatchLine(match: AppCupWithdrawalMatch): string {
  const label = match.label ?? CUP_TEXT.matchFallback;
  const when = match.when ?? WITHDRAW_TEXT.teeOffMissing;
  const { outcome } = match;
  const consequence =
    outcome.kind === 'halved'
      ? WITHDRAW_TEXT.outcomeHalved
      : outcome.kind === 'walkover'
        ? formatMessage(WITHDRAW_TEXT.outcomeWalkover, { team: outcome.teamName })
        : formatMessage(WITHDRAW_TEXT.outcomePlayOn, { partner: outcome.partnerName });
  return `${label} · ${when} → ${consequence}`;
}

export function sideAwardKind(kind: 'ctp' | 'ld' | 'gir'): string {
  if (kind === 'ctp') return CUP_TEXT.kindCtp;
  return kind === 'ld' ? CUP_TEXT.kindLd : CUP_TEXT.kindGir;
}

/** «Nærmest pinnen · hull 7 (1 av 2)», som på nettet. Plassen bare når det er flere. */
export function sideAwardTitle(award: AppCupSideAward): string {
  const head = `${sideAwardKind(award.kind)} · ${formatMessage(CUP_TEXT.holeShort, { n: award.holeNumber })}`;
  if (award.kind === 'gir' || award.slotCount <= 1) return head;
  return `${head} ${formatMessage(CUP_TEXT.slotOfCount, { slot: award.slot, count: award.slotCount })}`;
}

/** Statusen på en kamp i «Styr cupen». */
export function manageMatchStatus(match: AppCupManageMatch): string {
  return matchStatusLabel(match);
}

/** Avsenderen: kampens navn, eller «Match» når kampen ikke har et. */
function reportedSender(match: CupReportMatch): string {
  return match.matchLabel ?? CUP_TEXT.matchFallback;
}

/** «Four-ball 2 har ikke meldt inn». */
export type ReportedMissingLine = { key: string; text: string };

function reportedMissingLines(missing: readonly CupReportMatch[]): ReportedMissingLine[] {
  return missing.map((match) => ({
    key: match.gameId,
    text: formatMessage(REPORTED_MISSING, { match: reportedSender(match) }),
  }));
}

/** Én kamps svar under nærmest pinnen eller lengste drive. */
export type ReportedSlotLine = {
  key: string;
  sender: string;
  /** Vinnerens navn, eller «Ingen på green» / «Ingen på fairway». */
  name: string;
  /** Falsk: «Ingen på …», som står dempet og ikke fet. */
  answered: boolean;
  /** «1,8 m»; null når kampen ikke ga avstand. */
  distance: string | null;
};

/** Det boksen under en kåring viser: linjer, eller én setning. */
export type ReportedSlotBox = {
  lines: ReportedSlotLine[];
  missing: ReportedMissingLine[];
  /** Én setning i stedet for linjer: ingen har meldt inn, eller lesingen feilet. */
  empty: string | null;
};

/**
 * Boksen under nærmest pinnen og lengste drive. Kampene som ikke har meldt inn,
 * nevnes først når en kamp har det: ellers er det én setning, ikke en liste med
 * alle kampene. Samme regel som nettets `SlotReportedBox`.
 */
export function reportedSlotBox(kind: 'ctp' | 'ld', reports: CupSlotReports | 'failed'): ReportedSlotBox {
  if (reports === 'failed') return { lines: [], missing: [], empty: SIDE_REPORTED_TEXT.readFailed };
  const lines = reports.lines.map(
    (line): ReportedSlotLine => ({
      key: line.gameId,
      sender: reportedSender(line),
      name: line.name ?? REPORTED_NO_ONE[kind],
      answered: line.name !== null,
      distance: line.distanceM === null ? null : reportedDistance(line.distanceM),
    }),
  );
  if (lines.length === 0) return { lines, missing: [], empty: SIDE_REPORTED_TEXT.none };
  return { lines, missing: reportedMissingLines(reports.missing), empty: null };
}

/** Ett lags linje under GIR-tellerne: «Rød:» står fet, resten står etter. */
export type ReportedGirTeam = {
  key: 'team1' | 'team2';
  /** «Rød:». */
  label: string;
  /** « 3 (Jonas, Marte, Sigrid) · maks 2 GIR». Label pluss rest er hele linja. */
  rest: string;
  /** Over «maks per lag»: linja står i advarselsfargen. */
  over: boolean;
};

export type ReportedGirBox = {
  teams: ReportedGirTeam[];
  missing: ReportedMissingLine[];
  empty: string | null;
};

/**
 * Boksen under begge GIR-tellerne: et lag per linje, summen over alle kampene og
 * hvem som traff. Over «maks per lag» står tallet likevel, med taket ved siden av.
 */
export function reportedGirBox(
  reports: CupGirReport | 'failed',
  team1Name: string,
  team2Name: string,
): ReportedGirBox {
  if (reports === 'failed') return { teams: [], missing: [], empty: SIDE_REPORTED_TEXT.readFailed };
  if (reports.reportedMatches === 0) return { teams: [], missing: [], empty: SIDE_REPORTED_TEXT.none };
  const team = (key: 'team1' | 'team2', name: string): ReportedGirTeam => {
    const sum = reports[key];
    const over = sum.overMax === true;
    const who = sum.names.length > 0 ? ` (${sum.names.join(', ')})` : '';
    const max = over ? ` · ${formatMessage(REPORTED_GIR_MAX, { max: reports.maxPerTeam })}` : '';
    return { key, label: `${name}:`, rest: ` ${sum.count}${who}${max}`, over };
  };
  return {
    teams: [team('team1', team1Name), team('team2', team2Name)],
    missing: reportedMissingLines(reports.missing),
    empty: null,
  };
}
