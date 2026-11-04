// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Type A (#2759): the wiring the app's route depends on. The web's cases
 * (`innboks/actions.test.ts`) run through this function too; here it is the
 * caller's client that must reach the core and the archive, since a route has
 * no cookies.
 */

const archiveMock = vi.fn(async (_opts: unknown) => true);
vi.mock('./archive', () => ({
  archiveNotifications: (opts: unknown) => archiveMock(opts),
}));
const markReadMock = vi.fn(async (_opts: unknown) => true);
vi.mock('./markRead', () => ({
  markNotificationsRead: (opts: unknown) => markReadMock(opts),
}));

const loadMock = vi.fn();
const approveMock = vi.fn();
const rejectMock = vi.fn();
vi.mock('@/lib/games/registrationDecisionCore', () => ({
  loadRegistrationDecision: (...args: unknown[]) => loadMock(...args),
  approveRegistrationCore: (...args: unknown[]) => approveMock(...args),
  rejectRegistrationCore: (...args: unknown[]) => rejectMock(...args),
}));

import { decideFromInbox } from './decideFromInbox';

const client = { marker: 'kallerens klient' } as unknown as SupabaseClient<Database>;
const CTX = { request: {}, game: { id: 'g' }, actorId: 'u' };
const decide = (decision: 'approve' | 'reject' = 'approve') =>
  decideFromInbox({ client, userId: 'u', notificationId: 'n', requestId: 'r', decision });

beforeEach(() => {
  vi.clearAllMocks();
  loadMock.mockResolvedValue({ ok: true, ctx: CTX });
});

describe('decideFromInbox', () => {
  it('kallerens klient når kjernen og arkiveringen', async () => {
    approveMock.mockResolvedValue({ ok: true, outcome: 'approved', gameId: 'g', gameName: 'Y', teamName: null });
    await expect(decide()).resolves.toEqual({ ok: true, outcome: 'approved', gameName: 'Y', teamName: null });
    expect(loadMock).toHaveBeenCalledWith(client, 'r');
    expect(archiveMock).toHaveBeenCalledWith({ userId: 'u', notificationId: 'n', client });
  });

  it('et avslag fra innboksen har ingen grunn', async () => {
    rejectMock.mockResolvedValue({ ok: true, outcome: 'rejected', gameId: 'g', gameName: 'Y', teamName: null });
    await decide('reject');
    expect(rejectMock).toHaveBeenCalledWith(CTX, '');
    expect(approveMock).not.toHaveBeenCalled();
  });

  it('forbidden skriver ingenting', async () => {
    loadMock.mockResolvedValue({ ok: false, reason: 'forbidden', gameId: null, isAdmin: false });
    await expect(decide()).resolves.toEqual({ ok: false, reason: 'forbidden' });
    expect(archiveMock).not.toHaveBeenCalled();
    expect(markReadMock).not.toHaveBeenCalled();
  });

  it('en lesefeil i kjernen er `error`, ikke et unntak', async () => {
    loadMock.mockRejectedValue(new Error('nede'));
    await expect(decide()).resolves.toEqual({ ok: false, reason: 'error' });
  });
});
