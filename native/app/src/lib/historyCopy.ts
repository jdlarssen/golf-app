// #2265: all tekst i Rundedagboka og statistikken bak den.
//
// Samme mønster som `profileCopy.ts` og `homeCopy.ts`: appen har ingen i18n
// ennå, så teksten bor her som en håndkopi. Det som også står på webbens
// `/profile/historikk` (`profile.historikk.*`, `profile.myStats.*`,
// `finishedCard.*`), låses tegn for tegn mot `messages/no.json` i
// `historyCopy.test.ts`. «Lagrunde» og resultatteksten i matchplay hentes fra
// `homeCopy.ts`, ikke kopiert en gang til.
//
// Formkortet og dagboka følger designlerretet (`Historikk-forslag`): «Formen
// din», «brutto, 18 hull», «runder», «snitt brutto», «beste runde», «lag» og
// «38 p».
import type { ResultSummary } from '../../../../lib/scoring/resultSummary';

export const HISTORY_TEXT = {
  /** Webbens `profile.historikk.kicker`: ordet i toppen. */
  kicker: 'Historikk',
  title: 'Rundedagboka',
  /** Webbens `profile.historikk.tabStats`: toppen og tittelen på statistikken. */
  statsTitle: 'Statistikk',
  seeAllStats: 'Se all statistikk',
  /** Webbens `profile.historikk.emptyState`. */
  emptyState: 'Du har ingen fullførte runder ennå. Bli med på et spill først.',
  loadFailed: 'Fikk ikke hentet rundene dine. Prøv igjen.',
  retry: 'Prøv igjen',
  undated: 'Uten dato',
  /** Webbens `profile.historikk.unknownCourse`. */
  unknownCourse: 'Ukjent bane',

  formHeading: 'Formen din',
  formScope: 'brutto, 18 hull',
  formTooFew: 'Formkurven kommer når du har spilt to hele 18-hullsrunder.',
  stripRounds: 'runder',
  stripAverage: 'snitt brutto',
  stripBest: 'beste runde',

  /** Underlinja i dagboka: laget delte én ball. */
  teamShort: 'lag',
  nineHoles: '9 hull',

  // Statistikken (webbens `profile.myStats.*` og `profile.historikk.*`).
  myStatsHeading: 'Mine tall',
  myStatsRounds: 'Runder spilt',
  myStatsAverage: 'Brutto-snitt',
  myStatsBest: 'Beste runde',
  diffHeading: 'Handicap-form',
  seasonHeading: 'Sesongen din',
  seasonSubtitle: 'Tallene dine år for år',
  seasonColRounds: 'Runder',
  seasonColAvg: 'Snitt',
  seasonColBest: 'Beste',
  seasonBragderLabel: 'Bragder',
  seasonEmpty: 'Ingen daterte runder ennå.',
  seasonYearAriaLabel: 'Velg sesong',
  streakHeading: 'Serien din',
  streakSubtitle: 'Spill jevnlig, så vokser den uke for uke.',
  streakWeeksLabel: 'uker på rad',
  streakDormant: 'Serien starter neste gang du spiller.',
  achievementsHeading: 'Bragd-veggen',
  achievementsSubtitle: 'Bragdene dine gjennom årene, på ett brett.',
  brag: {
    holeInOne: 'Hole-in-one',
    eagle: 'Eagle',
    birdie: 'Birdie',
    turkey: 'Turkey',
  },
  puttsHeading: 'Putte-snitt',
  puttsSubtitle:
    'Putter per hull teller fra første hull du fører. Snittet krever en hel runde.',
  puttsColPph: 'PPH',
  puttsColRounds: 'Runder',
  puttsColAvg: 'Snitt',
  puttsColBest: 'Beste',
  puttsEmpty: 'Før putter på en hel runde for å se snittet ditt.',
  coursesHeading: 'Baner',
  coursesSubtitle: 'Snitt og beste per bane',
  coursesColRounds: 'Runder',
  coursesColAvg: 'Snitt',
  coursesColBest: 'Beste',
  coursesEmpty: 'Spill en komplett 18-hulls-runde for å se snitt og beste per bane.',
} as const;

/** Et tall med én desimal og komma, som «86,6» og «−1,2» (ekte minus). */
export function formatOneDecimal(value: number): string {
  const size = Math.abs(value).toFixed(1).replace('.', ',');
  return value < 0 && size !== '0,0' ? `−${size}` : size;
}

function roundsWord(count: number): string {
  return count === 1 ? '1 runde' : `${count} runder`;
}

/** Undertittelen: «16 runder i 2026». Samme form som webbens `streakSeason`. */
export function seasonLine(count: number, year: number): string {
  return `${roundsWord(count)} i ${year}`;
}

/**
 * Formsetningen uten pila (pila er dekor, skjult for skjermleseren): «3,8 slag
 * bedre enn de fem rundene før», eller «dårligere» når formen går ned. Designet
 * dropper «i snitt».
 */
export function formSentence(delta: number): string {
  const size = formatOneDecimal(Math.abs(delta));
  return `${size} slag ${delta > 0 ? 'bedre' : 'dårligere'} enn de fem rundene før`;
}

/** Etiketten ved gullprikken: «82 · ny rekord» eller «82 · beste». */
export function bestLabel(value: string, record: boolean): string {
  return `${value} · ${record ? 'ny rekord' : 'beste'}`;
}

/** Skjermleserens oppsummering av kurven, som designets `aria-label`. */
export function formCurveLabel(count: number, first: number, last: number): string {
  return `Brutto de siste ${count} rundene, fra ${first} til ${last} slag`;
}

/** Webbens `profile.historikk.diffAriaLabel` (flertall). */
export function diffCurveLabel(count: number): string {
  return count === 1
    ? 'Handicap-form over 1 fullført runde, fra eldst til nyest.'
    : `Handicap-form over ${count} fullførte runder, fra eldst til nyest.`;
}

/** Poengene i dagboka: «38 p». */
export function pointsShort(points: number): string {
  return `${points} p`;
}

/** Feltet ved siden av medaljongen: «av 8». */
export function fieldSizeShort(fieldSize: number): string {
  return `av ${fieldSize}`;
}

/**
 * Plassen for skjermleseren, med webbens `finishedCard.result.placement` og
 * `teamPlacement`: «2. plass av 8», «Laget ble nr 1 av 5». Også på plass 1,
 * der webben ellers sier «Du vant»: medaljongen viser et tall.
 */
export function placementSpoken(summary: Exclude<ResultSummary, { kind: 'matchplay' }>): string {
  if (summary.kind === 'placement' && summary.isTeam) {
    return `Laget ble nr ${summary.rank} av ${summary.fieldSize}`;
  }
  return `${summary.rank}. plass av ${summary.fieldSize}`;
}

/** Webbens `profile.historikk.seasonVsPrevious`. */
export function seasonVsPrevious(year: number): string {
  return `Sammenlignet med ${year}`;
}

/** Webbens `profile.historikk.streakSeason`: «12 runder i 2026». */
export function streakSeason(count: number, year: number): string {
  return seasonLine(count, year);
}

/** Webbens `profile.historikk.puttsNearMiss`. */
export function puttsNearMiss(missingHoles: number, partialRounds: number): string {
  return `Nesten! Du mangler putt på ${missingHoles} hull i ${roundsWord(partialRounds)}.`;
}
