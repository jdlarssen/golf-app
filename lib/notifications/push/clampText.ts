/**
 * Shared length cap for push notification text.
 *
 * Both channels need it and must agree: admin-authored content (product_update
 * has no max length) would otherwise overflow the push service's ~4 KB payload
 * limit and fail silently. Extracted from sendPush.ts when the APNs channel
 * (#1282) became a second consumer — same limits, one home.
 */

/** Trim a string to `max` chars, adding an ellipsis when it was cut. */
export function clamp(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** Title cap, shared by web-push and APNs. */
export const TITLE_MAX = 120;

/** Body cap, shared by web-push and APNs. */
export const BODY_MAX = 240;
