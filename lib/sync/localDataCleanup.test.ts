import { describe, it, expect, vi } from 'vitest';
import {
  detectOwnerChange,
  ensureLocalDataOwner,
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
