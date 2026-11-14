// Relative imports, like `readMarker.ts`: the app imports `isQuietHourOfDay`
// for the night on its strip (#2315 PR B) and has no `@/` alias.
import { osloParts } from '../format/teeOff';
import type { NotificationKind } from './types';
import { isLockedPushGroup, pushGroupForKind } from './pushGroups';

/**
 * A player's push choices (#2315), read from `notification_preferences`.
 * `mutedGroups` is the stored list as it is: values this code does not know
 * are ignored.
 */
export type PushPreferences = {
  mutedGroups: readonly string[];
  quietHours: boolean;
};

/**
 * Quiet hours: from 22:00 up to 07:00 in Norwegian time. The app's text
 * «22:00–07:00» is held equal to these by `profileCopy.test.ts`.
 */
export const QUIET_HOURS = { start: 22, end: 7 } as const;

/** Whether an hour of the Oslo day (0–23) is a quiet hour. */
export function isQuietHourOfDay(hour: number): boolean {
  return hour >= QUIET_HOURS.start || hour < QUIET_HOURS.end;
}

/** Quiet hours at this instant, in Norwegian time whatever the host's time zone. */
export function isQuietHour(now: Date): boolean {
  return isQuietHourOfDay(osloParts(now).hour);
}

/**
 * Whether `notify()` sends the push for this kind. Only the push: the inbox
 * row and the email go as before.
 *
 * - No preferences (no row, or the read failed): push, as before #2315.
 * - «Rundene dine» (locked): push, also at night with quiet hours on (the
 *   owner, 14.11: «Nei, runder plinger»).
 * - Quiet hours on and night: no push for the groups that can be turned off.
 * - Otherwise: push unless the group is muted.
 *
 * `QUIET_KINDS` is checked by `notify()` before this, so `product_update`
 * never pushes whatever the choices are.
 */
export function shouldPush(opts: {
  kind: NotificationKind;
  prefs: PushPreferences | null;
  now: Date;
}): boolean {
  const { kind, prefs, now } = opts;
  if (!prefs) return true;
  const group = pushGroupForKind(kind);
  if (isLockedPushGroup(group)) return true;
  if (prefs.quietHours && isQuietHour(now)) return false;
  return !prefs.mutedGroups.includes(group);
}
