// Wolf: keep a hole screen's choices converging on the database (#2092). The
// sequence rule lives in `lib/sync/sequencedHoleRows.ts`; this module only says
// that a local save replaces the choice on its own hole.

import type { WolfHoleChoice } from '@/lib/scoring/modes/types';
import {
  applySequencedLocalSave,
  applySequencedRead,
  type SequencedHoleRows,
} from '@/lib/sync/sequencedHoleRows';

export type WolfChoicesState = SequencedHoleRows<WolfHoleChoice>;

/** Apply the choices a read returned, unless a later read or save is on screen. */
export function applyWolfRead(
  state: WolfChoicesState,
  seq: number,
  rows: WolfHoleChoice[],
): WolfChoicesState {
  return applySequencedRead(state, seq, rows);
}

/**
 * Put our own saved choice on its hole. A hole has one choice, so it replaces
 * whatever stood there. The read scheduled after the save supersedes it.
 */
export function applyWolfLocalSave(
  state: WolfChoicesState,
  seq: number,
  choice: WolfHoleChoice,
): WolfChoicesState {
  return applySequencedLocalSave(seq, [
    ...state.holes.filter((c) => c.holeNumber !== choice.holeNumber),
    choice,
  ]);
}
