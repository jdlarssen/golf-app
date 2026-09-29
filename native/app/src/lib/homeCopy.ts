// #2254: all tekst på startboden — Hjem med heltekortet, billetten og forrige
// runde.
//
// Samme mønster som `profileCopy.ts`: appen har ingen i18n ennå, så teksten
// bor her som en håndkopi. Det som også står på nettsiden (hilsenen, tavlas
// plass- og avstandstekst, webbens `finishedCard.*`), låses tegn for tegn mot
// `messages/no.json` i `homeCopy.test.ts`. Rettes en av dem på webben uten at
// appen følger etter, blir testen rød.
import type { TeeOffProximity } from '../../../../lib/format/teeOffProximity';
import type { FinishedResultBadge } from '../../../../lib/games/finishedResultBadge';
import type { LiveBoardUnit, ViewerStanding } from '../../../../lib/leaderboard/liveBoard';
import { formatVsPar } from '../../../../lib/leaderboard/vsPar';

export const HOME_TEXT = {
  /** Webbens `home.sectionInProgress`; kickeren settes i versaler av stilen. */
  inProgress: 'Pågår nå',
  /** Webbens `home.sectionMyGames`. */
  myGames: 'Mine spill',
  moreInProgress: 'Flere runder i gang',
  nextStart: 'Neste start',
  lastRound: 'Forrige runde',
  allRounds: 'Alle runder →',
  /** Webbens `leaderboard.board.showFewer`. */
  showFewer: 'Vis færre',
  createGame: 'Opprett spill',
  /** Webbens `home.playerFallback`, når profilen mangler navn. */
  playerFallback: 'spiller',
  hcp: 'HCP',
  holeKicker: 'Hull',
  playedKicker: 'Spilt',
  /** Webbens `leaderboard.board.stripSubmit`. */
  submit: 'Lever scorekort →',
  openRound: 'Åpne runden →',
  board: 'Se tavla →',
  leading: 'Du leder',
  sharedLead: 'Delt ledelse',
  noTeeOff: 'Tid ikke satt',
  today: 'I dag',
  /** Webbens `home.proximity.tomorrow`. */
  tomorrow: 'I morgen',
  /** Webbens `home.roundTeamBall`. */
  teamRound: 'Lagrunde',
} as const;

/** Webbens `home.greeting`. */
export function greeting(name: string): string {
  return `Hei, ${name}.`;
}

/** Skjermleserteksten på HCP-pillen, som webbens `HandicapChip`. */
export function hcpA11yLabel(hcp: string): string {
  return `Handicap ${hcp}. Trykk for å oppdatere.`;
}

export function continueOnHole(hole: number): string {
  return `Fortsett på hull ${hole} →`;
}

/** Ringens etikett når det finnes et neste hull: «Hull 8 av 18, 7 spilt». */
export function ringNextLabel(hole: number, holeCount: number, played: number): string {
  return `Hull ${hole} av ${holeCount}, ${played} spilt`;
}

/** «7 av 18 hull spilt» — linja uten plass, og ringens etikett når alt er spilt. */
export function holesPlayedLine(played: number, holeCount: number): string {
  return `${played} av ${holeCount} hull spilt`;
}

/** Den store linja: plassen, eller at du leder. Tavlas `stripPlace`/`stripTiedPlace`. */
export function placeLine(standing: Pick<ViewerStanding, 'rank' | 'tied'>): string {
  if (standing.rank === 1) return standing.tied ? HOME_TEXT.sharedLead : HOME_TEXT.leading;
  return standing.tied ? `Delt ${standing.rank}. plass` : `${standing.rank}. plass`;
}

function totalAfter(total: number, unit: LiveBoardUnit, holes: number): string {
  const after = `etter ${holes} hull`;
  if (unit === 'points') return `${total} poeng ${after}`;
  if (unit === 'net') return `${total} slag netto ${after}`;
  return `${formatVsPar(total)} ${after}`;
}

/**
 * Linja under plassen: «15 poeng etter 7 hull · 3 poeng bak ledelsen».
 *
 * Avstanden er tavlas (`behindPointsLead`/`behindStrokesLead`), og vises bare
 * når den er større enn null, som på tavla. Uten den står feltets størrelse
 * FØRST, fordi den hører til plassen over: «3. plass» / «av 12 spillere · 15
 * poeng etter 7 hull». Lederen leder «blant» feltet, ikke «av» det.
 */
export function standingDetail(
  standing: Pick<ViewerStanding, 'rank' | 'total' | 'holesPlayed' | 'gap' | 'fieldSize'>,
  unit: LiveBoardUnit,
): string {
  const total =
    standing.total !== null ? totalAfter(standing.total, unit, standing.holesPlayed) : null;
  if (standing.gap !== null && standing.gap > 0) {
    const behind =
      unit === 'points' ? `${standing.gap} poeng bak ledelsen` : `${standing.gap} slag bak ledelsen`;
    return [total, behind].filter(Boolean).join(' · ');
  }
  const field =
    standing.rank === 1
      ? `blant ${standing.fieldSize} spillere`
      : `av ${standing.fieldSize} spillere`;
  return [field, total].filter(Boolean).join(' · ');
}

export function approvalsLine(count: number): string {
  return `${count} kort venter på godkjenningen din →`;
}

/**
 * Nærheten i billettens stubb. «I dag» står uten klokkeslett, for det står
 * rett over. De to andre er webbens `home.proximity.*`.
 */
export function proximityText(proximity: TeeOffProximity): string | null {
  if (proximity === null) return null;
  if (proximity.kind === 'today') return HOME_TEXT.today;
  if (proximity.kind === 'tomorrow') return HOME_TEXT.tomorrow;
  return `Om ${proximity.days} dager`;
}

export function flightPart(flightNumber: number): string {
  return `Flight ${flightNumber}`;
}

/** Resten som ikke fikk egen skive: «+1 til». */
export function moreAvatars(count: number): string {
  return `+${count} til`;
}

/** Avatarradens etikett: hvem du spiller med. */
export function companionsLabel(names: readonly string[], inFlight: boolean): string {
  return `${inFlight ? 'Flighten din' : 'Med i runden'}: ${names.join(', ')}`;
}

/** Skjermleserteksten for hele billetten, som er ett trykkfelt. */
export function ticketA11yLabel(parts: readonly (string | null)[]): string {
  return [HOME_TEXT.nextStart, ...parts]
    .filter((part): part is string => part != null && part !== '')
    .join('. ');
}

function skinsCount(count: number): string {
  return count === 1 ? `${count} skin` : `${count} skins`;
}

/**
 * Teksten for plassen i en avsluttet runde. Nøklene er de
 * `finishedResultBadge` gir (webbens regel), og tekstene er webbens
 * `finishedCard.*`. En ukjent nøkkel gir `null`: da står raden uten plass.
 */
export function finishedResultText(badge: FinishedResultBadge): string | null {
  const v = badge.values ?? {};
  switch (badge.key) {
    case 'result.youWon':
      return '🥇 Du vant';
    case 'result.teamWon':
      return '🥇 Laget vant';
    case 'result.placement':
      return `${v.rank}. plass av ${v.fieldSize}`;
    case 'result.teamPlacement':
      return `Laget ble nr ${v.rank} av ${v.fieldSize}`;
    case 'result.matchWon':
      return `Du vant ${v.margin ?? ''}`.trim();
    case 'result.matchLost':
      return `Du tapte ${v.margin ?? ''}`.trim();
    case 'result.matchTied':
      return 'Uavgjort';
    case 'result.skinsWon':
      return `🥇 ${skinsCount(Number(v.count))}`;
    case 'result.skins':
      return skinsCount(Number(v.count));
    default:
      return null;
  }
}

export function bruttoText(brutto: number): string {
  return `${brutto} brutto`;
}
