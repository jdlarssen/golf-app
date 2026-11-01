// #2752: teksten i «Styr cupen», trekket og byttet. Der nettet sier det samme, er
// ordlyden nettets (`cup.manage`, `cup.withdraw`, `cup.swap` i messages/no.json),
// låst i `cupManageCopy.test.ts`. Det som er nytt i appen, står i `MANAGE_APP_TEXT`.
import type {
  AppCupManageMatch,
  AppCupWithdrawalMatch,
} from '../../../../lib/cup/appCupManageView';
import { MAX_PERSONAL_CUP_PLAYERS } from '../../../../lib/cup/limits';
import { formatMessage } from './kavalkadeCopy';
import { CUP_TEXT, matchStatusLabel } from './cupCopy';

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
  loadFailed: 'Fikk ikke tak i cupen. Sjekk nettet og prøv igjen.',
  notFound: 'Fant ikke cupen. Den finnes ikke, eller du har ikke tilgang.',
  notManager: 'Det er arrangøren som styrer cupen.',
  retry: 'Prøv igjen',
  swapSummary: '{in} går inn for {out}.',
  swapBundled: 'Byttet gjelder alle kampene på denne dagen.',
  playOnQuestion: 'Skal {partner} spille alene, eller avgjøres kampen uten spill?',
} as const;

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

/** Statusen på en kamp i «Styr cupen». */
export function manageMatchStatus(match: AppCupManageMatch): string {
  return matchStatusLabel(match);
}
