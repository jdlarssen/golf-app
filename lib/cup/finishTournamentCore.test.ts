import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Audit 2026-11-20: a cup finishes only from in progress. A draft cup was never
 * played, so finishing it would crown nobody and send the «cup finished»
 * notice to every participant. The flip itself carries `status = 'active'`.
 */

const snapshotMock = vi.fn();
vi.mock('./getCupSnapshot', () => ({ getCupSnapshot: (...a: unknown[]) => snapshotMock(...a) }));
vi.mock('@/lib/games/endGameCore', () => ({ endGameCore: vi.fn(async () => ({ ok: true })) }));
const notifyFinishedMock = vi.fn(async () => new Map<string, boolean>());
vi.mock('@/lib/notifications/events', () => ({
  notifyParticipantsCupFinished: (...a: unknown[]) => notifyFinishedMock(...(a as [])),
}));
vi.mock('./tournamentParticipants', () => ({ loadTournamentParticipantEmails: vi.fn(async () => []) }));
vi.mock('@/lib/mail/cupFinishedNotification', () => ({ sendCupFinishedNotification: vi.fn() }));

function snapshot(status: string) {
  return {
    tournament: { id: 'cup-1', name: 'Ryder Cup', status },
    sideAwards: [],
    leaderboard: { matches: [], team1Points: 0, team2Points: 0 },
  };
}

const args = {
  tournamentId: 'cup-1',
  actor: { id: 'u1', name: 'Arrangør' },
  allowMissing: false,
  unknownLabel: 'Ukjent',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('finishTournamentCore — only an active cup finishes', () => {
  it('a draft cup: not_started, nothing written, no notice', async () => {
    snapshotMock.mockResolvedValue(snapshot('draft'));
    const admin = buildSupabaseMock([]);
    const writer = buildSupabaseMock([]);
    const { finishTournamentCore } = await import('./finishTournamentCore');

    const result = await finishTournamentCore(admin as never, writer as never, args);

    expect(result).toEqual({ ok: false, error: 'not_started' });
    expect(writer.__fromCalls.filter((c) => c.method === 'update')).toHaveLength(0);
    expect(notifyFinishedMock).not.toHaveBeenCalled();
  });

  it('an active cup: the flip is bound to status active', async () => {
    snapshotMock.mockResolvedValue(snapshot('active'));
    const admin = buildSupabaseMock([]);
    const writer = buildSupabaseMock([{ data: [{ id: 'cup-1' }], error: null }]);
    const { finishTournamentCore } = await import('./finishTournamentCore');

    const result = await finishTournamentCore(admin as never, writer as never, args);

    expect(result).toEqual({ ok: true, alreadyFinished: false });
    const statusEq = writer.__fromCalls.filter(
      (c) => c.table === 'tournaments' && c.method === 'eq' && c.args[0] === 'status',
    );
    expect(statusEq.map((c) => c.args[1])).toEqual(['active']);
    expect(notifyFinishedMock).toHaveBeenCalledTimes(1);
  });
});
