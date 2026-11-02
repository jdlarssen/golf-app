// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';
import type { CupJoinFacts } from '@/lib/cup/joinValidation';

/**
 * Type A (#2752): cup-lenka i appen. Regelen (`evaluateCupJoin`) og skrivingen har egne
 * suiter (`joinValidation.test.ts`, og `actions.test.ts` i `/cup/bli-med` kjører samme
 * kjerne). Her: kalleren kommer bare fra tokenet, hva svaret har med, og kodene.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const CODE = 'abcd2345';

const FACTS: CupJoinFacts = {
  cupExists: true,
  status: 'draft',
  groupId: null,
  creatorIsAdmin: false,
  profileCompleted: true,
  isClubMember: false,
  participantCount: 3,
  alreadyJoined: false,
};
const CUP = {
  id: 'cup',
  name: 'Klubbmesterskapet',
  status: 'draft',
  group_id: null as string | null,
  created_by: 'arrangor',
  team_1_name: 'Team Nord',
  team_2_name: 'Team Sør',
};

let plan: unknown = null;
function respond(op: QueryOp): QueryResponse {
  if (op.table === 'tournament_plans') return { data: plan, error: null };
  if (op.table === 'groups') return { data: { name: 'Stiklestad GK', short_id: 'klubb123' }, error: null };
  throw new Error(`ruta leser ikke ${op.table}`);
}
const fake = createAdminClientMock({ tokens: { 'token-meg': ME }, respond });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

const core = vi.hoisted(() => ({
  getCupJoinContext: vi.fn(),
  joinCupCore: vi.fn(),
  leaveCupCore: vi.fn(),
}));
vi.mock('@/lib/cup/getCupJoinContext', () => ({ getCupJoinContext: core.getCupJoinContext }));
vi.mock('@/lib/cup/cupJoinCore', () => ({ joinCupCore: core.joinCupCore, leaveCupCore: core.leaveCupCore }));

import { NextRequest } from 'next/server';
import { DELETE, GET, POST } from './route';

function request(token: string | undefined, method: string, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost/api/cup/join/${CODE}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (shortId = CODE) => ({ params: Promise.resolve({ shortId }) });

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  plan = null;
  core.getCupJoinContext.mockResolvedValue({ cup: CUP, facts: FACTS });
  core.joinCupCore.mockResolvedValue({ ok: true, status: 'joined' });
  core.leaveCupCore.mockResolvedValue({ ok: true, status: 'left' });
});

describe.each([
  ['GET', GET],
  ['POST', POST],
  ['DELETE', DELETE],
] as const)('%s', (method, handler) => {
  it('uten token: 401, og ingenting leses eller skrives', async () => {
    expect((await handler(request(undefined, method), params())).status).toBe(401);
    expect(core.getCupJoinContext).not.toHaveBeenCalled();
    expect(core.joinCupCore).not.toHaveBeenCalled();
    expect(core.leaveCupCore).not.toHaveBeenCalled();
  });

  it('en kode med feil form: 404 før noe leses', async () => {
    expect((await handler(request('token-meg', method), params('../../x'))).status).toBe(404);
    expect(core.getCupJoinContext).not.toHaveBeenCalled();
    expect(core.joinCupCore).not.toHaveBeenCalled();
    expect(core.leaveCupCore).not.toHaveBeenCalled();
  });
});

describe('GET', () => {
  it('kan melde seg på: cupen, banen og tiden', async () => {
    plan = { scheduled_tee_off_at: '2026-11-20T09:30:00.000Z', courses: { name: 'Stiklestad Golfbane' } };

    const body = await (await GET(request('token-meg', 'GET'), params())).json();

    expect(core.getCupJoinContext).toHaveBeenCalledWith(CODE, ME);
    expect(body.decision).toBe('can_join');
    expect(body.cup).toEqual({ id: 'cup', name: 'Klubbmesterskapet', team1Name: 'Team Nord', team2Name: 'Team Sør' });
    expect(body.courseName).toBe('Stiklestad Golfbane');
    expect(body.when.time).toBe('10:30');
    expect(body.canOpenCup).toBe(true);
    expect(body.club).toBeNull();
  });

  it('svaret har aldri hvem som er med, eller hvem som lagde cupen', async () => {
    const text = JSON.stringify(await (await GET(request('token-meg', 'GET'), params())).json());
    expect(text).not.toContain('arrangor');
    expect(text).not.toContain('participant');
  });

  it('en cup som ikke finnes: 404', async () => {
    core.getCupJoinContext.mockResolvedValue({ cup: null, facts: { ...FACTS, cupExists: false } });
    expect((await GET(request('token-meg', 'GET'), params())).status).toBe(404);
  });

  it('en klubb-cup for andre: sier hvilken klubb, og stenger cupens side', async () => {
    core.getCupJoinContext.mockResolvedValue({ cup: { ...CUP, group_id: 'klubb' }, facts: { ...FACTS, groupId: 'klubb' } });
    const body = await (await GET(request('token-meg', 'GET'), params())).json();
    expect(body.decision).toBe('not_member');
    expect(body.club).toEqual({ name: 'Stiklestad GK', shortId: 'klubb123' });
    expect(body.canOpenCup).toBe(false);
  });

  it.each([
    ['closed', { status: 'active' }],
    ['already_joined', { alreadyJoined: true }],
    ['profile_incomplete', { profileCompleted: false }],
    ['full', { participantCount: 40 }],
  ])('%s kommer fra samme regel som nettet', async (decision, patch) => {
    core.getCupJoinContext.mockResolvedValue({ cup: CUP, facts: { ...FACTS, ...patch } });
    const body = await (await GET(request('token-meg', 'GET'), params())).json();
    expect(body.decision).toBe(decision);
    expect(body.cap).toBe(40);
  });

  it('en lesefeil er 500, ikke et nei', async () => {
    core.getCupJoinContext.mockRejectedValue(new Error('boom'));
    expect((await GET(request('token-meg', 'GET'), params())).status).toBe(500);
  });
});

describe('POST', () => {
  it('melder på den som er logget inn, og en kropp endrer ingenting på det', async () => {
    const res = await POST(request('token-meg', 'POST', { userId: 'noen-andre', shortId: 'annen' }), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'joined' });
    expect(core.joinCupCore).toHaveBeenCalledWith(CODE, ME);
  });

  it.each([
    ['not_found', 404],
    ['closed', 409],
    ['full', 409],
    ['not_member', 409],
    ['profile_incomplete', 409],
    ['read_failed', 500],
    ['save_failed', 500],
  ])('%s: %i', async (error, status) => {
    core.joinCupCore.mockResolvedValue({ ok: false, error });
    const res = await POST(request('token-meg', 'POST'), params());
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });
});

describe('DELETE', () => {
  it('melder av den som er logget inn', async () => {
    const res = await DELETE(request('token-meg', 'DELETE'), params());
    expect(await res.json()).toEqual({ status: 'left' });
    expect(core.leaveCupCore).toHaveBeenCalledWith(CODE, ME);
  });

  it('en startet cup: 409', async () => {
    core.leaveCupCore.mockResolvedValue({ ok: false, error: 'closed' });
    expect((await DELETE(request('token-meg', 'DELETE'), params())).status).toBe(409);
  });
});
