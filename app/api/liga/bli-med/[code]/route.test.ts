// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppLeagueJoinView } from '@/lib/league/appLeagueView';
import type { LeagueJoinContext } from '@/lib/league/getLeagueJoinContext';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2748): the league link in the app. The read
 * (`getLeagueJoinContext`), the decision (`evaluateLeagueJoin`, real here) and
 * the write (`joinLeagueByCodeCore`) have their own suites. Here stands what
 * the route answers for: nothing without a token, the caller comes only from
 * the token and the code only from the path, each outcome gets its status, and
 * no answer ever carries a participant's name.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const CODE = 'abcd2345';
const LEAGUE_ID = '44444444-4444-4444-8444-444444444444';

const fake = createAdminClientMock({ tokens: { 'token-meg': ME }, respond: () => ({ data: null }) });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

const contextMock = vi.fn();
vi.mock('@/lib/league/getLeagueJoinContext', () => ({
  getLeagueJoinContext: (...args: unknown[]) => contextMock(...args),
}));

const coreMock = vi.fn();
vi.mock('@/lib/league/joinLeagueByCode', () => ({
  joinLeagueByCodeCore: (...args: unknown[]) => coreMock(...args),
}));

import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

function context(facts: Partial<LeagueJoinContext['facts']> = {}): LeagueJoinContext {
  return {
    league: {
      id: LEAGUE_ID,
      name: 'Vinterliga',
      status: 'active',
      format: 'stableford',
      is_simulator: false,
      group_id: null,
      courses: { name: 'Larvik GK' },
    },
    rounds: [
      { sequence: 1, opensAt: ago(20), closesAt: ago(10) },
      { sequence: 2, opensAt: ago(5), closesAt: ago(-5) },
    ],
    participantCount: 7,
    facts: {
      leagueExists: true,
      status: 'active',
      signedIn: true,
      profileCompleted: true,
      alreadyJoined: false,
      ...facts,
    },
  };
}

const params = (code = CODE) => ({ params: Promise.resolve({ code }) });

function request(method: 'GET' | 'POST', token: string | null = 'token-meg', body?: unknown) {
  return new NextRequest(`https://tornygolf.no/api/liga/bli-med/${CODE}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  contextMock.mockResolvedValue(context());
  coreMock.mockResolvedValue({ ok: true, leagueId: LEAGUE_ID, alreadyJoined: false });
});

describe('GET /api/liga/bli-med/[code]', () => {
  it('401 without a token, and reads nothing', async () => {
    const res = await GET(request('GET', null), params());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(contextMock).not.toHaveBeenCalled();
  });

  it('401 for a token that does not validate', async () => {
    const res = await GET(request('GET', 'token-ukjent'), params());
    expect(res.status).toBe(401);
    expect(contextMock).not.toHaveBeenCalled();
  });

  // Unknown code, a link that is off and a club league all read as «no league»
  // in `getLeagueJoinContext`, so the route has one answer for them.
  it('404 when the code leads nowhere', async () => {
    contextMock.mockResolvedValue({
      league: null,
      rounds: [],
      participantCount: 0,
      facts: { leagueExists: false, status: null, signedIn: true, profileCompleted: false, alreadyJoined: false },
    });
    const res = await GET(request('GET'), params());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('asks about the caller from the token and the code from the path', async () => {
    await GET(request('GET'), params());
    expect(contextMock).toHaveBeenCalledWith(CODE, ME);
  });

  it('gives what the screen shows, and the rounds a late joiner has missed', async () => {
    const res = await GET(request('GET'), params());
    expect(res.status).toBe(200);
    const body = (await res.json()) as AppLeagueJoinView;
    expect(body).toMatchObject({
      decision: 'can_join',
      league: { id: LEAGUE_ID, name: 'Vinterliga', format: 'stableford', isSimulator: false, courseName: 'Larvik GK' },
      participantCount: 7,
      lateJoin: { kind: 'from_next_round', played: [1] },
    });
    expect(body.rounds).toHaveLength(2);
  });

  it.each<[AppLeagueJoinView['decision'], Partial<LeagueJoinContext['facts']>]>([
    ['can_join', {}],
    ['already_joined', { alreadyJoined: true }],
    ['closed', { status: 'finished' }],
    ['profile_incomplete', { profileCompleted: false }],
  ])('decision %s follows the shared rule', async (decision, facts) => {
    contextMock.mockResolvedValue(context(facts));
    const res = await GET(request('GET'), params());
    expect(res.status).toBe(200);
    expect(((await res.json()) as AppLeagueJoinView).decision).toBe(decision);
  });

  it('a course-less league has no course name', async () => {
    const ctx = context();
    ctx.league!.courses = null;
    contextMock.mockResolvedValue(ctx);
    const res = await GET(request('GET'), params());
    expect(((await res.json()) as AppLeagueJoinView).league.courseName).toBeNull();
  });

  it('the answer is a count and never names anyone', async () => {
    const res = await GET(request('GET'), params());
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/userId|user_id|fullName|email|nickname|participants/);
  });

  it('a failed read is 500, not 404 (#1863)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    contextMock.mockRejectedValue(new Error('getLeagueJoinContext: players read failed'));
    const res = await GET(request('GET'), params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'load_failed' });
    errorSpy.mockRestore();
  });
});

describe('POST /api/liga/bli-med/[code]', () => {
  it('401 without a token, and writes nothing', async () => {
    const res = await POST(request('POST', null), params());
    expect(res.status).toBe(401);
    expect(coreMock).not.toHaveBeenCalled();
  });

  it('200 with the league, for a new player and for someone already in', async () => {
    let res = await POST(request('POST'), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ leagueId: LEAGUE_ID });

    coreMock.mockResolvedValue({ ok: true, leagueId: LEAGUE_ID, alreadyJoined: true });
    res = await POST(request('POST'), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ leagueId: LEAGUE_ID });
  });

  it('a user id or a code in the body is ignored', async () => {
    await POST(request('POST', 'token-meg', { user_id: 'someone-else', userId: 'someone-else', code: 'zzzz9999' }), params());
    expect(coreMock).toHaveBeenCalledTimes(1);
    expect(coreMock).toHaveBeenCalledWith(CODE, ME);
  });

  it.each([
    ['not_found', 404],
    ['closed', 409],
    ['profile_incomplete', 409],
    ['read_failed', 500],
    ['save_failed', 500],
  ])('%s → %i with the code', async (error, status) => {
    coreMock.mockResolvedValue({ ok: false, error });
    const res = await POST(request('POST'), params());
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it('a core that throws is a 500, never a raw crash', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    coreMock.mockRejectedValue(new Error('boom'));
    const res = await POST(request('POST'), params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'save_failed' });
    errorSpy.mockRestore();
  });
});
