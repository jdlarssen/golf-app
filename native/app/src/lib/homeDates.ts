// #2254: datoene på startboden — datolinja øverst på Hjem og stubben på
// billetten for neste start.
//
// **Enhetens lokaltid, ingen `Intl`.** Webben regner slike datoer i Oslo-tid
// (`lib/format/teeOff.ts`, `lib/format/teeOffProximity.ts`) fordi serveren går
// på UTC. Den veien er stengt her: Hermes mangler ICU-tidssonene (app-spike.md,
// «Ikke bruk webbens Oslo-parser i appen»). Appen regner derfor alle tider i
// telefonens egen tid, som `formatTeeOff` i `display.ts`, og det er riktig for
// en spiller som står i Norge.
import { formatShortDateNb } from '../../../../lib/format/date';
import type { TeeOffProximity } from '../../../../lib/format/teeOffProximity';
import { formatClock } from './display';

/** `Date#getDay()`-rekkefølge: søndag først. */
const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'] as const;
const WEEKDAYS_SHORT = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'] as const;
const MONTHS = [
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

/** Samme grense som webbens `teeOffProximity`: seks dager fram, så vanlig dato. */
const MAX_SOON_DAYS = 6;

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function parse(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Datolinja øverst på Hjem: «Tirsdag 29. september». */
export function formatWeekdayDayMonth(date: Date): string {
  return `${capitalize(WEEKDAYS[date.getDay()])} ${date.getDate()}. ${MONTHS[date.getMonth()]}`;
}

/**
 * Kalenderdagen som et heltall, uten tidssone. `Date.UTC` er her bare en
 * kalender→løpenummer-tabell (samme grep som webbens regel), så sommertid og
 * sone-forskyvning aldri kommer inn i differansen.
 */
function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/**
 * Hvor nær tee-off er, i kalenderdager i enhetens lokaltid. Speiler bøttene og
 * grensen i webbens `teeOffProximity`: i dag, i morgen, 2–6 dager, ellers
 * `null` (også for en dag som er passert og for manglende eller ugyldig tid).
 * Et kvarter over midnatt er «i morgen», ikke «i dag».
 */
export function teeOffProximityLocal(iso: string | null, now: Date): TeeOffProximity {
  const teeOff = parse(iso);
  if (!teeOff) return null;
  const diff = dayNumber(teeOff) - dayNumber(now);
  if (diff < 0) return null;
  if (diff === 0) return { kind: 'today' };
  if (diff === 1) return { kind: 'tomorrow' };
  if (diff <= MAX_SOON_DAYS) return { kind: 'days', days: diff };
  return null;
}

/**
 * Datoen i billettens stubb: «Lør 3. okt». Den korte datoen er den delte
 * `formatShortDateNb`, så månedsforkortelsene har ett hjem.
 */
export function formatStubDate(iso: string | null): string | null {
  const date = parse(iso);
  if (!date) return null;
  return `${capitalize(WEEKDAYS_SHORT[date.getDay()])} ${formatShortDateNb(date)}`;
}

/**
 * Kalenderdatoen i enhetens lokaltid (#2265): ukesrekka i Rundedagboka leser
 * uker og år med den i stedet for webbens `osloParts` (se toppen av fila).
 */
export function localDateParts(date: Date): { year: number; month: number; day: number } {
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

/** Datokolonnen i Rundedagboka (#2265): «20» over «LØR». */
export function formatDiaryDay(date: Date): { day: string; weekday: string } {
  return {
    day: String(date.getDate()),
    weekday: WEEKDAYS_SHORT[date.getDay()].toUpperCase(),
  };
}

/**
 * Overskriften over en måned i Rundedagboka (#2265): «september», eller
 * «september 2025» når året ikke er det i undertittelen. Stilen setter den i
 * versaler, som designets «SEPTEMBER».
 */
export function diaryMonthLabel(year: number, month: number, currentYear: number | null): string {
  return year === currentYear ? MONTHS[month] : `${MONTHS[month]} ${year}`;
}

/** Klokkeslettet i stubben: «kl. 09:30», samme form som `formatTeeOff`. */
export function formatStubClock(iso: string | null): string | null {
  const clock = formatClock(iso);
  return clock === null ? null : `kl. ${clock}`;
}
