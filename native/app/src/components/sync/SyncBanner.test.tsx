// native/app/src/components/sync/SyncBanner.test.tsx
// Native #1980: den ene render-testen (Type C) for appens SyncBanner.
//
// Copyen er låst mot webben i `lib/syncBannerCopy.test.ts`, og grupperingen per
// hull er webbens egen `summarizeQuarantine`. Det som blir igjen her er
// koblingen: at karantene-radene fra basen blir til et varsel med hullnumrene,
// at «Fjern varselet» spør FØR noe slettes, og at bare de strandede radene
// slettes. Komponenten har ingen staging-gate — det er hele poenget.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ConflictRecord, SyncQueueItem } from '../../data/db';
import { SyncBanner } from './SyncBanner';

const GAME = 'game-1';
const OTHER = 'game-2';
const ME = 'user-me';

const mockState: { queue: SyncQueueItem[]; conflicts: ConflictRecord[] } = {
  queue: [],
  conflicts: [],
};

jest.mock('../../data/db', () => ({
  getDb: jest.fn(async () => ({})),
  listQueue: jest.fn(async () => mockState.queue),
  listConflictsForGame: jest.fn(async () => mockState.conflicts),
  deleteQueueItem: jest.fn(async (_db: unknown, id: string) => {
    mockState.queue = mockState.queue.filter((i) => i.id !== id);
  }),
  deleteConflict: jest.fn(async (_db: unknown, id: string) => {
    mockState.conflicts = mockState.conflicts.filter((c) => c.id !== id);
  }),
}));
jest.mock('../../data/syncWorker', () => ({ drainQueue: jest.fn(async () => undefined) }));

const { deleteQueueItem, deleteConflict } = require('../../data/db') as {
  deleteQueueItem: jest.Mock;
  deleteConflict: jest.Mock;
};
const { drainQueue } = require('../../data/syncWorker') as { drainQueue: jest.Mock };

function item(id: string, gameId: string, hole: number, abandoned: boolean): SyncQueueItem {
  return {
    id,
    scoreId: `${gameId}:${ME}:${hole}`,
    attemptCount: abandoned ? 5 : 1,
    lastError: abandoned ? 'new row violates row-level security policy' : 'Network request failed',
    createdAt: '2026-09-21T10:00:00.000Z',
    abandonedAt: abandoned ? '2026-09-21T10:05:00.000Z' : null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.queue = [];
  mockState.conflicts = [];
});

describe('SyncBanner', () => {
  it('tegner ingenting når køen er tom og ingen konflikter finnes', async () => {
    await render(<SyncBanner gameId={GAME} />);
    await waitFor(() => expect(require('../../data/db').listQueue).toHaveBeenCalled());
    expect(screen.queryByTestId('sync-banner')).toBeNull();
  });

  it('navngir de strandede hullene, viser feilen og spør før varselet fjernes', async () => {
    mockState.queue = [
      item('q3', GAME, 3, true),
      item('q7', GAME, 7, true),
      item('q9', OTHER, 9, true),
      item('q5', GAME, 5, false),
    ];
    let confirm: (() => void) | undefined;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      confirm = buttons?.find((b) => b.style === 'destructive')?.onPress as () => void;
    });

    await render(<SyncBanner gameId={GAME} />);

    await waitFor(() =>
      expect(screen.getByTestId('quarantine-holes')).toHaveTextContent(
        'Hull 3 og 7 ble ikke lagret.',
      ),
    );
    expect(screen.getByText('Ett slag fra en annen runde ble ikke lagret.')).toBeTruthy();
    expect(screen.getByText('new row violates row-level security policy')).toBeTruthy();

    // «Prøv igjen» finnes fordi hull 5 fortsatt prøver.
    await fireEvent.press(screen.getByTestId('quarantine-retry'));
    expect(drainQueue).toHaveBeenCalled();

    // Første trykk spør bare — ingenting slettes før svaret.
    await fireEvent.press(screen.getByTestId('quarantine-dismiss'));
    expect(alert).toHaveBeenCalledWith(
      'Fjern varselet',
      'Vil du fjerne varselet? Slagene er ikke sendt til arrangøren. Tallene blir bare stående på denne telefonen.',
      expect.any(Array),
    );
    expect(deleteQueueItem).not.toHaveBeenCalled();

    confirm!();
    await waitFor(() => expect(screen.queryByTestId('quarantine-banner')).toBeNull());
    // Bare karantene-radene — hull 5 prøver fortsatt og blir liggende.
    expect(deleteQueueItem.mock.calls.map((c) => c[1]).sort()).toEqual(['q3', 'q7', 'q9']);
    expect(mockState.queue.map((i) => i.id)).toEqual(['q5']);
    alert.mockRestore();
  });

  it('viser konfliktvarselet og lar spilleren avvise det', async () => {
    mockState.conflicts = [
      {
        id: 'k1',
        gameId: GAME,
        userId: ME,
        holeNumber: 4,
        localStrokes: 5,
        serverStrokes: 4,
        resolvedAt: '2026-09-21T10:00:00.000Z',
        forOwnScore: true,
      },
    ];

    await render(<SyncBanner gameId={GAME} />);

    await waitFor(() =>
      expect(
        screen.getByText('Hull 4 ble endret av en medspiller. Det nyeste tallet gjelder nå.'),
      ).toBeTruthy(),
    );
    await fireEvent.press(screen.getByTestId('conflict-dismiss'));
    expect(deleteConflict).toHaveBeenCalledWith({}, 'k1');
    await waitFor(() => expect(screen.queryByTestId('sync-banner')).toBeNull());
  });
});
