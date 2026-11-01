// native/app/src/lib/cupCopy.ts
// #2752: teksten i cup-rommet. Der nettet sier det samme, er ordlyden nettets
// (`cup.public`, `cup.results`, `cup.sideAwards` i messages/no.json), låst i
// `cupCopy.test.ts`. Det som er nytt i appen, står i `CUP_APP_TEXT`.
import type { AppCupMatch, AppCupProgress, AppCupStatus } from '../../../../lib/cup/appCupView';
import type { CupPlayerContribution } from '../../../../lib/cup/computeCupPlayerPoints';
import type { CupLoadFailure } from '../data/cup';
import { formatMessage } from './kavalkadeCopy';
import { WEB_LINK_TEXT } from './webLink';

export const CUP_TEXT = {
  firstTo: 'Først til {points} poeng vinner',
  pointsPendingDraft: 'Poengmålet er klart når cupen starter',
  pointsPendingActive: 'Poeng er vektet — vinneren avgjøres når cupen avsluttes',
  matchesSummary: '{finished} av {total} matcher spilt',
  noMatches: 'Ingen matcher er opprettet ennå.',
  resultsPending: 'Resultatene kommer når cupen avsluttes',
  sideAwardPoints: 'Sidepoeng: {points}',
  matchInProgress: 'Pågår',
  matchDraft: 'Utkast',
  matchPlayed: 'Spilt',
  matchScorecardsSubmitted: 'Scorekort levert',
  matchDecidedHalved: 'Halvert — {name} trakk seg',
  matchDecidedWalkover: 'Walkover til {team} — {name} trakk seg',
  matchPlayOnPending: 'Valg venter — {name} trakk seg',
  matchSoloPlayOn: '{partner} spiller alene',
  matchFallback: 'Match',
  mot: 'mot',
  matchesHeading: 'Matcher',
  winner: '{team} vant',
  tied: 'Uavgjort',
  playerPointsHeading: 'Spillerpoeng',
  yourPoints: 'Dine poeng',
  wonAgainst: 'Vant mot {opponent} · +{points}',
  tiedWith: 'Delte med {opponent} · +{points}',
  sideContribution: '{kind}, {hole} · +{points}',
  awardsHeading: 'Kåringer',
  mvpLabel: 'MVP',
  mvpValue: '{points} poeng · flest i cupen',
  underperformerLabel: 'Dro ned mest',
  underperformerValue: '{strokes} slag over eget handicap',
  matchTied: 'Delt (AS)',
  resultTo: '{result} til {name}',
  sideAwardsHeading: 'Sidepoeng hull for hull',
  sideAwardsHint: 'Ingen ekstra poeng her, bare de samme sett fra hullet.',
  sideAwardWinnerOnTeam: '{name} · {team}',
  sideAwardNoWinner: 'Ingen vant',
  sideAwardUnregistered: 'Ikke registrert',
  sideAwardPlus: '+{points}',
  sideAwardGirTeam: '{team}: {count} av {max} · +{points}',
  kindCtp: 'Nærmest pinnen',
  kindLd: 'Lengste drive',
  kindGir: 'GIR',
  holeShort: 'hull {n}',
  slotOfCount: '({slot} av {count})',
  withdrawnChip: 'Trukket',
  /** `game.home.cupStandings`: lenka fra spillets side. */
  gameLink: 'Se cupen',
  /** `cup.public`: spillerens vei ut. */
  withdrawSelfLink: 'Trekk meg fra cupen',
  withdrawnBanner: 'Du er trukket fra cupen. Arrangøren ser det her på cup-siden.',
} as const;

/** Det som er nytt i appen. */
export const CUP_APP_TEXT = {
  kicker: 'Cup',
  homeSection: 'Cupene dine',
  homeNotStarted: 'Ikke startet ennå',
  homeUnknownProgress: 'Fikk ikke lest kampene',
  mineHeading: 'Dine kamper',
  restHeading: 'Andre kamper',
  lineupPending: 'Kapteinene setter opp lagene',
  stale: 'Viser lagret cup. Fikk ikke kontakt med serveren.',
  loading: 'Henter cupen …',
  loadFailed: 'Fikk ikke tak i cupen. Sjekk nettet og prøv igjen.',
  notFound: 'Fant ikke cupen. Den finnes ikke, eller du har ikke tilgang.',
  retry: 'Prøv igjen',
  retrying: 'Prøver …',
} as const;

const STATUS_LABELS: Record<AppCupStatus, string> = {
  draft: 'Utkast',
  active: 'Pågår',
  finished: 'Avsluttet',
};

export function cupStatusLabel(status: AppCupStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Cup-poeng med norsk komma: «2,5». Samme svar som webbens `formatPoints`, låst i
 * testen. Rene cup-poeng er halve tall, så ingen tusenskille. Regnes ikke med
 * `toLocaleString`, siden Hermes ikke har de samme lokalene på alle telefoner.
 */
export function cupPoints(value: number): string {
  return String(value).replace('.', ',');
}

/** «Først til 14,5 poeng vinner», eller hva som gjelder før poengmålet finnes. */
export function pointsHeader(pointsToWin: number | null, status: AppCupStatus): string | null {
  if (pointsToWin !== null) return formatMessage(CUP_TEXT.firstTo, { points: cupPoints(pointsToWin) });
  if (status === 'active') return CUP_TEXT.pointsPendingActive;
  return status === 'draft' ? CUP_TEXT.pointsPendingDraft : null;
}

export function matchesSummary(progress: AppCupProgress): string {
  return formatMessage(CUP_TEXT.matchesSummary, { finished: progress.played, total: progress.total });
}

/** Linja på Hjem. */
export function homeCupLine(status: 'draft' | 'active', progress: AppCupProgress | null): string {
  if (status === 'draft') return CUP_APP_TEXT.homeNotStarted;
  return progress ? matchesSummary(progress) : CUP_APP_TEXT.homeUnknownProgress;
}

/** Statusen på et kampkort, i samme ordlyd som nettets. */
export function matchStatusLabel(match: Pick<AppCupMatch, 'status' | 'withdrawnName' | 'walkoverTeam'>): string {
  const values = { name: match.withdrawnName, team: match.walkoverTeam };
  switch (match.status) {
    case 'played':
      return CUP_TEXT.matchPlayed;
    case 'scorecardsSubmitted':
      return CUP_TEXT.matchScorecardsSubmitted;
    case 'inProgress':
      return CUP_TEXT.matchInProgress;
    case 'notStarted':
      return CUP_TEXT.matchDraft;
    case 'decidedHalved':
      return formatMessage(CUP_TEXT.matchDecidedHalved, values);
    case 'decidedWalkover':
      return formatMessage(CUP_TEXT.matchDecidedWalkover, values);
    case 'playOnPending':
      return formatMessage(CUP_TEXT.matchPlayOnPending, values);
  }
}

/** «3&2 til Team Nord» eller «Delt (AS)». `null` uten utfall. */
export function matchOutcomeLine(outcome: AppCupMatch['outcome']): string | null {
  if (!outcome) return null;
  if (outcome.tied) return CUP_TEXT.matchTied;
  if (!outcome.formatted || !outcome.winnerName) return null;
  return formatMessage(CUP_TEXT.resultTo, { result: outcome.formatted, name: outcome.winnerName });
}

/** «1–0», i kampens tall. */
export function matchScore(outcome: NonNullable<AppCupMatch['outcome']>): string {
  return `${cupPoints(outcome.points1)}–${cupPoints(outcome.points2)}`;
}

/** Hva spilleren fikk poeng for, på raden under navnet. */
export function contributionLine(contribution: CupPlayerContribution): string {
  const points = cupPoints(contribution.points);
  if (contribution.type === 'match') {
    return formatMessage(contribution.outcome === 'tied' ? CUP_TEXT.tiedWith : CUP_TEXT.wonAgainst, {
      opponent: contribution.opponentLabel,
      points,
    });
  }
  return formatMessage(CUP_TEXT.sideContribution, {
    kind: contribution.type === 'ctp' ? CUP_TEXT.kindCtp : CUP_TEXT.kindLd,
    hole: formatMessage(CUP_TEXT.holeShort, { n: contribution.holeNumber }),
    points,
  });
}

export function describeCupLoadFailure(reason: CupLoadFailure): string {
  switch (reason) {
    case 'not_found':
      return CUP_APP_TEXT.notFound;
    case 'no-web-base-url':
      return WEB_LINK_TEXT.missingBaseUrl;
    case 'unauthorized':
      return 'Logg inn på nytt og prøv igjen.';
    case 'offline':
    case 'network':
    case 'load_failed':
      return CUP_APP_TEXT.loadFailed;
  }
}
