// #2752: ordene i «Fordel & generer» og starten. De er nettets (`cup.generate.*`,
// `cup.manage.*`), låst i `cupGenerateCopy.test.ts`, og står her fordi appen ikke leser
// nettets katalog. Malene med `{count, plural, …}` fylles ut av `formatMessage`.
import type { CupBundleFormat } from '../../../../lib/cup/cupPairing';
import { MAX_PERSONAL_CUP_MATCHES, MAX_PERSONAL_CUP_PLAYERS } from '../../../../lib/cup/limits';
import { setupLoadFailureText } from './cupSetupCopy';
import { formatMessage } from './kavalkadeCopy';

export const GENERATE_TEXT = {
  door: 'Fordel & generer',
  pageTitle: 'Generer matcher',
  step1Heading: 'Fordel spillere på lag',
  step2Heading: 'Forhåndsvis matcher',
  unevenTeams: 'Lagene er ujevne ({count1} vs {count2}). Kun det minste lagets antall matcher genereres.',
  teamMin: '{team} trenger minst {minPerTeam} {minPerTeam, plural, one {spiller} other {spillere}}.',
  zeroMatches: 'Valgt format krever minst 2 spillere per lag.',
  overCap:
    'Oppsettet gir {totalMatches} matcher. En personlig cup tar maks {matchCap}. Skru ned antall matcher per økt lenger ned, velg færre økter eller lag en klubb-cup for flere.',
  overCapSplitDay:
    'Oppsettet gir {totalMatches} matcher. En personlig cup tar maks {matchCap}. Velg færre økter, eller lag en klubb-cup for flere.',
  capInfo: 'Personlig cup: maks {matchCap} matcher. Trenger dere flere, er det en klubb-cup som gjelder.',
  sessionCountsHeading: 'Matcher per økt',
  sessionCountsHint: 'Ikke alle trenger å spille hver økt. Skru ned antallet, så står resten over.',
  sessionCountValue: '{count} av {max}',
  sessionCountMinus: 'Færre matcher i økt {n} ({format})',
  sessionCountPlus: 'Flere matcher i økt {n} ({format})',
  regenerate: 'Generer på nytt',
  mot: 'mot',
  recapHeading: 'Oppsummering',
  courseTee: 'Bane / tee',
  matches: 'Matcher',
  matchesTotal: '{count, plural, one {# match totalt} other {# matcher totalt}}',
  confirm: 'Opprett {count, plural, one {# match} other {# matcher}}',
  confirmPending: 'Genererer …',
  next: 'Neste',
  emptyNoPlan: 'Bane, tee og format er ikke satt ennå. Det ordner du i oppsettet først.',
  emptyNoPlanLink: 'Åpne oppsettet',
  emptyNoParticipants: 'Ingen spillere er meldt på cupen ennå. Legg dem til, så fordeler du dem på lag her.',
  emptyNoParticipantsLink: 'Legg til spillere',
  flight: 'Flight {n}',
  lineupHeading: 'Oppstilling',
  lineupHint: 'Velg en annen spiller for å bytte plass — på tvers av flighter, eller med lagkameraten i denne.',
  irishHint:
    'Vil dere spille greensomen som irish? Begge slår ut, dere bytter ball på andreslaget, velger så én ball og spiller annenhver gang derfra. Appen fører bare lagballen, så scoringen er den samme som i vanlig greensome.',
  teamStrokes: 'Slag til lag {team}',
  strokesHint: 'Forslag: 60/40-fordeling av spillehandicap (60 % til laveste). Skriv over hvis dere bruker en annen fordeling.',
  spillehandicap: 'SH {n}',
  hcpIndex: 'HCP {n}',
  front9: 'Hull 1–9',
  back9: 'Hull 10–18',
  matchPlayer: '{match}, {team}, spiller {n}',
  lineupPlayer: 'Flight {flight}, {team}, plass {n}',
  /** Bare appen: antallet stemmer ikke med det skjermen så, og ingenting er skrevet nå. */
  matchesChanged: 'Antallet matcher i cupen er endret. Se gjennom listen under før du lager flere.',
} as const;

export const FORMAT_LABELS: Record<CupBundleFormat, string> = {
  foursomes_matchplay: 'Foursomes',
  fourball_matchplay: 'Four-ball',
  singles_matchplay: 'Singel',
  greensome_matchplay: 'Greensome',
  chapman_matchplay: 'Chapman',
  gruesome_matchplay: 'Gruesome',
  best_ball: 'Best ball',
};

const GENERATE_FAILURES: Record<string, string> = {
  not_draft: 'Cupen er allerede startet.',
  missing_plan: 'Cupen mangler oppsett. Velg bane, tee og format i oppsettet først.',
  plan_tee: 'Teen finnes ikke lenger. Åpne oppsettet og velg tee på nytt.',
  no_matches: 'Ingen matcher å opprette.',
  insert_failed: 'Klarte ikke å opprette matchene. Prøv igjen.',
  profile_read_failed: 'Fikk ikke tak i spillerdataene, så matchene ble ikke laget. Prøv igjen.',
  too_many_matches: 'En personlig cup tar maks {max} matcher. Vil du ha flere, lag en klubb-cup.',
  too_many_players: 'En personlig cup tar maks {max} spillere. Vil du ha flere, lag en klubb-cup.',
  tee_off_in_past: 'Tee-off kan ikke være i fortiden. Velg et tidspunkt fra nå av.',
  rollback_failed:
    'Noen av matchene ble laget før det gikk galt, og de ble ikke fjernet igjen. Ta kontakt med administrator for å få ryddet cupen.',
};

/** Hvorfor kampene ikke ble laget. Nett og tilgang sier det samme som resten av oppsettet. */
export function generateFailureText(reason: string): string {
  if (reason === 'too_many_matches') {
    return formatMessage(GENERATE_FAILURES.too_many_matches, { max: MAX_PERSONAL_CUP_MATCHES });
  }
  if (reason === 'too_many_players') {
    return formatMessage(GENERATE_FAILURES.too_many_players, { max: MAX_PERSONAL_CUP_PLAYERS });
  }
  if (GENERATE_FAILURES[reason]) return GENERATE_FAILURES[reason];
  // Koder nettets kart ikke har (en håndlaget plan) får samme setning som der.
  const app = setupLoadFailureText(reason);
  return app === setupLoadFailureText('load_failed') ? GENERATE_FAILURES.insert_failed : app;
}

export const START_TEXT = {
  button: 'Start cupen',
  pending: 'Starter …',
  hint: 'Du må opprette minst 2 matcher før du kan starte cupen.',
  started: 'Cupen er startet. Spillerne får varsel.',
  matchesGenerated: 'Matchene er opprettet. Se gjennom listen under.',
} as const;

const START_FAILURES: Record<string, string> = {
  too_few_matches: START_TEXT.hint,
  wrong_status: 'Cupen er ikke i utkast-status og kan ikke startes.',
  start_failed: 'Klarte ikke å starte cupen.',
  not_found: 'Cupen finnes ikke.',
};

export function startFailureText(reason: string): string {
  if (START_FAILURES[reason]) return START_FAILURES[reason];
  const app = setupLoadFailureText(reason);
  return app === setupLoadFailureText('load_failed') ? START_FAILURES.start_failed : app;
}

/** Spillehandicapet er et helt tall, og et negativt er et plusshandicap: «+3». */
export function spillehandicapText(value: number): string {
  return formatMessage(GENERATE_TEXT.spillehandicap, { n: value < 0 ? `+${-value}` : String(value) });
}
