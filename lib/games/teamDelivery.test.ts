import { describe, it, expect } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import { deliveryCoversWholeTeam } from './teamDelivery';

// Type A (#1453, #2200): in which formats one delivery marks the whole team.
// The delivery core's team cascade and the delivery-reminder sweep ask the
// same predicate, so a reminder never goes to someone who cannot deliver.
describe('deliveryCoversWholeTeam', () => {
  it.each([
    ['texas_scramble', true],
    ['florida_scramble', true],
    ['ambrose', true],
    ['greensome_matchplay', true],
    ['foursomes_matchplay', true],
    // Patsome switches between own ball and a shared ball; each player delivers.
    ['patsome', false],
    ['best_ball', false],
    ['stableford', false],
  ] as [GameMode, boolean][])('%s → %s', (mode, expected) => {
    expect(deliveryCoversWholeTeam(mode)).toBe(expected);
  });
});
