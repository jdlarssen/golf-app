import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Type C render-test (#2202): «Start runden nå» is offered to the organiser
// only while the game is scheduled. A draft never starts (#1062). #2269: a
// draft's «Rediger» resumes the wizard on «Klar?» (`?step=5`), like admin's.

vi.mock('@/app/[locale]/admin/games/[id]/actions', () => ({
  startScheduledGameAction: vi.fn(),
}));

import { CreatorControls } from './CreatorControls';

describe('CreatorControls', () => {
  it.each([
    ['scheduled', true, '/games/g1/rediger'],
    ['draft', false, '/games/g1/rediger?step=5'],
    ['active', false, null],
  ] as const)('status=%s → start button shown: %s, edit link %s', (status, shown, editHref) => {
    render(<CreatorControls gameId="g1" status={status} />);

    expect(screen.queryByTestId('start-scheduled-game') !== null).toBe(shown);
    expect(screen.queryByTestId('creator-edit-link')?.getAttribute('href') ?? null).toBe(editHref);
  });
});
