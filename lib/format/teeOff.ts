/**
 * Tee-off formatting helpers.
 *
 * IMPORTANT: All formatting is pinned to Europe/Oslo so the same Date instant
 * renders identically on a UTC Vercel server and on an Oslo client browser —
 * avoiding hydration mismatches and the 1–2 hour drift bug we hit pre-DST.
 *
 * Never use the local-TZ Date getters (getHours, getMinutes, getDay,
 * getDate, getMonth, setHours, setMinutes, ...) for user-visible output.
 */

const OSLO = 'Europe/Oslo';

// Stable Norwegian day/month abbreviations, matching the project's prior
// visual output ("tor. 14. mai"). We could let Intl produce them, but its
// nb-NO "short" weekday output is "tor." and short month is "mai." (with a
// trailing dot) — the existing UI uses no dot on the month, so we keep the
// hand-rolled tables to preserve pixel-identical output.
const DAY_NAMES = ['søn.', 'man.', 'tir.', 'ons.', 'tor.', 'fre.', 'lør.'] as const;
const MONTH_NAMES = [
  'jan', 'feb', 'mar', 'apr', 'mai', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'des',
] as const;

/** Returns the Oslo wall-clock parts (hour, minute, day-of-month, month index 0-11, weekday index 0-6 sun=0). */
function osloParts(date: Date): {
  hour: number;
  minute: number;
  day: number;
  month: number;
  weekday: number;
} {
  // en-GB gives us numeric ISO-ish parts in 24-hour form which is easiest to parse.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: OSLO,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);

  let hour = 0;
  let minute = 0;
  let day = 1;
  let month = 0; // 0-indexed to match Date#getMonth semantics
  let weekdayShort = 'Sun';
  for (const p of parts) {
    if (p.type === 'hour') hour = Number(p.value);
    else if (p.type === 'minute') minute = Number(p.value);
    else if (p.type === 'day') day = Number(p.value);
    else if (p.type === 'month') month = Number(p.value) - 1;
    else if (p.type === 'weekday') weekdayShort = p.value;
  }

  // Intl 'hour' for hour12:false can render midnight as '24' in some
  // engines (notably older V8); normalise to 0.
  if (hour === 24) hour = 0;

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[weekdayShort] ?? 0;

  return { hour, minute, day, month, weekday };
}

export function formatTeeOffTime(date: Date): string {
  const { hour, minute } = osloParts(date);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatTeeOffDate(date: Date): string {
  const { day, month, weekday } = osloParts(date);
  return `${DAY_NAMES[weekday]} ${day}. ${MONTH_NAMES[month]}`;
}

export function expectedFirstScoreTime(teeOff: Date): string {
  // Add 30 minutes to the absolute instant (this is TZ-safe — Date math
  // is on UTC milliseconds), then read the Oslo wall-clock minute and
  // ceiling-round to the next 5-minute mark. If rounding pushes minute to
  // 60, roll the hour forward by adding the remaining minutes as a delta
  // on the instant; the resulting absolute time will display correctly in
  // Oslo even across hour, day or DST boundaries.
  const plus30Ms = teeOff.getTime() + 30 * 60 * 1000;
  const plus30 = new Date(plus30Ms);
  const { minute } = osloParts(plus30);
  const rounded = Math.ceil(minute / 5) * 5;
  const delta = rounded - minute; // 0..5
  const final = new Date(plus30Ms + delta * 60 * 1000);
  return formatTeeOffTime(final);
}
