import { describe, it, expect, vi } from 'vitest';
import {
  detectOwnerChange,
  drainBeforeDeletion,
  ensureLocalDataOwner,
  finishAccountDeletion,
  OwnerWipeFailedError,
  prepareLogout,
} from './localDataCleanup';

/**
 * #1404 — the decision core for local-data hygiene on shared devices.
 * Dexie-free by design (D4): every dependency is injected, so the rules are
 * testable without an indexedDB shim. The thin browser bindings wire in
 * localStorage + the sync worker and stay untested here (system boundary).
 */

describe('detectOwnerChange', () => {
  it.each([
    [null, 'user-a', 'first'],
    ['user-a', 'user-a', 'same'],
    ['user-a', 'user-b', 'switched'],
  ] as const)('stored=%s, session=%s → %s', (stored, session, expected) => {
    expect(detectOwnerChange(stored, session)).toBe(expected);
  });
});

function ownerDeps(overrides: Partial<Parameters<typeof ensureLocalDataOwner>[0]> = {}) {
  return {
    getSessionUserId: vi.fn(async () => 'user-b' as string | null),
    getStoredOwnerId: vi.fn((): string | null => 'user-a'),
    setStoredOwnerId: vi.fn(),
    clear: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('ensureLocalDataOwner', () => {
  it('no session → touches nothing', async () => {
    const deps = ownerDeps({ getSessionUserId: vi.fn(async () => null) });
    const result = await ensureLocalDataOwner(deps);
    expect(result).toBe('no_session');
    expect(deps.clear).not.toHaveBeenCalled();
    expect(deps.setStoredOwnerId).not.toHaveBeenCalled();
  });

  it('first owner → stamps without clearing', async () => {
    const deps = ownerDeps({ getStoredOwnerId: vi.fn(() => null) });
    const result = await ensureLocalDataOwner(deps);
    expect(result).toBe('first');
    expect(deps.clear).not.toHaveBeenCalled();
    expect(deps.setStoredOwnerId).toHaveBeenCalledWith('user-b');
  });

  it('same owner → no-op', async () => {
    const deps = ownerDeps({
      getSessionUserId: vi.fn(async () => 'user-a' as string | null),
    });
    const result = await ensureLocalDataOwner(deps);
    expect(result).toBe('same');
    expect(deps.clear).not.toHaveBeenCalled();
    expect(deps.setStoredOwnerId).not.toHaveBeenCalled();
  });

  it('switched owner → clears BEFORE stamping the new owner', async () => {
    const order: string[] = [];
    const deps = ownerDeps({
      clear: vi.fn(async () => {
        order.push('clear');
      }),
      setStoredOwnerId: vi.fn(() => {
        order.push('stamp');
      }),
    });
    const result = await ensureLocalDataOwner(deps);
    expect(result).toBe('switched');
    expect(order).toEqual(['clear', 'stamp']);
    expect(deps.setStoredOwnerId).toHaveBeenCalledWith('user-b');
  });

  // #1959: a wipe that throws on a switch is the one failure the caller must
  // NOT shrug off — the previous owner's queue is still on board.
  it('switched owner + throwing wipe → OwnerWipeFailedError, stamp untouched', async () => {
    const cause = new Error('QuotaExceededError');
    const deps = ownerDeps({
      clear: vi.fn(async () => {
        throw cause;
      }),
    });
    const err = await ensureLocalDataOwner(deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OwnerWipeFailedError);
    expect((err as OwnerWipeFailedError).cause).toBe(cause);
    expect(deps.setStoredOwnerId).not.toHaveBeenCalled();
  });

  it('other failures keep their own type (fail-open for the caller)', async () => {
    const deps = ownerDeps({
      getSessionUserId: vi.fn(async () => {
        throw new Error('storage blocked');
      }),
    });
    const err = await ensureLocalDataOwner(deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(OwnerWipeFailedError);
  });

  it.each([
    ['first', null, 'user-b'],
    ['same', 'user-b', 'user-b'],
  ] as const)('%s owner never raises OwnerWipeFailedError', async (_label, stored, session) => {
    const deps = ownerDeps({
      getStoredOwnerId: vi.fn(() => stored),
      getSessionUserId: vi.fn(async () => session as string | null),
      clear: vi.fn(async () => {
        throw new Error('would fail if called');
      }),
    });
    await expect(ensureLocalDataOwner(deps)).resolves.toBe(_label);
    expect(deps.clear).not.toHaveBeenCalled();
  });
});

function logoutDeps(overrides: Partial<Parameters<typeof prepareLogout>[0]> = {}) {
  return {
    drain: vi.fn(async () => {}),
    pendingCount: vi.fn(async () => 0),
    clear: vi.fn(async () => {}),
    clearStoredOwner: vi.fn(),
    ...overrides,
  };
}

describe('prepareLogout', () => {
  it('empty queue after drain → clears data and removes the owner stamp', async () => {
    const deps = logoutDeps();
    const result = await prepareLogout(deps);
    expect(result).toBe('cleared');
    expect(deps.drain).toHaveBeenCalledTimes(1);
    expect(deps.clear).toHaveBeenCalledTimes(1);
    expect(deps.clearStoredOwner).toHaveBeenCalledTimes(1);
  });

  // #1959: the rows on board belong to someone else (the owner guard's wipe
  // failed). Draining them under this session is exactly the RLS-reject →
  // quarantine path the guard exists to prevent; clearing them would lose the
  // previous owner's strokes.
  it('stored owner ≠ session → no drain, no clear, stamp stays, kept', async () => {
    const deps = logoutDeps({ ownerMatches: vi.fn(() => false) });
    const result = await prepareLogout(deps);
    expect(result).toBe('kept');
    expect(deps.drain).not.toHaveBeenCalled();
    expect(deps.pendingCount).not.toHaveBeenCalled();
    expect(deps.clear).not.toHaveBeenCalled();
    expect(deps.clearStoredOwner).not.toHaveBeenCalled();
  });

  it('owner mismatch still runs the push cleanup (it belongs to the session)', async () => {
    const deps = logoutDeps({
      ownerMatches: vi.fn(() => false),
      cleanupPush: vi.fn(async () => {}),
    });
    await expect(prepareLogout(deps)).resolves.toBe('kept');
    expect(deps.cleanupPush).toHaveBeenCalledTimes(1);
  });

  it('owner matches → the normal drain path', async () => {
    const deps = logoutDeps({ ownerMatches: vi.fn(() => true) });
    await expect(prepareLogout(deps)).resolves.toBe('cleared');
    expect(deps.drain).toHaveBeenCalledTimes(1);
  });

  it('queue still holding strokes → keeps data AND the owner stamp', async () => {
    const deps = logoutDeps({ pendingCount: vi.fn(async () => 2) });
    const result = await prepareLogout(deps);
    expect(result).toBe('kept');
    expect(deps.clear).not.toHaveBeenCalled();
    expect(deps.clearStoredOwner).not.toHaveBeenCalled();
  });

  it('drain failure is swallowed — decision falls to the pending count', async () => {
    const deps = logoutDeps({
      drain: vi.fn(async () => {
        throw new Error('offline');
      }),
      pendingCount: vi.fn(async () => 1),
    });
    const result = await prepareLogout(deps);
    expect(result).toBe('kept');
    expect(deps.clear).not.toHaveBeenCalled();
  });

  it('drain failure with an empty queue still clears (nothing to lose)', async () => {
    const deps = logoutDeps({
      drain: vi.fn(async () => {
        throw new Error('flaky');
      }),
    });
    const result = await prepareLogout(deps);
    expect(result).toBe('cleared');
    expect(deps.clear).toHaveBeenCalledTimes(1);
  });

  // #1790 — push cleanup rides along with the logout round: best-effort,
  // never part of the drain decision, but awaited so the POST that follows
  // the caller's return can't kill the server-row delete mid-request.
  it('push cleanup runs once and is awaited before the outcome returns', async () => {
    let settled = false;
    const deps = logoutDeps({
      cleanupPush: vi.fn(async () => {
        await Promise.resolve();
        settled = true;
      }),
    });
    const result = await prepareLogout(deps);
    expect(result).toBe('cleared');
    expect(deps.cleanupPush).toHaveBeenCalledTimes(1);
    expect(settled).toBe(true);
  });

  it('push cleanup rejection is swallowed — the drain decision stands', async () => {
    const deps = logoutDeps({
      cleanupPush: vi.fn(async () => {
        throw new Error('no service worker');
      }),
    });
    await expect(prepareLogout(deps)).resolves.toBe('cleared');
    expect(deps.clear).toHaveBeenCalledTimes(1);
  });

  it('a synchronously throwing push cleanup is swallowed too', async () => {
    const deps = logoutDeps({
      cleanupPush: vi.fn(() => {
        throw new Error('sync boom');
      }),
    });
    await expect(prepareLogout(deps)).resolves.toBe('cleared');
  });

  it('push cleanup failure never blocks the kept path either', async () => {
    const deps = logoutDeps({
      pendingCount: vi.fn(async () => 3),
      cleanupPush: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    await expect(prepareLogout(deps)).resolves.toBe('kept');
    expect(deps.clear).not.toHaveBeenCalled();
  });
});

// #1987 — deleting the account on the web. The server delete has already
// succeeded when this runs; the account can never deliver its queue again.
describe('finishAccountDeletion', () => {
  it('clears the tables, then removes the owner stamp', async () => {
    const calls: string[] = [];
    const deps = {
      clear: vi.fn(async () => {
        calls.push('clear');
      }),
      clearStoredOwner: vi.fn(() => {
        calls.push('clearStoredOwner');
      }),
    };
    const result = await finishAccountDeletion(deps);
    expect(result).toBe('cleared');
    expect(calls).toEqual(['clear', 'clearStoredOwner']);
  });

  it('clear throwing is logged, the stamp is removed anyway, nothing rethrows', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = {
      clear: vi.fn(async () => {
        throw new Error('IndexedDB blocked');
      }),
      clearStoredOwner: vi.fn(),
    };
    const result = await finishAccountDeletion(deps);
    expect(result).toBe('clear_failed');
    expect(deps.clearStoredOwner).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('finishAccountDeletion — #1959 owner mismatch', () => {
  it("stamp names someone else → keeps their rows AND their stamp", async () => {
    const deps = {
      clear: vi.fn(async () => {}),
      clearStoredOwner: vi.fn(),
      ownerMatches: () => false,
    };
    const result = await finishAccountDeletion(deps);
    expect(result).toBe('kept');
    expect(deps.clear).not.toHaveBeenCalled();
    expect(deps.clearStoredOwner).not.toHaveBeenCalled();
  });

  it('stamp matches → clears as usual', async () => {
    const deps = {
      clear: vi.fn(async () => {}),
      clearStoredOwner: vi.fn(),
      ownerMatches: () => true,
    };
    expect(await finishAccountDeletion(deps)).toBe('cleared');
    expect(deps.clear).toHaveBeenCalledTimes(1);
  });
});

describe('drainBeforeDeletion', () => {
  it("stamp names someone else → never drains (their rows, this session)", async () => {
    const drain = vi.fn(async () => {});
    await drainBeforeDeletion(drain, 4_000, () => false);
    expect(drain).not.toHaveBeenCalled();
  });

  it('waits for a drain that finishes in time', async () => {
    const drain = vi.fn(async () => {});
    await expect(drainBeforeDeletion(drain, 4_000)).resolves.toBeUndefined();
    expect(drain).toHaveBeenCalledTimes(1);
  });

  it('swallows a drain that throws', async () => {
    const drain = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(drainBeforeDeletion(drain, 4_000)).resolves.toBeUndefined();
  });

  it('resolves at the timeout when the drain hangs', async () => {
    vi.useFakeTimers();
    try {
      const drain = vi.fn(() => new Promise<void>(() => {}));
      let settled = false;
      const pending = drainBeforeDeletion(drain, 4_000).then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(3_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
