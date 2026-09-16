import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Type C — the single render test for `SyncBoot` (#1959).
 *
 * The owner guard decides whether the sync engine may start. A failed wipe on
 * an owner switch (`OwnerWipeFailedError`) is the one fail-CLOSED case: no
 * engine, a notice with «Prøv igjen», and the engine starts once a retry
 * succeeds. Every other guard failure stays fail-open (regression lock).
 */
const { guardMock, startSyncListener, OwnerWipeFailedError } = vi.hoisted(() => {
  class OwnerWipeFailedError extends Error {}
  return {
    guardMock: vi.fn<() => Promise<void>>(),
    startSyncListener: vi.fn(),
    OwnerWipeFailedError,
  };
});

vi.mock('@/lib/sync/localDataCleanup', () => ({
  ensureLocalDataOwnerBrowser: guardMock,
  OwnerWipeFailedError,
}));
vi.mock('@/lib/sync/syncWorker', () => ({ startSyncListener }));

import { SyncBoot } from './SyncBoot';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SyncBoot', () => {
  it('holder motoren av og viser varselet når wipen feilet ved eierbytte; «Prøv igjen» starter motoren', async () => {
    guardMock.mockRejectedValueOnce(new OwnerWipeFailedError('wipe'));
    render(<SyncBoot />);

    expect(await screen.findByTestId('owner-wipe-failed')).toBeInTheDocument();
    expect(startSyncListener).not.toHaveBeenCalled();

    // Andre forsøk feiler også: varselet står, motoren er fortsatt av.
    guardMock.mockRejectedValueOnce(new OwnerWipeFailedError('wipe'));
    fireEvent.click(screen.getByRole('button', { name: 'Prøv igjen' }));
    await waitFor(() => expect(guardMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Prøv igjen' })).toBeEnabled(),
    );
    expect(screen.getByTestId('owner-wipe-failed')).toBeInTheDocument();
    expect(startSyncListener).not.toHaveBeenCalled();

    // Tredje lykkes: varselet forsvinner og motoren starter.
    guardMock.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Prøv igjen' }));
    await waitFor(() => expect(startSyncListener).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('owner-wipe-failed')).toBeNull();
  });

  it('starter motoren uten varsel når vakten feiler av en annen grunn (fail-open)', async () => {
    guardMock.mockRejectedValueOnce(new Error('localStorage blocked'));
    render(<SyncBoot />);

    await waitFor(() => expect(startSyncListener).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('owner-wipe-failed')).toBeNull();
  });

  it('starter motoren når vakten lykkes', async () => {
    guardMock.mockResolvedValueOnce(undefined);
    render(<SyncBoot />);

    await waitFor(() => expect(startSyncListener).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('owner-wipe-failed')).toBeNull();
  });
});
