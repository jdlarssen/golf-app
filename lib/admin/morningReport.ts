import { osloDateKey } from '@/lib/format/osloCalendar';
import { formatHHMMOslo } from '@/lib/i18n/format';

// Pure rules behind the Sekretariat's morning report (#2345): the week card,
// the scheduled rounds under «I dag» and the three lines under «Siste døgn».
// I/O-free, so the Oslo-day edges are unit-tested under TZ=UTC.

// ─── The week card ────────────────────────────────────────────────────────

/** One Oslo week from `admin_key_metrics`, oldest first, current week last. */
export type WeekInput = {
  finished: number;
  /** Absent until migration 0235 has run. */
  byOthers?: number;
  /** Absent until migration 0235 has run. */
  publicSignups?: number;
};

export type WeekSummary = {
  /** Finished rounds this week. */
  finished: number;
  /** This week minus last week. */
  diff: number;
  byOthers?: number;
  publicSignups?: number;
  /** Finished rounds per week, oldest first: the card's curve. */
  trend: number[];
};

/**
 * The current week (the last row) against the week before. A missing field
 * stays out of the result, so the card drops only that part of its sentence.
 * A missing previous week counts as zero. Null without any weeks.
 */
export function weekSummary(weeks: readonly WeekInput[]): WeekSummary | null {
  const current = weeks.at(-1);
  if (!current) return null;
  const previous = weeks.at(-2)?.finished ?? 0;
  return {
    finished: current.finished,
    diff: current.finished - previous,
    ...(current.byOthers !== undefined && { byOthers: current.byOthers }),
    ...(current.publicSignups !== undefined && { publicSignups: current.publicSignups }),
    trend: weeks.map((w) => w.finished),
  };
}

// ─── «I dag»: scheduled rounds ────────────────────────────────────────────

export type ScheduledGameInput = {
  id: string;
  name: string;
  scheduledTeeOffAt: string;
};

export type ScheduledTodayRow = {
  gameId: string;
  name: string;
  playerCount: number;
  teeOffAt: string;
  /** The tee-off has passed and the round is still scheduled. */
  late: boolean;
};

/**
 * Scheduled rounds whose tee-off falls on `now`'s Oslo date, earliest first.
 * The caller reads a ±24 h window; this keeps the Oslo day, so 23:30 UTC in
 * winter (00:30 the next day in Oslo) stays out. A row is `late` once its
 * tee-off has passed: the cron sweep should have started it.
 */
export function scheduledTodayRows(
  games: readonly ScheduledGameInput[],
  playerCounts: ReadonlyMap<string, number>,
  now: Date,
): ScheduledTodayRow[] {
  const today = osloDateKey(now);
  return games
    .filter((g) => osloDateKey(new Date(g.scheduledTeeOffAt)) === today)
    .sort((a, b) => Date.parse(a.scheduledTeeOffAt) - Date.parse(b.scheduledTeeOffAt))
    .map((g) => ({
      gameId: g.id,
      name: g.name,
      playerCount: playerCounts.get(g.id) ?? 0,
      teeOffAt: g.scheduledTeeOffAt,
      late: Date.parse(g.scheduledTeeOffAt) <= now.getTime(),
    }));
}

// ─── «Siste døgn» ─────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const LAST_DAY_MAX = 3;

export type LastDayStamp = { kind: 'time'; time: string } | { kind: 'yesterday' };

/**
 * The three newest events from the last 24 hours, newest first. An event on
 * `now`'s Oslo day is stamped with its Oslo time, an earlier one «i går»
 * (inside 24 hours that can only be the day before).
 */
export function lastDayEntries<T extends { ts: string }>(
  entries: readonly T[],
  now: Date,
): { entry: T; stamp: LastDayStamp }[] {
  const since = now.getTime() - DAY_MS;
  const today = osloDateKey(now);
  return entries
    .filter((e) => Date.parse(e.ts) >= since)
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .slice(0, LAST_DAY_MAX)
    .map((entry) => ({
      entry,
      stamp:
        osloDateKey(new Date(entry.ts)) === today
          ? { kind: 'time', time: formatHHMMOslo(entry.ts) }
          : { kind: 'yesterday' },
    }));
}
