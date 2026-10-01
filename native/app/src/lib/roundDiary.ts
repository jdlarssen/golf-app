// #2265: dagboka i Rundedagboka — rundene delt i måneder, underlinja og
// plassen til høyre, slik designlerretet (`Historikk-forslag`) tegner dem.
//
// **Månedene er enhetens lokaltid** (`getFullYear`/`getMonth`), som året i
// `lib/roundHistory.ts`: Hermes har ikke Oslo-sonen (app-spike.md). En runde
// som slo ut 31. august kl. 23.30 på en norsk telefon står i august.
//
// **Underlinja** er «Bane · Format · resultat». Formatnavnet er webbens
// `MODE_LABELS`; på en ni-hullsrunde står «9 hull» i stedet. Resultatet er
// «lag» når laget delte én ball, poengene i formatene der tavla viser poeng
// (regnet på telefonen som «Forrige runde» på Hjem), ingenting i matchplay
// (resultatet til høyre er formatets enhet), og ellers brutto når runden er
// hel for sin lengde. Ellers står det ingenting etter formatet.
//
// Ren og I/O-fri (Type A).
import { finishedResultBadge } from '../../../../lib/games/finishedResultBadge';
import { MODE_LABELS, isMatchplayFamily } from '../../../../lib/scoring/modes/types';
import type { ResultSummary } from '../../../../lib/scoring/resultSummary';
import { COMPLETE_ROUND_HOLES } from '../../../../lib/stats/playerStats';
import { HISTORY_TEXT, placementSpoken, pointsShort } from './historyCopy';
import { HOME_TEXT, bruttoText, finishedResultText, pointsText } from './homeCopy';
import { formatWeekdayDayMonth } from './homeDates';
import { countsPoints } from './lastRound';
import type { HistoryRound } from './roundHistory';

/** Én måned i dagboka. `year`/`month` er `null` for de udaterte rundene. */
export interface DiaryMonth {
  key: string;
  year: number | null;
  /** Måneden, 0–11. */
  month: number | null;
  rounds: HistoryRound[];
}

function roundDate(round: HistoryRound): Date | null {
  if (round.date == null) return null;
  const date = new Date(round.date);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Rundene delt i måneder, nyeste måned først og udaterte sist. Rekkefølgen
 * inne i en måned er lista sin (nyeste først).
 */
export function groupDiaryByMonth(rounds: readonly HistoryRound[]): DiaryMonth[] {
  const months = new Map<string, DiaryMonth>();
  for (const round of rounds) {
    const date = roundDate(round);
    const year = date?.getFullYear() ?? null;
    const month = date?.getMonth() ?? null;
    const key = date ? `${year}-${month}` : 'undated';
    const group = months.get(key) ?? { key, year, month, rounds: [] };
    group.rounds.push(round);
    months.set(key, group);
  }
  const order = (m: DiaryMonth) => (m.year == null || m.month == null ? -1 : m.year * 12 + m.month);
  return [...months.values()].sort((a, b) => order(b) - order(a));
}

export type DiaryMedal = 'gold' | 'silver' | 'bronze';

export type DiaryResult =
  | {
      kind: 'place';
      rank: number;
      fieldSize: number;
      /** Medaljong bare på plass 1–3; ellers en ring med tallet. */
      medal: DiaryMedal | null;
      /** Plassen for skjermleseren: «2. plass av 8». */
      spoken: string;
    }
  | { kind: 'text'; text: string };

const MEDALS: readonly DiaryMedal[] = ['gold', 'silver', 'bronze'];

/**
 * Det som står til høyre på raden. Plass og feltstørrelse fra det lagrede
 * utfallet, med medaljong på 1–3. Skins får medaljong bare med vunne skins,
 * samme vakt som `finishedResultBadge` («🥇 0 skins» gir ingen mening).
 * Matchplay skriver resultatet i ord («Du vant 3&2»). Uten utfall: ingenting.
 */
export function diaryResult(summary: ResultSummary | null): DiaryResult | null {
  if (summary == null) return null;
  if (summary.kind === 'matchplay') {
    const text = finishedResultText(finishedResultBadge(summary));
    return text ? { kind: 'text', text } : null;
  }
  const earned = summary.kind === 'placement' || summary.skins > 0;
  return {
    kind: 'place',
    rank: summary.rank,
    fieldSize: summary.fieldSize,
    medal: earned ? (MEDALS[summary.rank - 1] ?? null) : null,
    spoken: placementSpoken(summary),
  };
}

/** Hullene runden har etter lengden: 18, eller 9 på en ni-hullsrunde. */
function segmentHoles(round: HistoryRound): number {
  return round.holeSegment === 'full' ? COMPLETE_ROUND_HOLES : COMPLETE_ROUND_HOLES / 2;
}

type Result = { shown: string; spoken: string };

/**
 * Resultatet i underlinja. `points` er poengene regnet på telefonen: et tall,
 * `null` (tavla gir ingen poeng) eller `undefined` (ikke regnet ennå).
 */
function lineResult(round: HistoryRound, points: number | null | undefined): Result | null {
  if (round.teamBall) return { shown: HISTORY_TEXT.teamShort, spoken: HOME_TEXT.teamRound };
  // Matchplay: resultatet til høyre («Du vant 2&1») er formatets enhet.
  if (isMatchplayFamily(round.gameMode)) return null;
  if (countsPoints(round.gameMode)) {
    return points != null ? { shown: pointsShort(points), spoken: pointsText(points) } : null;
  }
  if (round.brutto != null && round.holeCount === segmentHoles(round)) {
    const text = bruttoText(round.brutto);
    return { shown: text, spoken: text };
  }
  return null;
}

function formatPart(round: HistoryRound): string | null {
  if (round.holeSegment !== 'full') return HISTORY_TEXT.nineHoles;
  return MODE_LABELS[round.gameMode] ?? null;
}

/** Underlinja: «Byneset North · Stableford · 38 p». */
export function diarySubline(round: HistoryRound, points: number | null | undefined): string {
  return [round.courseName, formatPart(round), lineResult(round, points)?.shown]
    .filter((part): part is string => part != null && part !== '')
    .join(' · ');
}

/**
 * Hele raden som én setning for skjermleseren: «Lørdag 20. september,
 * Lørdagsrunden, Byneset North, Stableford, 38 poeng, 1. plass av 8». Komma,
 * ikke «·»: VoiceOver leser midtpunktet høyt.
 */
export function diaryRowLabel(round: HistoryRound, points: number | null | undefined): string {
  const date = roundDate(round);
  const result = diaryResult(round.resultSummary);
  return [
    date ? formatWeekdayDayMonth(date) : null,
    round.name,
    round.courseName,
    formatPart(round),
    lineResult(round, points)?.spoken,
    result ? (result.kind === 'place' ? result.spoken : result.text) : null,
  ]
    .filter((part): part is string => part != null && part !== '')
    .join(', ');
}
