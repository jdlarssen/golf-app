import { describe, expect, it } from 'vitest';
import { deliveryReceipt } from './receipt';

// Type A: which receipt the game home shows after «Lever».
describe('deliveryReceipt', () => {
  it.each([
    ['my own card only', { alsoDelivered: 0 }, 0, 'submitted'],
    ['every flightmate card delivered (#2200)', { alsoDelivered: 2 }, 2, 'submitted'],
    ['fewer flightmate cards than asked (#2200)', { alsoDelivered: 1 }, 2, 'submitted_partial'],
    ['a simulator league, alone', { alsoDelivered: 0, handedOver: 0 }, 0, 'submitted'],
    ['a simulator league, every kept card handed over (#2814)', { alsoDelivered: 0, handedOver: 1 }, 1, 'submitted_handed_over'],
    ['a simulator league, fewer handed over than asked (#2814)', { alsoDelivered: 0, handedOver: 0 }, 1, 'submitted_partial'],
  ] as const)('%s → %s', (_label, result, asked, receipt) => {
    expect(deliveryReceipt(result, asked)).toBe(receipt);
  });
});
