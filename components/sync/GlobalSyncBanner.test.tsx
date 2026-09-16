import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

/**
 * Type C — the single render test for `GlobalSyncBanner` (#1697).
 *
 * It locks ORDER, not markup: the owner guard must resolve before the banner
 * is allowed to mount, or a shared phone shows the previous user's stranded
 * strokes on Hjem. `next/dynamic` is stubbed synchronously on purpose — the
 * real one mounts asynchronously too, which would make "no banner yet" true
 * even without the gate and turn this test into a false green.
 */
const { guard, SyncBannerStub, OwnerWipeFailedError } = vi.hoisted(() => {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  class OwnerWipeFailedError extends Error {}
  return {
    guard: { promise, release: () => release(), next: null as null | (() => Promise<void>) },
    OwnerWipeFailedError,
    SyncBannerStub: function SyncBannerStub() {
      return <div data-testid="sync-banner" />;
    },
  };
});

vi.mock('next/dynamic', () => ({
  default: (() => SyncBannerStub) as unknown as typeof import('next/dynamic').default,
}));

vi.mock('@/lib/sync/localDataCleanup', () => ({
  ensureLocalDataOwnerBrowser: () => (guard.next ? guard.next() : guard.promise),
  OwnerWipeFailedError,
}));

import { GlobalSyncBanner } from './GlobalSyncBanner';

describe('GlobalSyncBanner', () => {
  it('holder banneret tilbake til eier-vakten har kjørt', async () => {
    render(<GlobalSyncBanner />);

    // Vakten er fortsatt underveis: ingenting rendres, så en ny bruker rekker
    // aldri å se forrige brukers kø.
    expect(screen.queryByTestId('sync-banner')).toBeNull();

    await act(async () => {
      guard.release();
      await guard.promise;
    });

    expect(await screen.findByTestId('sync-banner')).toBeInTheDocument();
  });

  // #1959: the wipe failed on an owner switch — the queue on board is the
  // previous user's, so the banner stays hidden (the #1697 leak).
  it('holder banneret skjult når wipen feilet ved eierbytte', async () => {
    let settled = false;
    guard.next = async () => {
      settled = true;
      throw new OwnerWipeFailedError('wipe');
    };
    render(<GlobalSyncBanner />);
    await waitFor(() => expect(settled).toBe(true));
    // Let the rejection handler run before asserting the absence.
    await act(async () => {});
    expect(screen.queryByTestId('sync-banner')).toBeNull();
    guard.next = null;
  });

  it('viser banneret når vakten feiler av en annen grunn (fail-open)', async () => {
    guard.next = async () => {
      throw new Error('localStorage blocked');
    };
    render(<GlobalSyncBanner />);
    expect(await screen.findByTestId('sync-banner')).toBeInTheDocument();
    guard.next = null;
  });
});
