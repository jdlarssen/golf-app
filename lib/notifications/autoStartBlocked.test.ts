import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

const notifyMock = vi.fn<
  (...args: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>
>();
vi.mock('./notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

import {
  isStructuralBlockReason,
  maybeNotifyAutoStartBlocked,
} from './autoStartBlocked';

beforeEach(() => {
  notifyMock.mockReset();
  notifyMock.mockResolvedValue({ shouldAlsoSendMail: false });
  adminMock = buildSupabaseMock([]);
});

// ─── Årsaks-filteret (Type A) ────────────────────────────────────────────────

describe('isStructuralBlockReason', () => {
  it.each([
    'incomplete_sides',
    'pending_players',
    'no_players',
    'tee_missing',
    'tee_missing_rating',
  ])('%s er strukturell → varsles', (reason) => {
    expect(isStructuralBlockReason(reason)).toBe(true);
  });

  it.each(['db_players', 'db_game', 'not_found', 'not_scheduled'])(
    '%s er transient → varsles ikke',
    (reason) => {
      expect(isStructuralBlockReason(reason)).toBe(false);
    },
  );
});

// ─── Atomisk én-gangs-guard ──────────────────────────────────────────────────

describe('maybeNotifyAutoStartBlocked', () => {
  const OPTS = {
    gameId: 'game-1',
    gameName: 'Byneset North',
    createdBy: 'creator-1',
    reason: 'incomplete_sides',
    logPrefix: 'test',
  };

  it('vant raden → varsler oppretteren med årsak', async () => {
    adminMock = buildSupabaseMock([
      // games-update vant (auto_start_blocked_notified_at var null)
      { data: { id: 'game-1' }, error: null },
    ]);

    await maybeNotifyAutoStartBlocked(OPTS);

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith({
      userId: 'creator-1',
      kind: 'auto_start_blocked',
      payload: {
        game_id: 'game-1',
        game_name: 'Byneset North',
        reason: 'incomplete_sides',
      },
    });
  });

  it('tapte raden (allerede varslet) → ingen varsel', async () => {
    adminMock = buildSupabaseMock([
      // maybeSingle gir null når guard-WHERE ikke matchet noen rad
      { data: null, error: null },
    ]);

    await maybeNotifyAutoStartBlocked(OPTS);

    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('transient årsak → rører ikke DB i det hele tatt', async () => {
    await maybeNotifyAutoStartBlocked({ ...OPTS, reason: 'db_game' });

    expect(adminMock.from).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('mangler created_by → ingen varsel, ingen DB-skriving', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    await maybeNotifyAutoStartBlocked({ ...OPTS, createdBy: null });

    expect(adminMock.from).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
    consoleLog.mockRestore();
  });
});
