import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Mock } from 'vitest';

// IMPORTANT: mocks must be declared before importing the component under test.
// Dexie and the sync worker are system boundaries; `isBlockingItem` is our own
// logic and stays REAL so the render test proves the wiring, not a stub.
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: vi.fn() }));
vi.mock('@/lib/sync/db', () => ({
  localDb: { syncQueue: { filter: vi.fn() }, teeShotQueue: { filter: vi.fn() } },
}));
vi.mock('@/lib/sync/syncWorker', () => ({
  drainQueue: vi.fn().mockResolvedValue(undefined),
}));

import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, type SyncQueueItem } from '@/lib/sync/db';
import { SubmitForm } from './SubmitForm';

/**
 * Type C render-test (én per komponent): at «Lever ✓» faktisk låses av et
 * køet slag leveringen kan fryse — og bare av det (#1370) — og av en kø som
 * ikke er lest ennå (#2219: `useLiveQuery` gir `undefined` fram til Dexie har
 * svart, også i serverens HTML). Selve
 * scope-reglene er Type A i `lib/sync/queueScope.test.ts` og re-asserteres
 * ikke her; testen kjører dem gjennom komponenten i stedet for å telle på nytt.
 *
 * `@/i18n/navigation` og `next-intl` er globalt mocket i `vitest.setup.ts`
 * (ekte no.json), så verken router-stub eller provider gjentas her.
 */

const useLiveQueryMock = useLiveQuery as unknown as Mock;
const filterMock = localDb.syncQueue.filter as unknown as Mock;
const teeShotFilterMock = localDb.teeShotQueue.filter as unknown as Mock;

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
function setQueue(items: SyncQueueItem[], teeShots: SyncQueueItem[] = []) {
  filterMock.mockImplementation((pred: (item: SyncQueueItem) => boolean) => ({
    count: () => items.filter(pred).length,
  }));
  // #2580: the tee-shot queue is asked the same way.
  teeShotFilterMock.mockImplementation((pred: (item: SyncQueueItem) => boolean) => ({
    count: () => teeShots.filter(pred).length,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  // useLiveQuery er en gjennomstikker her: kjør spørringen, returner verdien.
  useLiveQueryMock.mockImplementation((querier: () => number) => querier());
});

describe('SubmitForm', () => {
  it('låser «Lever» til køen er lest, og for et køet slag i denne runden, men ikke for en urelatert runde', () => {
    const props = {
      submitAction: vi.fn(),
      missingHoles: 0,
      blockingGameIds: ['g1'],
    };

    // #2219: Dexie har ikke svart ennå (første render, og serverens HTML).
    useLiveQueryMock.mockImplementation(() => undefined);
    const { rerender } = render(<SubmitForm {...props} />);
    expect(screen.getByTestId('submit-scorecard')).toBeDisabled();

    useLiveQueryMock.mockImplementation((querier: () => number) => querier());
    setQueue([qItem('g1:u1:7')]);
    rerender(<SubmitForm {...props} />);
    expect(screen.getByTestId('submit-scorecard')).toBeDisabled();

    setQueue([qItem('g2:u1:7')]);
    rerender(<SubmitForm {...props} />);
    expect(screen.getByTestId('submit-scorecard')).toBeEnabled();

    // #2580: a tee shot for this round still in its queue locks it too.
    setQueue([], [qItem('g1:1:7')]);
    rerender(<SubmitForm {...props} />);
    expect(screen.getByTestId('submit-scorecard')).toBeDisabled();

    // #2580: someone lacks tee shots — the button stays focusable, is
    // described by the box, and a tap moves focus there instead of delivering.
    setQueue([]);
    rerender(
      <>
        <div id="tee-shot-short" tabIndex={-1} data-testid="box" />
        <SubmitForm {...props} teeShotBlocked />
      </>,
    );
    const locked = screen.getByTestId('submit-scorecard');
    expect(locked).toBeEnabled();
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(locked).toHaveAttribute('aria-describedby', 'tee-shot-short');
    fireEvent.click(locked);
    expect(screen.getByTestId('box')).toHaveFocus();
    expect(props.submitAction).not.toHaveBeenCalled();
  });
});
