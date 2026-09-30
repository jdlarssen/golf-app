// #2265: én runde i runde-lista, til testene av Rundedagboka og statistikken.
//
// Suitene kjører med `TZ=UTC`, og dagboka leser enhetens lokaltid. `localIso`
// bygger tidsstempelet med en lokal konstruktør, så «31. august kl. 23.30»
// betyr det i sonen koden regner i.
import type { HistoryRound } from '../lib/roundHistory';

/** Et tidsstempel for en lokal dato i 2026 (måned 0–11). */
export function localIso(month0: number, day: number, hour = 12, minute = 0, year = 2026): string {
  return new Date(year, month0, day, hour, minute).toISOString();
}

/** En hel 18-hullsrunde i slagspill, 19. september 2026, med 86 brutto. */
export function historyRound(partial: Partial<HistoryRound> & { gameId: string }): HistoryRound {
  const date = partial.date === undefined ? localIso(8, 19) : partial.date;
  return {
    name: 'Lørdagsrunden',
    courseName: 'Byneset North',
    courseId: 'c1',
    gameMode: 'solo_strokeplay',
    holeSegment: 'full',
    year: date ? new Date(date).getFullYear() : null,
    teamBall: false,
    holeCount: 18,
    brutto: 86,
    netto: 72,
    completeBrutto: 86,
    holes: [],
    putts: [],
    differential: null,
    resultSummary: null,
    ...partial,
    date,
  };
}
