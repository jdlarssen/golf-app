import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Mock } from 'vitest';

// IMPORTANT: mocks must be declared before importing the component under test.
// Dexie and the sync worker are system boundaries; `isBlockingItem` is our own
// logic and stays REAL so the render test proves the wiring, not a stub.
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: vi.fn() }));
vi.mock('@/lib/sync/db', () => ({
  localDb: { syncQueue: { filter: vi.fn() } },
}));
vi.mock('@/lib/sync/syncWorker', () => ({
  drainQueue: vi.fn().mockResolvedValue(undefined),
}));

import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, type SyncQueueItem } from '@/lib/sync/db';
import { SubmitForm } from './SubmitForm';

/**
 * Type C render-test (én per komponent): at «Lever ✓» faktisk låses av et
 * køet slag leveringen kan fryse — og bare av det (#1370). Selve
 * scope-reglene er Type A i `lib/sync/queueScope.test.ts` og re-asserteres
 * ikke her; testen kjører dem gjennom komponenten i stedet for å telle på nytt.
 *
 * `@/i18n/navigation` og `next-intl` er globalt mocket i `vitest.setup.ts`
 * (ekte no.json), så verken router-stub eller provider gjentas her.
 */

const useLiveQueryMock = useLiveQuery as unknown as Mock;
const filterMock = localDb.syncQueue.filter as unknown as Mock;

function qItem(scoreId: string): SyncQueueItem {
  return {
    id: scoreId,
    scoreId,
    attemptCount: 0,
    lastError: null,
    createdAt: '2026-08-14T10:00:00.000Z',
    abandonedAt: null,
  };
}

/**
 * Komponenten spør `syncQueue.filter(pred).count()`. Kjør det ekte
 * predikatet over `items` så tellingen er den samme som Dexie ville gitt.
 */
function setQueue(items: SyncQueueItem[]) {
  filterMock.mockImplementation((pred: (item: SyncQueueItem) => boolean) => ({
    count: () => items.filter(pred).length,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  // useLiveQuery er en gjennomstikker her: kjør spørringen, returner verdien.
  useLiveQueryMock.mockImplementation((querier: () => number) => querier());
});

describe('SubmitForm', () => {
  it('låser «Lever» for et køet slag i denne runden, men ikke for en urelatert runde', () => {
    const props = {
      submitAction: vi.fn(),
      missingHoles: 0,
      blockingGameIds: ['g1'],
    };

    setQueue([qItem('g1:u1:7')]);
    const { rerender } = render(<SubmitForm {...props} />);
    expect(screen.getByTestId('submit-scorecard')).toBeDisabled();

    setQueue([qItem('g2:u1:7')]);
    rerender(<SubmitForm {...props} />);
    expect(screen.getByTestId('submit-scorecard')).toBeEnabled();
  });
});
