/**
 * Drift-guard: asserts that STATUS_LABELS matches the gameStatus namespace in
 * messages/no.json byte-for-byte. If someone updates STATUS_LABELS without
 * updating the catalog (or vice versa), this test fails immediately.
 *
 * These constants stay in lib/ for unmigrated surfaces (admin, wizard) — the
 * catalog keys are used by core-loop components that call t('gameStatus.X').
 */
import { describe, it, expect } from 'vitest';
import { STATUS_LABELS, type GameStatus } from './status';
import noMessages from '@/messages/no.json';

const STATUSES: GameStatus[] = ['draft', 'scheduled', 'active', 'finished'];

describe('gameStatus catalog drift-guard', () => {
  it.each(STATUSES)(
    'STATUS_LABELS[%s] === no.json gameStatus.%s',
    (status) => {
      expect(STATUS_LABELS[status]).toBe(noMessages.gameStatus[status]);
    },
  );
});
