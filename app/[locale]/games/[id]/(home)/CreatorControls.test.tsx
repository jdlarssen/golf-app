import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Type C render-test (#2202): «Start runden nå» is offered to the organiser
// only while the game is scheduled. A draft never starts (#1062). #2269: a
// draft's «Rediger» resumes the wizard on «Klar?» (`?step=5`), like admin's.
// #2480: «Flytt runden» only on a scheduled game.

vi.mock('@/app/[locale]/admin/games/[id]/actions', () => ({
  startScheduledGameAction: vi.fn(),
}));

import { CreatorControls } from './CreatorControls';

describe('CreatorControls', () => {
  it.each([
    ['scheduled', true, '/games/g1/rediger', '/games/g1/flytt'],
    ['draft', false, '/games/g1/rediger?step=5', null],
    ['active', false, null, null],
    ['finished', false, null, null],
  ] as const)(
    'status=%s → start button shown: %s, edit link %s, move link %s',
    (status, shown, editHref, moveHref) => {
      render(<CreatorControls gameId="g1" status={status} hasTeeOff />);

      expect(screen.queryByTestId('start-scheduled-game') !== null).toBe(shown);
      expect(screen.queryByTestId('creator-edit-link')?.getAttribute('href') ?? null).toBe(editHref);
      expect(screen.queryByTestId('creator-move-link')?.getAttribute('href') ?? null).toBe(moveHref);
    },
  );

  it('#2480: a scheduled game without a tee-off has nothing to move, so no move link', () => {
    render(<CreatorControls gameId="g1" status="scheduled" hasTeeOff={false} />);
    expect(screen.queryByTestId('creator-move-link')).toBeNull();
  });
});
