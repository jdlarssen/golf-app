import { Component, type ReactNode } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks before the component import. The cleanup module is imported lazily by
// the component; vi.mock covers dynamic imports too.
const calls: string[] = [];
const deleteOwnAccount = vi.fn();
const replace = vi.fn((href: string) => {
  calls.push(`replace:${href}`);
});
const drainBeforeDeletionBrowser = vi.fn(async () => {
  calls.push('drain');
});
const finishAccountDeletionBrowser = vi.fn(async () => {
  calls.push('cleanup');
  return 'cleared' as const;
});

vi.mock('@/app/[locale]/profile/slett-konto/actions', () => ({
  deleteOwnAccount: () => deleteOwnAccount(),
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace }),
}));
vi.mock('@/lib/sync/localDataCleanup', () => ({
  drainBeforeDeletionBrowser: () => drainBeforeDeletionBrowser(),
  finishAccountDeletionBrowser: () => finishAccountDeletionBrowser(),
}));

import { DeleteAccountForm } from './DeleteAccountForm';

/**
 * Type C (#1987): the local base is wiped ONLY after the server confirmed the
 * delete, and never on a blocked/failed one. The cleanup rules themselves are
 * Type A in `lib/sync/localDataCleanup.test.ts`.
 */

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p>boundary</p> : this.props.children;
  }
}

function renderForm() {
  return render(
    <Boundary>
      <DeleteAccountForm label="Slett kontoen min for alltid" pendingLabel="Sletter …" />
    </Boundary>,
  );
}

// Submits the form itself: once pending, the button is disabled and relabelled,
// so a click would not reach the re-entrancy guard under test.
function submit() {
  fireEvent.submit(screen.getByRole('button').closest('form')!);
}

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe('DeleteAccountForm', () => {
  it('success → drain, delete, THEN wipe, THEN navigate to login', async () => {
    deleteOwnAccount.mockImplementation(async () => {
      calls.push('delete');
      return { ok: true };
    });
    renderForm();
    expect(screen.getByRole('button', { name: 'Slett kontoen min for alltid' })).toBeTruthy();
    submit();
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(calls).toEqual([
      'drain',
      'delete',
      'cleanup',
      'replace:/login?melding=konto_slettet',
    ]);
    expect(finishAccountDeletionBrowser).toHaveBeenCalledTimes(1);
  });

  it('blocked/failed delete (server redirect, no ok) → never wipes, never navigates', async () => {
    deleteOwnAccount.mockImplementation(async () => {
      calls.push('delete');
      return undefined;
    });
    renderForm();
    submit();
    await waitFor(() => expect(calls).toContain('delete'));
    // Let the transition settle before asserting absence.
    await act(async () => {});
    expect(finishAccountDeletionBrowser).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('action throws → never wipes', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    deleteOwnAccount.mockImplementation(async () => {
      calls.push('delete');
      throw new Error('network down');
    });
    renderForm();
    submit();
    await waitFor(() => expect(calls).toContain('delete'));
    await act(async () => {});
    expect(finishAccountDeletionBrowser).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('double tap while pending → the action runs once', async () => {
    let release: (v: { ok: true }) => void = () => {};
    deleteOwnAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          calls.push('delete');
          release = resolve;
        }),
    );
    renderForm();
    submit();
    submit();
    await waitFor(() => expect(calls).toContain('delete'));
    submit();
    await act(async () => release({ ok: true }));
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(deleteOwnAccount).toHaveBeenCalledTimes(1);
    expect(finishAccountDeletionBrowser).toHaveBeenCalledTimes(1);
  });
});
