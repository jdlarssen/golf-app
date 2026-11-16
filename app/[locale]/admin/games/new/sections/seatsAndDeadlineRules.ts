import type { RegistrationMode } from '@/lib/games/registration';

/**
 * «Plasser og frist» on «Klar?» and in «Rediger» (#2482): the pure rules
 * behind the card. The bounds themselves come from `organizerCapBounds`
 * (`lib/wizard/fitsPlayerCount.ts`), the cap's one home.
 */

type Bounds = { min: number; max: number };

/** Where + starts from no cap: the artboard's 16, four flights of four. */
export const CAP_START = 16;

/**
 * One tap on − or +. + from no cap starts at 16 (or the format's cap below
 * it); − at the bottom bound removes the cap again, so the organiser can go
 * back to «Ingen grense» without a third button. Never below 2, never above
 * the bound.
 */
export function capStep(cap: number | null, direction: 1 | -1, bounds: Bounds): number | null {
  if (cap === null) return direction === 1 ? Math.max(bounds.min, Math.min(CAP_START, bounds.max)) : null;
  if (direction === -1) return cap <= bounds.min ? null : cap - 1;
  return Math.min(bounds.max, cap + 1);
}

/**
 * The cap the form saves: clamped into the bounds, since a format chosen
 * after the cap can have a lower one. `null` on matchplay (no bounds).
 */
export function capInBounds(cap: number | null, bounds: Bounds | null): number | null {
  if (cap === null || bounds === null) return null;
  return Math.min(bounds.max, Math.max(bounds.min, cap));
}

/**
 * «4 flights à 4» under the number when the cap goes up in fours; `null`
 * otherwise, and the number stands alone. A help, not a rule (contract AC 2).
 */
export function flightsOfFour(cap: number | null): number | null {
  return cap !== null && cap > 0 && cap % 4 === 0 ? cap / 4 : null;
}

/** The card shows for open signup and manual approval, never on a club tournament. */
export function showsSeatsAndDeadline(mode: RegistrationMode, clubScoped: boolean): boolean {
  return !clubScoped && (mode === 'open' || mode === 'manual_approval');
}
