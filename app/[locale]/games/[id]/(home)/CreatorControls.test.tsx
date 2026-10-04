import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Type C render-test (#2202): «Start runden nå» is offered to the organiser
// only while the game is scheduled. A draft never starts (#1062).

vi.mock('@/app/[locale]/admin/games/[id]/actions', () => ({
  startScheduledGameAction: vi.fn(),
}));

import { CreatorControls } from './CreatorControls';

describe('CreatorControls', () => {
  it.each([
    ['scheduled', true],
    ['draft', false],
    ['active', false],
  ] as const)('status=%s → start button shown: %s', (status, shown) => {
    render(<CreatorControls gameId="g1" status={status} />);

    expect(screen.queryByTestId('start-scheduled-game') !== null).toBe(shown);
  });
});
