/**
 * The setup form's side of the slot holes (#2283): what it keeps while the
 * organiser chooses, as `games.side_ld_holes`/`side_ctp_holes` will hold it.
 * The shared parser (`parseSideTournamentFromFormData`) refuses two slots of
 * one category on the same hole, so the form never lets that state happen: it
 * moves the hole instead.
 *
 * Pure and without imports from the web app, so the form state, its draft
 * storage and the tests all read one copy of the rule.
 */

import { SIDE_CONTEST_HOLE_MAX, SIDE_CONTEST_HOLE_MIN, SIDE_CONTEST_SLOT_MAX } from './sideContest';

/** One entry per slot (null = «Velg hull senere»). May be shorter than the count. */
export type SlotHoles = readonly (number | null)[];

/**
 * Seeds the form from `games.side_*_holes`, an older draft or a rematch.
 * Storage and rows are not trusted: a value that is not a whole hole in 1–18
 * becomes null, a second slot on the same hole loses it, and slots past
 * `SIDE_CONTEST_SLOT_MAX` are dropped.
 */
export function normalizeSlotHoles(raw: unknown): (number | null)[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  return raw.slice(0, SIDE_CONTEST_SLOT_MAX).map((value) => {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < SIDE_CONTEST_HOLE_MIN ||
      value > SIDE_CONTEST_HOLE_MAX ||
      seen.has(value)
    ) {
      return null;
    }
    seen.add(value);
    return value;
  });
}

/**
 * Slot `position` (1-based) gets `hole`; null clears it. A hole another slot
 * of the category already has moves here, and that slot goes back to «Velg hull
 * senere», so the state can never hold the duplicate the parser refuses.
 */
export function withSlotHole(
  holes: SlotHoles,
  position: number,
  hole: number | null,
): (number | null)[] {
  const next = [...holes];
  while (next.length < position) next.push(null);
  for (let i = 0; i < next.length; i += 1) if (hole !== null && next[i] === hole) next[i] = null;
  next[position - 1] = hole;
  return next;
}
