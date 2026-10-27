import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import type { LeagueFlight } from './leagueFlight';

/**
 * Delivering a card in a simulator league (#2661):
 *  - outside a simulator league it is the core, unchanged;
 *  - a missing marker, the player themself and someone outside the league are
 *    refused with their own code, before anything is written or delivered;
 *  - a valid marker is written on the undelivered cards, the core delivers
 *    without asking the flightmates, and the marker is told once per card;
 *  - a second tap tells nobody; a failed league read is `db`;
 *  - only cards the caller may deliver get the marker: none for someone not
 *    playing, and only the flightmates the core's own rule allows.
 */

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => adminMock }));
vi.mock('@/lib/league/leagueFlight');
const submitScorecardCore = vi.fn();
vi.mock('@/lib/games/submitScorecardCore', () => ({
  submitScorecardCore: (...args: unknown[]) => submitScorecardCore(...args),
}));
const loadFlightDeliveryCards = vi.fn(async (..._args: unknown[]) => [] as { userId: string }[]);
vi.mock('@/lib/games/loadFlightDelivery', () => ({
  loadFlightDeliveryCards: (...args: unknown[]) => loadFlightDeliveryCards(...args),
}));
const notify = vi.fn(async () => ({ shouldAlsoSendMail: false }));
vi.mock('@/lib/notifications/notify', () => ({ notify: (...args: unknown[]) => notify(...(args as [])) }));

import { readSimulatorLeagueFlight } from './leagueFlight';
import { submitScorecardWithMarker } from './setFlightMarkerCore';

const FLIGHT: LeagueFlight = {
  gameId: 'g1',
  roundId: 'r1',
  roundLabel: 'Runde 1',
  leagueId: 'l1',
  leagueName: 'Vinterliga',
  isSimulator: true,
  leagueCreatorId: 'org',
};
const MEMBERS = { data: ['a', 'b', 'm'].map((user_id) => ({ user_id })) };
/** The deliverer's own active row in the game. */
const ME = { data: { user_id: 'a' } };
const GAME = { data: { game_mode: 'stableford', hole_segment: 'full', source_game_id: null } };
const player = {} as SupabaseClient<Database>;
const delivered = { ok: true, alreadySubmitted: false, submitted: 1, alsoDelivered: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(readSimulatorLeagueFlight).mockResolvedValue(FLIGHT);
  submitScorecardCore.mockResolvedValue(delivered);
});

describe('submitScorecardWithMarker', () => {
  it('outside a simulator league delivers with the core, ignoring a marker', async () => {
    vi.mocked(readSimulatorLeagueFlight).mockResolvedValue(null);
    adminMock = buildSupabaseMock([]);
    const result = await submitScorecardWithMarker(player, 'g1', 'a', { alsoFor: ['b'], markerUserId: 'm' });
    expect({ result, args: submitScorecardCore.mock.calls[0]?.slice(1), admin: adminMock.__fromCalls }).toEqual({
      result: delivered,
      args: ['g1', 'a', { alsoFor: ['b'] }],
      admin: [],
    });
  });

  it.each([
    ['no marker', null, 'marker_required'],
    ['the player themself', 'a', 'marker_is_self'],
    ['someone outside the league', 'z', 'marker_not_member'],
  ] as const)('refuses %s before anything is written', async (_label, markerUserId, reason) => {
    adminMock = buildSupabaseMock([ME, MEMBERS]);
    const result = await submitScorecardWithMarker(player, 'g1', 'a', { markerUserId });
    expect({
      result,
      submitted: submitScorecardCore.mock.calls.length,
      wrote: adminMock.__fromCalls.some((c) => c.method === 'update'),
    }).toEqual({ result: { ok: false, reason }, submitted: 0, wrote: false });
  });

  it('refuses the owner of a flightmate card in the same delivery as marker', async () => {
    loadFlightDeliveryCards.mockResolvedValueOnce([{ userId: 'b' }]);
    adminMock = buildSupabaseMock([ME, GAME, MEMBERS]);
    const result = await submitScorecardWithMarker(player, 'g1', 'a', { alsoFor: ['b'], markerUserId: 'b' });
    expect(result).toEqual({ ok: false, reason: 'marker_is_self' });
  });

  it('writes the marker on the undelivered cards, delivers without the flight, and tells the marker', async () => {
    adminMock = buildSupabaseMock([
      ME,
      MEMBERS,
      { data: [{ user_id: 'a' }] }, // marker write
      { data: [{ user_id: 'a', users: { name: 'Anders', nickname: null } }] }, // delivered now
    ]);
    const result = await submitScorecardWithMarker(player, 'g1', 'a', { markerUserId: 'm' });

    const write = adminMock.__fromCalls.find((c) => c.table === 'game_players' && c.method === 'update');
    const writeAt = adminMock.__fromCalls.findIndex((c) => c.table === 'game_players' && c.method === 'update');
    const writeFilters = adminMock.__fromCalls
      .slice(writeAt)
      .filter((c) => c.table === 'game_players' && (c.method === 'is' || c.method === 'in'))
      .slice(0, 3)
      .map((c) => [c.method, ...c.args]);
    expect({
      result,
      written: write?.args[0],
      writeFilters,
      core: submitScorecardCore.mock.calls[0]?.slice(1),
      notified: notify.mock.calls,
    }).toEqual({
      result: delivered,
      written: { marker_user_id: 'm' },
      writeFilters: [
        ['in', 'user_id', ['a']],
        ['is', 'submitted_at', null],
        ['is', 'withdrawn_at', null],
      ],
      core: ['g1', 'a', { alsoFor: [], peerNotices: false }],
      notified: [
        [
          {
            userId: 'm',
            kind: 'league_marker_request',
            payload: { league_id: 'l1', league_name: 'Vinterliga', game_id: 'g1', player_id: 'a', player_name: 'Anders' },
          },
        ],
      ],
    });
  });

  it('a second tap (already delivered) tells nobody', async () => {
    submitScorecardCore.mockResolvedValue({ ok: true, alreadySubmitted: true, submitted: 0, alsoDelivered: 0 });
    adminMock = buildSupabaseMock([ME, MEMBERS, { data: [] }]);
    const result = await submitScorecardWithMarker(player, 'g1', 'a', { markerUserId: 'm' });
    expect({ ok: result.ok, notified: notify.mock.calls.length }).toEqual({ ok: true, notified: 0 });
  });

  it('a caller who is not playing marks nothing; the core answers', async () => {
    submitScorecardCore.mockResolvedValue({ ok: false, reason: 'not_player' });
    adminMock = buildSupabaseMock([{ data: null }]);
    const result = await submitScorecardWithMarker(player, 'g1', 'z', { alsoFor: ['a'], markerUserId: 'm' });
    expect({
      result,
      wrote: adminMock.__fromCalls.some((c) => c.method === 'update'),
    }).toEqual({ result: { ok: false, reason: 'not_player' }, wrote: false });
  });

  it('marks only the flightmates the deliverer may deliver, as the core narrows them', async () => {
    loadFlightDeliveryCards.mockResolvedValueOnce([{ userId: 'b' }]);
    adminMock = buildSupabaseMock([ME, GAME, MEMBERS, { data: [{ user_id: 'a' }, { user_id: 'b' }] }, { data: [] }]);
    await submitScorecardWithMarker(player, 'g1', 'a', { alsoFor: ['b', 'x'], markerUserId: 'm' });
    const filter = adminMock.__fromCalls.find(
      (c) => c.table === 'game_players' && c.method === 'in' && c.args[0] === 'user_id',
    );
    expect(filter?.args[1]).toEqual(['a', 'b']);
  });

  it('a failed league read is db, and nothing is delivered', async () => {
    vi.mocked(readSimulatorLeagueFlight).mockRejectedValue(new Error('connection reset'));
    adminMock = buildSupabaseMock([]);
    const result = await submitScorecardWithMarker(player, 'g1', 'a', { markerUserId: 'm' });
    expect({ result, submitted: submitScorecardCore.mock.calls.length }).toEqual({
      result: { ok: false, reason: 'db' },
      submitted: 0,
    });
  });
});
