import { describe, it, expect } from 'vitest';
import { formatCapturesPutts } from './types';
import type { GameMode } from './types';

/**
 * Type-A: putt-fangst-scope (#939). `formatCapturesPutts` styrer hvor putts-
 * feltet og putte-snittet vises. In-scope = individuelle slag-/stableford-format
 * der spilleren har egen ball og fører egen score per hull. Eier-valg 2026-06-29
 * («individuelle slag/stableford», ikke «alle»).
 */

// Hele GameMode-unionen, eksplisitt listet så testen fanger en ny mode som
// glemmes (den må legges til her OG i predikatet — ellers feiler en av testene).
const ALL_MODES: GameMode[] = [
  'best_ball',
  'stableford',
  'modified_stableford',
  'singles_matchplay',
  'solo_strokeplay',
  'texas_scramble',
  'ambrose',
  'florida_scramble',
  'fourball_matchplay',
  'foursomes_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'wolf',
  'nassau',
  'skins',
  'bingo_bango_bongo',
  'nines',
  'round_robin',
  'acey_deucey',
  'shamble',
  'patsome',
  'gruesome_matchplay',
];

const IN_SCOPE: GameMode[] = ['solo_strokeplay', 'stableford', 'modified_stableford'];

describe('formatCapturesPutts', () => {
  it.each(IN_SCOPE)('returns true for individual stroke/stableford format: %s', (mode) => {
    expect(formatCapturesPutts(mode)).toBe(true);
  });

  it.each(ALL_MODES.filter((m) => !IN_SCOPE.includes(m)))(
    'returns false for out-of-scope format: %s',
    (mode) => {
      expect(formatCapturesPutts(mode)).toBe(false);
    },
  );

  it('classifies every GameMode (exhaustive — no mode left unhandled)', () => {
    for (const mode of ALL_MODES) {
      expect(typeof formatCapturesPutts(mode)).toBe('boolean');
    }
  });

  it('exactly three formats are in scope for v1', () => {
    const captured = ALL_MODES.filter((m) => formatCapturesPutts(m));
    expect(captured.sort()).toEqual([...IN_SCOPE].sort());
  });
});
