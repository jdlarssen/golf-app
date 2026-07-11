/**
 * Streak-/konsistens-mekanikk (#1194) — ren aggregering av en spillers ferdige
 * runder til en POSITIV streak-tilstand.
 *
 * Merkevare-guardrail (issuet): FEIR streaken, ALDRI straff bruddet. Denne
 * funksjonen har derfor ingen «tap»-begrep — et brudd er en stille reset:
 * `weeklyStreakActive` blir bare `false`, og kallstedet velger å vise «nå» som 0
 * eller ingenting. Ingen nedtelling, ingen negativ ramme finnes her.
 *
 * Granularitet = Oslo-ISO-kalenderuker med ≥1 runde (matcher issuets «spilt hver
 * uke i N uker»). Alt avledes fra Oslo-veggklokke via `osloParts`/`osloIsoWeek`,
 * så tellingen er DST-uavhengig og host-TZ-uavhengig. Ren og I/O-fri (Type A, jf.
 * `lib/scoring/AGENTS.md`).
 */
import { osloParts } from '@/lib/format/teeOff';
import { osloIsoWeek } from '@/lib/format/osloCalendar';

const WEEK_MS = 604_800_000; // 7 × 24 × 3600 × 1000

export type StreakInput = {
  /** Effektive datoer for ferdige runder (rekkefølge er likegyldig). */
  dates: Date[];
  /** «Nå» — injiseres for testbarhet; ingen klokke-lesing her inne. */
  now: Date;
};

export type StreakSummary = {
  /** (b) Lengste sammenhengende løp av Oslo-ISO-uker som ENDER i siste rundes uke. */
  weeklyStreak: number;
  /**
   * `true` når siste runde er i inneværende ELLER forrige Oslo-uke (grace) — en
   * tom pågående uke bryter aldri streaken. `false` ⇒ stille reset (vis som 0 for
   * «nå», aldri som tap).
   */
  weeklyStreakActive: boolean;
  /** (c) Ferdige runder i inneværende Oslo-kalenderår (`now`s år). */
  roundsThisSeason: number;
  /** (a) Antall runder som faller innenfor det sammenhengende uke-løpet (b). */
  roundsInStreak: number;
  /** «YYYY-Www» for siste rundes ISO-uke (tester/debug). `null` uten runder. */
  lastRoundWeekKey: string | null;
};

/**
 * Mandagen (UTC-forankret) i Oslo-ISO-uka som `date` faller i, pluss ISO-uke-året.
 * Forankret på Oslo-kalenderdatoen (via `osloParts`) og bygget som en UTC-dato, så
 * all uke-aritmetikk er DST-uavhengig — samme teknikk som `osloIsoWeek` bruker for
 * selve uke-NUMMERET. To påfølgende ukers mandager skiller nøyaktig `WEEK_MS`.
 */
function osloWeekAnchor(date: Date): { mondayMs: number; isoWeekYear: number } {
  const { year, month, day } = osloParts(date);
  const target = new Date(Date.UTC(year, month, day));
  const dayNr = (target.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(target.valueOf());
  monday.setUTCDate(monday.getUTCDate() - dayNr);
  const thursday = new Date(monday.valueOf());
  thursday.setUTCDate(thursday.getUTCDate() + 3); // Thursday's year = ISO week-year
  return { mondayMs: monday.valueOf(), isoWeekYear: thursday.getUTCFullYear() };
}

function weekKey(date: Date): string {
  const { isoWeekYear } = osloWeekAnchor(date);
  const week = osloIsoWeek(date);
  return `${isoWeekYear}-W${String(week).padStart(2, '0')}`;
}

export function computeStreak(input: StreakInput): StreakSummary {
  const { dates, now } = input;
  if (dates.length === 0) {
    return {
      weeklyStreak: 0,
      weeklyStreakActive: false,
      roundsThisSeason: 0,
      roundsInStreak: 0,
      lastRoundWeekKey: null,
    };
  }

  const rounds = dates.map((date) => ({
    date,
    mondayMs: osloWeekAnchor(date).mondayMs,
  }));
  const weekSet = new Set(rounds.map((r) => r.mondayMs));
  const lastMonday = Math.max(...rounds.map((r) => r.mondayMs));

  // Sammenhengende løp av uker som ender i siste rundes uke, bakover til første
  // manglende uke.
  let weeklyStreak = 0;
  let cursor = lastMonday;
  while (weekSet.has(cursor)) {
    weeklyStreak += 1;
    cursor -= WEEK_MS;
  }
  const runStart = lastMonday - (weeklyStreak - 1) * WEEK_MS;

  // Løpet er sammenhengende (ingen hull), så en rundes uke ligger i løpet nøyaktig
  // når mandagen er i [runStart, lastMonday].
  const roundsInStreak = rounds.filter(
    (r) => r.mondayMs >= runStart && r.mondayMs <= lastMonday,
  ).length;

  // Grace: siste runde i inneværende eller forrige Oslo-uke.
  const currentMonday = osloWeekAnchor(now).mondayMs;
  const weeklyStreakActive =
    lastMonday === currentMonday || lastMonday === currentMonday - WEEK_MS;

  // Sesong = Oslo-kalenderår for `now`.
  const nowYear = osloParts(now).year;
  const roundsThisSeason = dates.filter(
    (date) => osloParts(date).year === nowYear,
  ).length;

  const lastRoundDate = rounds.find((r) => r.mondayMs === lastMonday)!.date;

  return {
    weeklyStreak,
    weeklyStreakActive,
    roundsThisSeason,
    roundsInStreak,
    lastRoundWeekKey: weekKey(lastRoundDate),
  };
}

export type StreakGrowth = {
  /**
   * `true` bare når DENNE runden fikk den ukentlige streaken til å vokse til et
   * ekte, pågående løp (≥2 uker). Brukes til å feire ÉN gang — aldri til press
   * eller «ikke bryt den»-copy.
   */
  grew: boolean;
  weeklyStreak: number;
  weeklyStreakActive: boolean;
};

/**
 * Om en nettopp avsluttet runde fikk den ukentlige streaken til å vokse: sammenlign
 * streaken med og uten runden. Feirer bare når resultatet er et pågående løp på ≥2
 * uker som er lengre enn før — så en ny 1-ukes «streak», en ekstra runde samme uke,
 * og en restart etter et brudd alle forblir stille (positiv ramme).
 */
export function roundStreakGrowth(input: {
  datesWithout: Date[];
  newDate: Date;
  now: Date;
}): StreakGrowth {
  const without = computeStreak({ dates: input.datesWithout, now: input.now });
  const withThis = computeStreak({
    dates: [...input.datesWithout, input.newDate],
    now: input.now,
  });
  const grew =
    withThis.weeklyStreakActive &&
    withThis.weeklyStreak >= 2 &&
    withThis.weeklyStreak > without.weeklyStreak;
  return {
    grew,
    weeklyStreak: withThis.weeklyStreak,
    weeklyStreakActive: withThis.weeklyStreakActive,
  };
}
