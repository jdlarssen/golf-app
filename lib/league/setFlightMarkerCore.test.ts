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
 *  - a valid marker is written on the deliverer's undelivered card, the core
 *    delivers without asking the flightmates, and the marker is told;
 *  - a second tap tells nobody; a failed league read is `db`.
 *
 * #2814: the one who keeps the flight's cards hands them over. The deliverer's
 * own card is delivered, the kept cards get the deliverer as marker and are
 * not delivered, and each flightmate is told to look the card over. The
 * flightmate delivers without a marker; unchanged, the card is approved in
 * the marker's name, changed, it waits in the marker's queue.
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
const sendDeliveryReminder = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/notifications/deliveryReminder', () => ({
  sendDeliveryReminder: (...args: unknown[]) => sendDeliveryReminder(...args),
}));
const approveScorecardCore = vi.fn(async (..._args: unknown[]) => ({ ok: true, alreadyDone: false }));
vi.mock('@/lib/games/reviewScorecardCore', () => ({
  approveScorecardCore: (...args: unknown[]) => approveScorecardCore(...args),
}));

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
type Row = {
  user_id: string;
  submitted_at: string | null;
  marker_user_id: string | null;
  rejection_reason: string | null;
  handed_over_at: string | null;
  withdrawn_at: string | null;
};
const row = (user_id: string, over: Partial<Row> = {}): Row => ({
  user_id,
  submitted_at: null,
  marker_user_id: null,
  rejection_reason: null,
  handed_over_at: null,
  withdrawn_at: null,
  ...over,
});
/** The flight game: A alone, or A and B. */
const ALONE = { data: [row('a')] };
const FLIGHT_AB = { data: [row('a'), row('b')] };
const GAME = { data: { game_mode: 'stableford', hole_segment: 'full', source_game_id: null } };
const player = {} as SupabaseClient<Database>;
const delivered = { ok: true, alreadySubmitted: false, submitted: 1, alsoDelivered: 0 };
const updates = () =>
  adminMock.__fromCalls.filter((c) => c.table === 'game_players' && c.method === 'update').map((c) => c.args[0]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(readSimulatorLeagueFlight).mockResolvedValue(FLIGHT);
  submitScorecardCore.mockResolvedValue(delivered);
  approveScorecardCore.mockResolvedValue({ ok: true, alreadyDone: false });
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
    adminMock = buildSupabaseMock([ALONE, MEMBERS]);
    const result = await submitScorecardWithMarker(player, 'g1', 'a', { markerUserId });
    expect({
      result,
      submitted: submitScorecardCore.mock.calls.length,
      wrote: adminMock.__fromCalls.some((c) => c.method === 'update'),
    }).toEqual({ result: { ok: false, reason }, submitted: 0, wrote: false });
  });

  it('playing alone: writes the marker on the own card, delivers without the flight, and tells the marker', async () => {
    adminMock = buildSupabaseMock([
      ALONE,
      MEMBERS,
      { data: [{ user_id: 'a' }] }, // marker write
      { data: [{ user_id: 'a', users: { name: 'Anders', nickname: null } }] }, // delivered now
    ]);
    const result = await submitScorecardWithMarker(player, 'g1', 'a', { markerUserId: 'm' });

    const writeAt = adminMock.__fromCalls.findIndex((c) => c.table === 'game_players' && c.method === 'update');
    const writeFilters = adminMock.__fromCalls
      .slice(writeAt)
      .filter((c) => c.table === 'game_players' && (c.method === 'is' || c.method === 'eq'))
      .slice(1, 4)
      .map((c) => [c.method, ...c.args]);
    expect({
      result,
      written: updates(),
      writeFilters,
      core: submitScorecardCore.mock.calls[0]?.slice(1),
      notified: notify.mock.calls,
    }).toEqual({
      result: { ...delivered, handedOver: 0 },
      written: [{ marker_user_id: 'm' }],
      writeFilters: [
        ['eq', 'user_id', 'a'],
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

  it('A hands B over: A\'s card goes to B as marker, B\'s card gets A as marker and is not delivered', async () => {
    loadFlightDeliveryCards.mockResolvedValueOnce([{ userId: 'b' }]);
    adminMock = buildSupabaseMock([
      FLIGHT_AB,
      MEMBERS,
      { data: [{ user_id: 'a' }] }, // A's marker write
      { data: [{ user_id: 'a', users: { name: 'Anders', nickname: null } }] }, // A delivered now
      GAME,
      { data: [{ user_id: 'b' }] }, // handover write
      { data: { name: 'Runde 1' } }, // game name
      {
        data: [
          { id: 'a', email: null, name: 'Anders', nickname: null, locale: null },
          { id: 'b', email: 'b@example.com', name: 'Berit', nickname: null, locale: 'no' },
        ],
      },
      { data: [{ user_id: 'b' }] }, // reminder stamp, after the notice
    ]);
    const result = await submitScorecardWithMarker(player, 'g1', 'a', { alsoFor: ['b'], markerUserId: 'b' });

    const handover = adminMock.__fromCalls.findIndex(
      (c) => c.method === 'update' && (c.args[0] as { marker_user_id?: string }).marker_user_id === 'a',
    );
    const handoverFilters = adminMock.__fromCalls
      .slice(handover)
      .filter((c) => c.method === 'in' || c.method === 'is')
      .slice(0, 4)
      .map((c) => [c.method, ...c.args]);
    const [ownWrite, handoverWrite, stampWrite] = updates() as Record<string, unknown>[];
    expect({
      result,
      ownWrite,
      handoverWrite,
      stamped: typeof stampWrite?.deliver_reminder_sent_at,
      handoverFilters,
      core: submitScorecardCore.mock.calls.map((c) => c.slice(1)),
      markerRequest: notify.mock.calls.map((c) => [(c as unknown as [{ userId: string; payload: { player_id: string } }])[0].userId, (c as unknown as [{ payload: { player_id: string } }])[0].payload.player_id]),
      told: sendDeliveryReminder.mock.calls.map((c) => {
        const o = c[0] as { player: { userId: string; email: string | null }; game: { id: string; name: string }; markerName: string };
        return [o.player.userId, o.player.email, o.game, o.markerName];
      }),
    }).toEqual({
      result: { ...delivered, handedOver: 1 },
      ownWrite: { marker_user_id: 'b' },
      handoverWrite: { marker_user_id: 'a', handed_over_at: expect.any(String) },
      stamped: 'string',
      handoverFilters: [
        ['in', 'user_id', ['b']],
        ['is', 'submitted_at', null],
        ['is', 'withdrawn_at', null],
        ['is', 'marker_user_id', null],
      ],
      core: [['g1', 'a', { alsoFor: [], peerNotices: false }]],
      markerRequest: [['b', 'a']],
      told: [['b', 'b@example.com', { id: 'g1', name: 'Runde 1' }, 'Anders']],
    });
  });

  it('a notice that could not be sent leaves the card unstamped, so the sweep reminds B', async () => {
    loadFlightDeliveryCards.mockResolvedValueOnce([{ userId: 'b' }]);
    adminMock = buildSupabaseMock([
      FLIGHT_AB,
      MEMBERS,
      { data: [{ user_id: 'a' }] },
      { data: [] },
      GAME,
      { data: [{ user_id: 'b' }] }, // handover write
      { data: null, error: { message: 'connection reset' } }, // game name read
      { data: [] },
    ]);
    const result = await submitScorecardWithMarker(player, 'g1', 'a', { alsoFor: ['b'], markerUserId: 'm' });
    expect({
      handedOver: (result as { handedOver?: number }).handedOver,
      told: sendDeliveryReminder.mock.calls.length,
      stamped: updates().some((u) => 'deliver_reminder_sent_at' in (u as object)),
    }).toEqual({ handedOver: 1, told: 0, stamped: false });
  });

  it('a failed handover does not fail A\'s delivery', async () => {
    loadFlightDeliveryCards.mockResolvedValueOnce([{ userId: 'b' }]);
    adminMock = buildSupabaseMock([
      FLIGHT_AB,
      MEMBERS,
      { data: [{ user_id: 'a' }] },
      { data: [] },
      GAME,
      { data: null, error: { message: 'connection reset' } }, // handover write
    ]);
    const result = await submitScorecardWithMarker(player, 'g1', 'a', { alsoFor: ['b'], markerUserId: 'm' });
    expect({ result, told: sendDeliveryReminder.mock.calls.length }).toEqual({
      result: { ...delivered, handedOver: 0 },
      told: 0,
    });
  });

  const HANDED = {
    data: [
      row('a', { submitted_at: '2026-11-10T18:00:00Z', marker_user_id: 'b' }),
      row('b', { marker_user_id: 'a', handed_over_at: '2026-11-10T18:00:01Z' }),
    ],
  };

  it('B delivers the card A kept, unchanged: approved in A\'s name, nobody is asked', async () => {
    adminMock = buildSupabaseMock([HANDED, { data: Array.from({ length: 18 }, () => ({ entered_by: 'a' })) }]);
    const result = await submitScorecardWithMarker(player, 'g1', 'b', {});
    expect({
      result,
      wrote: updates(),
      core: submitScorecardCore.mock.calls[0]?.slice(1),
      approved: approveScorecardCore.mock.calls.map((c) => {
        const { client: _client, ...rest } = c[0] as Record<string, unknown>;
        return rest;
      }),
      markerRequests: notify.mock.calls.length,
    }).toEqual({
      result: { ...delivered, handedOver: 0 },
      wrote: [],
      core: ['g1', 'b', { alsoFor: [], peerNotices: false }],
      approved: [
        {
          gameId: 'g1',
          approverUserId: 'a',
          playerUserId: 'b',
          approverRole: 'peer',
          delivererMayApprove: false,
          markerUserId: 'a',
        },
      ],
      markerRequests: 0,
    });
  });

  it('B changed a hole: not approved, A is asked, and the card waits in A\'s queue', async () => {
    adminMock = buildSupabaseMock([
      HANDED,
      { data: [...Array.from({ length: 17 }, () => ({ entered_by: 'a' })), { entered_by: 'b' }] },
      { data: [{ user_id: 'b', users: { name: 'Berit', nickname: null } }] }, // delivered now
    ]);
    await submitScorecardWithMarker(player, 'g1', 'b', {});
    expect({
      approved: approveScorecardCore.mock.calls.length,
      asked: notify.mock.calls.map((c) => (c as unknown as [{ userId: string; kind: string; payload: { player_id: string } }])[0]).map((n) => [n.userId, n.kind, n.payload.player_id]),
    }).toEqual({ approved: 0, asked: [['a', 'league_marker_request', 'b']] });
  });

  it('a failed automatic approval leaves the card in A\'s queue and tells A', async () => {
    approveScorecardCore.mockResolvedValueOnce({ ok: false, reason: 'not_pending' } as never);
    adminMock = buildSupabaseMock([
      HANDED,
      { data: [{ entered_by: 'a' }] },
      { data: [{ user_id: 'b', users: { name: 'Berit', nickname: null } }] },
    ]);
    const result = await submitScorecardWithMarker(player, 'g1', 'b', {});
    expect({ ok: result.ok, asked: notify.mock.calls.length }).toEqual({ ok: true, asked: 1 });
  });

  it('B sending a marker is ignored: the marker A stands', async () => {
    adminMock = buildSupabaseMock([HANDED, { data: [{ entered_by: 'a' }] }]);
    const result = await submitScorecardWithMarker(player, 'g1', 'b', { markerUserId: 'm' });
    expect({
      ok: result.ok,
      wrote: updates(),
      membersRead: adminMock.__fromCalls.some((c) => c.table === 'league_players'),
    }).toEqual({ ok: true, wrote: [], membersRead: false });
  });

  // #2814 (the owner 11.11): a card its marker sent back goes back to the same
  // marker. No picker, no marker write, never approved on delivery.
  const requests = () =>
    notify.mock.calls.map((c) => (c as unknown as [{ userId: string; kind: string; payload: { player_id: string } }])[0]).map((n) => [n.userId, n.kind, n.payload.player_id]);

  it('B sends back the card A sent back: it goes to A again, unchanged or not, never approved on delivery', async () => {
    adminMock = buildSupabaseMock([
      { data: [row('a', { submitted_at: '2026-11-10T18:00:00Z', marker_user_id: 'b' }), row('b', { marker_user_id: 'a', rejection_reason: 'hull 7' })] },
      { data: [{ user_id: 'b', users: { name: 'Berit', nickname: null } }] }, // delivered now
    ]);
    const result = await submitScorecardWithMarker(player, 'g1', 'b', { markerUserId: 'm' });
    expect({
      ok: result.ok,
      wrote: updates(),
      scoresRead: adminMock.__fromCalls.some((c) => c.table === 'scores'),
      approved: approveScorecardCore.mock.calls.length,
      asked: requests(),
    }).toEqual({ ok: true, wrote: [], scoresRead: false, approved: 0, asked: [['a', 'league_marker_request', 'b']] });
  });

  it('A sends back the own card the flightmate B sent back: to B again, without a picker', async () => {
    adminMock = buildSupabaseMock([
      { data: [row('a', { marker_user_id: 'b', rejection_reason: 'hull 3' }), row('b', { submitted_at: '2026-11-10T18:00:00Z', marker_user_id: 'a' })] },
      { data: [{ user_id: 'a', users: { name: 'Anders', nickname: null } }] },
    ]);
    const result = await submitScorecardWithMarker(player, 'g1', 'a', { markerUserId: 'm' });
    expect({
      ok: result.ok,
      membersRead: adminMock.__fromCalls.some((c) => c.table === 'league_players'),
      wrote: updates(),
      asked: requests(),
    }).toEqual({ ok: true, membersRead: false, wrote: [], asked: [['b', 'league_marker_request', 'a']] });
  });

  it('a marker outside the flight who sent the card back gets it again; no marker is required', async () => {
    adminMock = buildSupabaseMock([
      { data: [row('a', { marker_user_id: 'm', rejection_reason: 'hull 3' })] },
      { data: [{ user_id: 'a', users: { name: 'Anders', nickname: null } }] },
    ]);
    const result = await submitScorecardWithMarker(player, 'g1', 'a', {});
    expect({ ok: result.ok, wrote: updates(), asked: requests() }).toEqual({
      ok: true,
      wrote: [],
      asked: [['m', 'league_marker_request', 'a']],
    });
  });

  // #2814 (the owner 11.11, «Ja, legg til feltet»): a reopened card is not
  // handed over any more (0233 clears handed_over_at), so it goes to its
  // marker and is never approved on delivery, even with every row the marker's.
  it('a reopened handed-over card sent in unchanged goes to A and is not approved', async () => {
    adminMock = buildSupabaseMock([
      { data: [row('a', { submitted_at: '2026-11-10T18:00:00Z', marker_user_id: 'b' }), row('b', { marker_user_id: 'a' })] },
      { data: [{ user_id: 'b', users: { name: 'Berit', nickname: null } }] },
    ]);
    const result = await submitScorecardWithMarker(player, 'g1', 'b', {});
    expect({
      ok: result.ok,
      scoresRead: adminMock.__fromCalls.some((c) => c.table === 'scores'),
      approved: approveScorecardCore.mock.calls.length,
      asked: requests(),
    }).toEqual({ ok: true, scoresRead: false, approved: 0, asked: [['a', 'league_marker_request', 'b']] });
  });

  it('a second tap (already delivered) tells nobody', async () => {
    submitScorecardCore.mockResolvedValue({ ok: true, alreadySubmitted: true, submitted: 0, alsoDelivered: 0 });
    adminMock = buildSupabaseMock([ALONE, MEMBERS, { data: [] }]);
    const result = await submitScorecardWithMarker(player, 'g1', 'a', { markerUserId: 'm' });
    expect({ ok: result.ok, notified: notify.mock.calls.length }).toEqual({ ok: true, notified: 0 });
  });

  it('a delivered own card asks for no marker; the kept cards are still handed over', async () => {
    submitScorecardCore.mockResolvedValue({ ok: true, alreadySubmitted: true, submitted: 0, alsoDelivered: 0 });
    loadFlightDeliveryCards.mockResolvedValueOnce([{ userId: 'b' }]);
    adminMock = buildSupabaseMock([
      { data: [row('a', { submitted_at: '2026-11-10T18:00:00Z', marker_user_id: 'm' }), row('b')] },
      GAME,
      { data: [{ user_id: 'b' }] },
      { data: { name: 'Runde 1' } },
      { data: [] },
    ]);
    const result = await submitScorecardWithMarker(player, 'g1', 'a', { alsoFor: ['b'] });
    expect({ result, membersRead: adminMock.__fromCalls.some((c) => c.table === 'league_players') }).toEqual({
      result: { ok: true, alreadySubmitted: true, submitted: 0, alsoDelivered: 0, handedOver: 1 },
      membersRead: false,
    });
  });

  it('a caller who is not playing marks nothing; the core answers', async () => {
    submitScorecardCore.mockResolvedValue({ ok: false, reason: 'not_player' });
    adminMock = buildSupabaseMock([ALONE]);
    const result = await submitScorecardWithMarker(player, 'g1', 'z', { alsoFor: ['a'], markerUserId: 'm' });
    expect({
      result,
      wrote: adminMock.__fromCalls.some((c) => c.method === 'update'),
    }).toEqual({ result: { ok: false, reason: 'not_player' }, wrote: false });
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
