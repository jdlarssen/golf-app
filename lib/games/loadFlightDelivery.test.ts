import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

// Type A (#2200): the server read behind the flight delivery rule. The rule
// itself is tested in flightDelivery.test.ts; this pins what is read and that
// scores are only read for players who could be candidates.

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

import { loadFlightDeliveryCards } from './loadFlightDelivery';

const GAME_ID = 'game-1';
const stableford = {
  game_mode: 'stableford' as const,
  hole_segment: 'full' as const,
  source_game_id: null,
};

function rosterRow(user_id: string, opts: Record<string, unknown> = {}) {
  return {
    user_id,
    team_number: null,
    flight_number: null,
    withdrawn_at: null,
    submitted_at: null,
    users: { name: `${user_id} navn`, is_guest: false },
    ...opts,
  };
}

function fullCard(user_id: string, entered_by: string) {
  return Array.from({ length: 18 }, (_, i) => ({
    user_id,
    hole_number: i + 1,
    strokes: 5,
    entered_by,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadFlightDeliveryCards', () => {
  it('reads no scores when nobody could be a candidate', async () => {
    adminMock = buildSupabaseMock([
      {
        data: [rosterRow('kari'), rosterRow('ola', { submitted_at: '2026-09-27T10:00:00Z' })],
        error: null,
      },
    ]);

    await expect(loadFlightDeliveryCards(GAME_ID, 'kari', stableford)).resolves.toEqual([]);
    expect(adminMock.__fromCalls.some((c) => c.table === 'scores')).toBe(false);
  });

  it('reads the pool’s scores only, and returns names and the guest flag', async () => {
    adminMock = buildSupabaseMock([
      {
        data: [
          rosterRow('kari'),
          rosterRow('ola'),
          rosterRow('gjest', { users: { name: ' Gjest Gjestesen ', is_guest: true } }),
          rosterRow('per', { submitted_at: '2026-09-27T10:00:00Z' }),
        ],
        error: null,
      },
      { data: [...fullCard('ola', 'kari'), ...fullCard('gjest', 'ola')], error: null },
    ]);

    await expect(loadFlightDeliveryCards(GAME_ID, 'kari', stableford)).resolves.toEqual([
      { userId: 'ola', name: 'ola navn', isGuest: false },
      { userId: 'gjest', name: 'Gjest Gjestesen', isGuest: true },
    ]);
    const scoresIn = adminMock.__fromCalls.find(
      (c) => c.table === 'scores' && c.method === 'in',
    );
    expect(scoresIn?.args).toEqual(['user_id', ['ola', 'gjest']]);
  });

  it('throws when the roster read fails', async () => {
    adminMock = buildSupabaseMock([{ data: null, error: { message: 'nede' } }]);

    await expect(loadFlightDeliveryCards(GAME_ID, 'kari', stableford)).rejects.toThrow(
      /roster: nede/,
    );
  });
});
