// Keep a hole screen's per-hole rows converging on the database (#1950, #2092).
//
// Supabase Realtime does not promise delivery order per subscriber, so a
// change payload applied as the full row can put an older commit on screen
// after a newer one. A hole screen therefore treats every event as a signal
// to re-read the game's rows. Each read and each local save takes a sequence
// number when it is issued; a read is applied only if nothing issued after it
// has been applied yet. The read issued last covers every commit this screen
// has heard of, and no older response can displace it. Pure on purpose.
//
// The one home for that rule: Bingo Bango Bongo
// (`lib/bbb/reconcileBingoBangoBongoHoles.ts`) and Wolf
// (`lib/wolf/reconcileWolfChoices.ts`) only say what a local save changes.

export type HoleRow = { holeNumber: number };

export type SequencedHoleRows<T extends HoleRow> = {
  /** The game's hole rows, sorted by hole number. */
  holes: T[];
  /** Sequence number of the last read or local save applied to `holes`. */
  appliedSeq: number;
};

function byHole<T extends HoleRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.holeNumber - b.holeNumber);
}

/**
 * Apply the rows a read returned. A response whose read was issued before the
 * last applied read or save is stale and is dropped: the state comes back as
 * the same reference, so React skips the render.
 */
export function applySequencedRead<T extends HoleRow>(
  state: SequencedHoleRows<T>,
  seq: number,
  rows: T[],
): SequencedHoleRows<T> {
  if (seq <= state.appliedSeq) return state;
  return { holes: byHole(rows), appliedSeq: seq };
}

/**
 * Apply our own save. Taking a sequence number drops any read that went out
 * before the save committed, so its answer cannot wipe what we just saved.
 * The read scheduled after the save supersedes it.
 */
export function applySequencedLocalSave<T extends HoleRow>(
  seq: number,
  holes: T[],
): SequencedHoleRows<T> {
  return { holes: byHole(holes), appliedSeq: seq };
}
