// Bingo Bango Bongo: keep a hole screen's rows converging on the database
// (#1950). The sequence rule lives in `lib/sync/sequencedHoleRows.ts`; this
// module only says that a local save merges one category.

import type { BingoBangoBongoHoleInput } from '@/lib/scoring/modes/types';
import {
  applySequencedLocalSave,
  applySequencedRead,
  type SequencedHoleRows,
} from '@/lib/sync/sequencedHoleRows';
import {
  mergeCategory,
  type BingoBangoBongoCategoryKey,
} from './mergeBingoBangoBongoCategory';

export type BbbHolesState = SequencedHoleRows<BingoBangoBongoHoleInput>;

/** Apply the rows a read returned, unless a later read or save is on screen. */
export function applyBbbRead(
  state: BbbHolesState,
  seq: number,
  rows: BingoBangoBongoHoleInput[],
): BbbHolesState {
  return applySequencedRead(state, seq, rows);
}

/**
 * Merge our own saved category into the rows. Only that category changes, so
 * a flight-mate's category on the same hole stays. The read scheduled after
 * the save supersedes the merge.
 */
export function applyBbbLocalSave(
  state: BbbHolesState,
  seq: number,
  holeNumber: number,
  key: BingoBangoBongoCategoryKey,
  userId: string | null,
): BbbHolesState {
  return applySequencedLocalSave(
    seq,
    mergeCategory(state.holes, holeNumber, key, userId),
  );
}
