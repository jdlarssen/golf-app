import { describe, it, expect } from 'vitest';
import type { WolfHoleChoice } from '@/lib/scoring/modes/types';
import {
  applyWolfLocalSave,
  applyWolfRead,
  type WolfChoicesState,
} from './reconcileWolfChoices';

function lone(holeNumber: number): WolfHoleChoice {
  return { holeNumber, wolfUserId: 'W', choice: 'lone', partnerUserId: null };
}

function partner(holeNumber: number, partnerUserId: string): WolfHoleChoice {
  return { holeNumber, wolfUserId: 'W', choice: 'partner', partnerUserId };
}

const EMPTY: WolfChoicesState = { holes: [], appliedSeq: 0 };

describe('reconcileWolfChoices', () => {
  // #2092: the wolf changed hole 5 from partner 'P' to lone. The screen used to
  // apply each realtime payload as the row, in arrival order, so an INSERT
  // delivered after the newer UPDATE left the older choice on the badge.
  // Events now only trigger reads; the reads converge in any answer order.
  it.each<[string, number[]]>([
    ['in issue order', [1, 2]],
    ['newest first (the older read is dropped)', [2, 1]],
    ['newest twice', [2, 2]],
  ])(
    '#2092: reads converge on the latest choice when they answer %s',
    (_label, answerOrder) => {
      const responses: Record<number, WolfHoleChoice[]> = {
        // Issued before the wolf changed their mind.
        1: [partner(5, 'P')],
        // Issued after both commits.
        2: [lone(5)],
      };

      const final = answerOrder.reduce(
        (state, seq) => applyWolfRead(state, seq, responses[seq]!),
        EMPTY,
      );

      expect(final.holes).toEqual([lone(5)]);
      expect(final.appliedSeq).toBe(2);
    },
  );

  it('keeps the same reference when an older read answers after a newer one', () => {
    const afterNewer = applyWolfRead(EMPTY, 2, [lone(5)]);

    expect(applyWolfRead(afterNewer, 1, [partner(5, 'P')])).toBe(afterNewer);
  });

  it('ignores a read issued before our own save that answers after it', () => {
    const afterRead = applyWolfRead(EMPTY, 1, [lone(4)]);
    const afterSave = applyWolfLocalSave(afterRead, 3, partner(5, 'P'));

    // The save replaces only its own hole and keeps the list sorted.
    expect(afterSave.holes).toEqual([lone(4), partner(5, 'P')]);
    // Read 2 went out before the save committed.
    expect(applyWolfRead(afterSave, 2, [lone(4)])).toBe(afterSave);
  });

  it('lets a read issued after our save replace the local choice', () => {
    const afterSave = applyWolfLocalSave(EMPTY, 1, partner(5, 'P'));

    // The database holds a later change (another device, or an admin fix).
    const final = applyWolfRead(afterSave, 2, [lone(5)]);

    expect(final.holes).toEqual([lone(5)]);
    expect(final.appliedSeq).toBe(2);
  });
});
