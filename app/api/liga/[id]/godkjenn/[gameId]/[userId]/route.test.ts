// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #2661: the marker's card for the app, the HTTP shape only. Who may see it
 * is `markerReviewAccess` (the gate is tested through `mayApproveAsMarker`
 * and `scorecardReviewAccess`); here: no token is 401, anyone the gate
 * refuses or a card from another league is 404, and the 200 body.
 */

const LEAGUE = '11111111-1111-4111-8111-111111111111';
const GAME = '22222222-2222-4222-8222-222222222222';
const PLAYER = '33333333-3333-4333-8333-333333333333';

let caller: string | null = 'mia';
vi.mock('@/lib/api/appAuth', () => ({ authenticatedUserId: async () => caller }));
const markerReviewAccess = vi.fn();
vi.mock('@/lib/league/markerReviewAccess', () => ({
  markerReviewAccess: (...args: unknown[]) => markerReviewAccess(...args),
  loadMarkerCard: async () => ({
    holes: [{ hole_number: 1, par_mens: 4, par_ladies: 5, par_juniors: 4, stroke_index: 3 }],
    strokes: new Map([[1, 5]]),
  }),
  markerCardHoles: (card: { holes: { hole_number: number; par_ladies: number; stroke_index: number }[] }) =>
    card.holes.map((h) => ({ number: h.hole_number, par: h.par_ladies, strokeIndex: h.stroke_index, strokes: 5 })),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const review = (leagueId = LEAGUE) => ({
  ok: true,
  role: 'marker',
  flight: { gameId: GAME, roundId: 'r1', roundLabel: 'Runde 3', leagueId, leagueName: 'Vinterliga', isSimulator: true, leagueCreatorId: 'org' },
  game: { name: 'Vinterliga – Runde', status: 'active', gameMode: 'stableford', courseId: 'c1', holeSegment: 'full' },
  card: { userId: PLAYER, name: 'Anders', markerUserId: 'mia', markerName: 'Mia', submittedAt: 'x', approvedAt: null, teeGender: 'ladies', courseHandicap: 10 },
  state: 'pending',
});

const get = (ids: { id?: string; gameId?: string; userId?: string } = {}) =>
  GET(new NextRequest('https://tornygolf.no/api/liga/x'), {
    params: Promise.resolve({ id: ids.id ?? LEAGUE, gameId: ids.gameId ?? GAME, userId: ids.userId ?? PLAYER }),
  });

beforeEach(() => {
  caller = 'mia';
  markerReviewAccess.mockReset();
});

describe('GET /api/liga/[id]/godkjenn/[gameId]/[userId]', () => {
  it('without a token → 401, before the gate', async () => {
    caller = null;
    const res = await get();
    expect({ status: res.status, gate: markerReviewAccess.mock.calls.length }).toEqual({ status: 401, gate: 0 });
  });

  it.each([
    ['the gate refuses', { ok: false, reason: 'forbidden' }],
    ['the card is in another league', review('44444444-4444-4444-8444-444444444444')],
  ])('%s → 404', async (_label, answer) => {
    markerReviewAccess.mockResolvedValue(answer);
    const res = await get();
    expect(res.status).toBe(404);
  });

  it('an id that is not a uuid → 404, before the gate', async () => {
    const res = await get({ gameId: 'nope' });
    expect({ status: res.status, gate: markerReviewAccess.mock.calls.length }).toEqual({ status: 404, gate: 0 });
  });

  it('the marker gets the card, with the par for the owner', async () => {
    markerReviewAccess.mockResolvedValue(review());
    const res = await get();
    expect({ status: res.status, body: await res.json() }).toEqual({
      status: 200,
      body: {
        leagueId: LEAGUE,
        leagueName: 'Vinterliga',
        roundLabel: 'Runde 3',
        gameId: GAME,
        player: { userId: PLAYER, name: 'Anders' },
        role: 'marker',
        markerName: 'Mia',
        state: 'pending',
        holes: [{ number: 1, par: 5, strokeIndex: 3, strokes: 5 }],
      },
    });
    expect(markerReviewAccess).toHaveBeenCalledWith('mia', GAME, PLAYER);
  });
});
