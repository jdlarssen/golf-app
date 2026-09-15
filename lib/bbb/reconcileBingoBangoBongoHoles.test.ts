import { describe, it, expect } from 'vitest';
import type { BingoBangoBongoHoleInput } from '@/lib/scoring/modes/types';
import {
  applyBbbLocalSave,
  applyBbbRead,
  type BbbHolesState,
} from './reconcileBingoBangoBongoHoles';

function hole(
  holeNumber: number,
  bingoUserId: string | null,
  bangoUserId: string | null,
  bongoUserId: string | null,
): BingoBangoBongoHoleInput {
  return { holeNumber, bingoUserId, bangoUserId, bongoUserId };
}

const EMPTY: BbbHolesState = { holes: [], appliedSeq: 0 };

describe('reconcileBingoBangoBongoHoles', () => {
  // #1950 staging, hole 10: this screen saved bango 'B' while a flight-mate
  // saved bingo 'A'. Realtime delivered the flight-mate's UPDATE before the
  // older INSERT, and the INSERT row stayed on screen. Events now only trigger
  // reads, so what matters is that the reads converge in any answer order.
  it.each<[string, number[]]>([
    ['in issue order', [2, 3]],
    ['newest first (the older read is dropped)', [3, 2]],
    ['newest twice', [3, 3]],
    ['older twice, then newest', [2, 2, 3]],
  ])(
    '#1950 staging hole 10: reads converge on the committed row when they answer %s',
    (_label, answerOrder) => {
      const afterSave = applyBbbLocalSave(EMPTY, 1, 10, 'bangoUserId', 'B');
      const responses: Record<number, BingoBangoBongoHoleInput[]> = {
        // Issued before the flight-mate's commit.
        2: [hole(10, null, 'B', null)],
        // Issued after both commits.
        3: [hole(10, 'A', 'B', null)],
      };

      const final = answerOrder.reduce(
        (state, seq) => applyBbbRead(state, seq, responses[seq]!),
        afterSave,
      );

      expect(final.holes).toEqual([hole(10, 'A', 'B', null)]);
      expect(final.appliedSeq).toBe(3);
    },
  );

  it('ignores a read issued before our own save that answers after it', () => {
    // Read seq 1 goes out, our save lands as seq 2, then read 1 answers with
    // the row as it stood before our commit.
    const afterSave = applyBbbLocalSave(EMPTY, 2, 10, 'bangoUserId', 'B');

    expect(applyBbbRead(afterSave, 1, [])).toBe(afterSave);
  });

  it('lets a read issued after our save replace the local merge', () => {
    // Same-category contention: we saved bingo 'A', a flight-mate's later
    // bingo 'C' is what the database holds.
    const afterRead = applyBbbRead(EMPTY, 1, [hole(10, null, 'B', null)]);
    const afterSave = applyBbbLocalSave(afterRead, 2, 10, 'bingoUserId', 'A');

    const final = applyBbbRead(afterSave, 3, [hole(10, 'C', 'B', null)]);

    expect(final.holes).toEqual([hole(10, 'C', 'B', null)]);
    expect(final.appliedSeq).toBe(3);
  });

  it('treats duplicate delivery of the same response as a no-op', () => {
    const once = applyBbbRead(EMPTY, 3, [hole(10, 'A', 'B', null)]);

    expect(applyBbbRead(once, 3, [hole(10, 'A', 'B', null)])).toBe(once);
  });
});
