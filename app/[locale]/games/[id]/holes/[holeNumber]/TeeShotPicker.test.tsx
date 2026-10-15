import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { LocalTeeShot } from '@/lib/sync/db';

const rowsMock = vi.fn<() => LocalTeeShot[] | undefined>();
vi.mock('./holeLiveQueries', () => ({ useTeamTeeShots: () => rowsMock() }));
const writeTeeShotMock = vi.fn(async () => ({}));
vi.mock('@/lib/sync/writeTeeShot', () => ({ writeTeeShot: (...args: unknown[]) => writeTeeShotMock(...(args as [])) }));
vi.mock('@/lib/sync/syncWorker', () => ({ drainQueue: vi.fn() }));

import { TeeShotPicker } from './TeeShotPicker';

// One Type C render test (docs/test-discipline.md): the lock near the end
// (`Utslag-forslag-hull-laast`) disables the right names with the right label,
// and a tap reaches the writer. Who can be picked is Type A in teeShots.test.ts.
const MEMBERS = ['Marte', 'Jonas', 'Sigrid', 'Per'].map((name) => ({
  userId: name.toLowerCase(),
  name,
  submittedAt: null,
  withdrawnAt: null,
}));
// Holes 1–15 as on the artboard: Marte 6, Jonas 4, Sigrid 3, Per 2.
const OWNERS = ['sigrid', 'marte', 'marte', 'jonas', 'sigrid', 'marte', 'marte', 'jonas', 'per', 'sigrid', 'marte', 'jonas', 'per', 'jonas', 'marte'];
const ROWS: LocalTeeShot[] = OWNERS.map((owner, i) => ({
  id: `g1:1:${i + 1}`,
  gameId: 'g1',
  teamNumber: 1,
  holeNumber: i + 1,
  teeShotBy: owner,
  enteredBy: 'marte',
  clientUpdatedAt: '2026-10-14T10:00:00.000Z',
  serverUpdatedAt: null,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TeeShotPicker', () => {
  it('locks the names that cannot take hole 16, and a tap on an open one writes it', () => {
    rowsMock.mockReturnValue(ROWS);
    render(
      <TeeShotPicker
        gameId="g1"
        holeNumber={16}
        gameMode="texas_scramble"
        minimum={4}
        teams={[{ teamNumber: 1, members: MEMBERS }]}
        myUserId="sigrid"
        disabled={false}
      />,
    );

    expect(screen.getByTestId('tee-shot-marte')).toBeDisabled();
    expect(screen.getByTestId('tee-shot-marte')).toHaveAccessibleName('Marte, har 6 utslag, kan ikke velges nå');
    expect(screen.getByTestId('tee-shot-jonas')).toBeDisabled();
    expect(screen.getByTestId('tee-shot-sigrid')).toBeEnabled();
    expect(screen.getByTestId('tee-shot-sigrid')).toHaveAccessibleName('Sigrid, 3 av 4 utslag');

    fireEvent.click(screen.getByTestId('tee-shot-sigrid'));
    expect(writeTeeShotMock).toHaveBeenCalledWith({
      gameId: 'g1',
      teamNumber: 1,
      holeNumber: 16,
      teeShotBy: 'sigrid',
      enteredBy: 'sigrid',
    });
  });
});
