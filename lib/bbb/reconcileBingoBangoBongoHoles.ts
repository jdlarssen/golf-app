// Bingo Bango Bongo: keep a hole screen's rows converging on the database
// (#1950).
//
// Supabase Realtime does not promise delivery order per subscriber, so a
// change payload applied as the full row can put an older commit on screen
// after a newer one. The hole screen therefore treats every event as a signal
// to re-read the game's rows. Each read and each local save takes a sequence
// number when it is issued; a read is applied only if nothing issued after it
// has been applied yet. The read issued last covers every commit this screen
// has heard of, and no older response can displace it. Pure on purpose.

import type { BingoBangoBongoHoleInput } from '@/lib/scoring/modes/types';
import {
  mergeCategory,
  type BingoBangoBongoCategoryKey,
} from './mergeBingoBangoBongoCategory';

export type BbbHolesState = {
  /** The game's hole rows, sorted by hole number. */
  holes: BingoBangoBongoHoleInput[];
  /** Sequence number of the last read or local save applied to `holes`. */
  appliedSeq: number;
};

/**
 * Apply the rows a read returned. A response whose read was issued before the
 * last applied read or save is stale and is dropped: the state comes back as
 * the same reference, so React skips the render.
 */
export function applyBbbRead(
  state: BbbHolesState,
  seq: number,
  rows: BingoBangoBongoHoleInput[],
): BbbHolesState {
  if (seq <= state.appliedSeq) return state;
  return {
    holes: [...rows].sort((a, b) => a.holeNumber - b.holeNumber),
    appliedSeq: seq,
  };
}

/**
 * Merge our own saved category into the rows. Taking a sequence number drops
 * any read that went out before the save committed, so its answer cannot wipe
 * the category we just saved. The read scheduled after the save supersedes the
 * merge.
 */
export function applyBbbLocalSave(
  state: BbbHolesState,
  seq: number,
  holeNumber: number,
  key: BingoBangoBongoCategoryKey,
  userId: string | null,
): BbbHolesState {
  return {
    holes: mergeCategory(state.holes, holeNumber, key, userId),
    appliedSeq: seq,
  };
}
