import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import type { LeagueFlight } from './leagueFlight';

/**
 * #2661: the last approval finishes a simulator-league flight on its own
 * (the owner's «Ja, av seg selv»), through the real finish pipeline, and
 * nothing else: not another game, not a flight still waiting for a card.
 */

let admin: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => admin }));
vi.mock('@/lib/league/leagueFlight');
const endGameCore = vi.fn();
vi.mock('@/lib/games/endGameCore', () => ({
  endGameCore: (...args: unknown[]) => endGameCore(...args),
}));

import { readSimulatorLeagueFlight } from './leagueFlight';
import { finishSimulatorFlightIfApproved } from './finishSimulatorFlight';

const FLIGHT: LeagueFlight = {
  gameId: 'g1',
  roundId: 'r1',
  roundLabel: 'Runde 3',
  leagueId: 'l1',
  leagueName: 'Vinterliga',
  isSimulator: true,
  leagueCreatorId: 'org',
};

beforeEach(() => {
  endGameCore.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(readSimulatorLeagueFlight).mockResolvedValue(FLIGHT);
  admin = buildSupabaseMock([{ data: { name: 'Mia Lie' } }]);
});

describe('finishSimulatorFlightIfApproved', () => {
  it('outside a simulator league it finishes nothing', async () => {
    vi.mocked(readSimulatorLeagueFlight).mockResolvedValue(null);
    expect(await finishSimulatorFlightIfApproved('g1', 'mia')).toBe('not_simulator');
    expect(endGameCore).not.toHaveBeenCalled();
  });

  it('the last approval finishes the flight through the finish pipeline, as the approver', async () => {
    endGameCore.mockResolvedValue({ ok: true, gameName: 'x', alreadyFinished: false });
    expect(await finishSimulatorFlightIfApproved('g1', 'mia')).toBe('finished');
    expect(endGameCore.mock.calls[0].slice(1)).toEqual([
      'g1',
      { id: 'mia', name: 'Mia Lie' },
      { logContext: 'finishSimulatorFlight' },
    ]);
  });

  it.each(['not_all_submitted', 'not_all_approved'])('a card still open (%s) waits', async (reason) => {
    endGameCore.mockResolvedValue({ ok: false, reason });
    expect(await finishSimulatorFlightIfApproved('g1', 'mia')).toBe('waiting');
  });

  it('a finish that failed is logged and never throws', async () => {
    endGameCore.mockRejectedValue(new Error('boom'));
    expect(await finishSimulatorFlightIfApproved('g1', 'mia')).toBe('failed');
  });
});
