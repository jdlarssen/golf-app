/**
 * Pin rules (#1210) — the TypeScript home for the green-pin thresholds.
 * Pure TS, no I/O (Type A); imported by both the client components and the
 * pin-insert server action so the two layers can never disagree.
 *
 * Two-home rule (AGENTS.md trap #4): PIN_GATE_MAX_PINS and
 * PIN_GATE_WINDOW_DAYS are mirrored in the DB trigger `green_pins_gate`
 * (supabase/migrations/0142_green_pins.sql) — the DB is the outer guard that
 * stops hostile mass-insert from moving the median. A parity test in
 * pinRules.test.ts asserts the two homes agree; change both in one commit.
 *
 * The accuracy cap (MAX_PIN_ACCURACY_M) deliberately has ONE home — the
 * server action is authoritative, the client only pre-checks the same
 * constant, and the DB CHECK is just a >= 0 sanity bound (contract Key
 * Decisions: spam inside the gate is accepted design risk).
 */

/** Reject pins whose reported GPS accuracy is worse than this (meters). */
export const MAX_PIN_ACCURACY_M = 30;

/** Hide the distance line beyond this (you're on the sofa, not the course). */
export const MAX_DISPLAY_DISTANCE_M = 1000;

/** Max pins per (course, hole) inside the rolling window — DB-mirrored. */
export const PIN_GATE_MAX_PINS = 3;

/** Rolling window (days) for the pin gate — DB-mirrored. Hole placements
 * move over time, so collection reopens as old pins age out. */
export const PIN_GATE_WINDOW_DAYS = 30;

/** Whether the computed distance is plausible enough to render. */
export function shouldShowDistance(distanceM: number): boolean {
  return (
    Number.isFinite(distanceM) &&
    distanceM >= 0 &&
    distanceM <= MAX_DISPLAY_DISTANCE_M
  );
}

/** Whether a reported GPS accuracy is good enough to store a pin.
 * Missing accuracy counts as unacceptable — quality per data point matters
 * at 4–20 users (design doc §Pinne). */
export function isAcceptablePinAccuracy(
  accuracyM: number | null | undefined,
): boolean {
  return (
    accuracyM != null &&
    Number.isFinite(accuracyM) &&
    accuracyM >= 0 &&
    accuracyM <= MAX_PIN_ACCURACY_M
  );
}
