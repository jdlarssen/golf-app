import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';

/**
 * Type C — the single render test for `GlobalSyncBanner` (#1697).
 *
 * It locks ORDER, not markup: the owner guard must resolve before the banner
 * is allowed to mount, or a shared phone shows the previous user's stranded
 * strokes on Hjem. `next/dynamic` is stubbed synchronously on purpose — the
 * real one mounts asynchronously too, which would make "no banner yet" true
 * even without the gate and turn this test into a false green.
 */
const { guard, SyncBannerStub } = vi.hoisted(() => {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    guard: { promise, release: () => release() },
    SyncBannerStub: function SyncBannerStub() {
      return <div data-testid="sync-banner" />;
    },
  };
});

vi.mock('next/dynamic', () => ({
  default: (() => SyncBannerStub) as unknown as typeof import('next/dynamic').default,
}));

vi.mock('@/lib/sync/localDataCleanup', () => ({
  ensureLocalDataOwnerBrowser: () => guard.promise,
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
});
