// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type A (#2752): portene og oversettelsen i rutene for oppsett og spillerliste.
 * Reglene har sine egne suiter (`planActions.test.ts`, `sideAwardActions.test.ts` og
 * `planValidation.test.ts` kjører de samme kjernene), så kjernene er byttet ut her. Her
 * står det rutene svarer for: hvem som slipper inn, hvem handlingen skrives på, hva en
 * kropp må inneholde, og hvilken status en regel-kode blir.
 */

const CUP = '44444444-4444-4444-8444-444444444444';
const MANAGER = '11111111-1111-4111-8111-111111111111';
const OUTSIDER = '99999999-9999-4999-8999-999999999999';
const PLAYER = '22222222-2222-4222-8222-222222222222';
const COURSE = '33333333-3333-4333-8333-333333333333';
const TEE = '55555555-5555-4555-8555-555555555555';

let cupRow: Record<string, unknown> | null = {
  id: CUP,
  name: 'Klubbmesterskapet',
  status: 'draft',
  team_1_name: 'Team Nord',
  team_2_name: 'Team Sør',
  short_id: 'abcd2345',
  group_id: null,
};
let planRow: Record<string, unknown> | null = null;
let awardRows: unknown[] = [];
let participantRows: unknown[] = [];

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'tournaments') return { data: cupRow, error: null };
  if (op.table === 'tournament_plans') return { data: planRow, error: null };
  if (op.table === 'tournament_side_awards') return { data: awardRows, error: null };
  if (op.table === 'tournament_participants') return { data: participantRows, error: null };
  throw new Error(`ruta leser ikke ${op.table} med admin-klienten`);
}

const fake = createAdminClientMock({
  tokens: { 'token-sjef': MANAGER, 'token-fremmed': OUTSIDER },
  respond,
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

let caller: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/api/appAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/appAuth')>();
  return { ...actual, callerScopedClient: () => caller };
});

const core = vi.hoisted(() => ({
  saveCupPlanCore: vi.fn(),
  addCupParticipantCore: vi.fn(),
  removeCupParticipantCore: vi.fn(),
  revalidateCupSetup: vi.fn(),
  saveSideAwardConfigCore: vi.fn(),
  revalidateCupSideAwards: vi.fn(),
  getCupCandidatePlayers: vi.fn(),
}));
vi.mock('@/lib/cup/setupCore', () => ({
  saveCupPlanCore: core.saveCupPlanCore,
  addCupParticipantCore: core.addCupParticipantCore,
  removeCupParticipantCore: core.removeCupParticipantCore,
  revalidateCupSetup: core.revalidateCupSetup,
}));
vi.mock('@/lib/cup/sideAwardCore', () => ({
  saveSideAwardConfigCore: core.saveSideAwardConfigCore,
  revalidateCupSideAwards: core.revalidateCupSideAwards,
}));
vi.mock('@/lib/cup/getCupCandidatePlayers', () => ({ getCupCandidatePlayers: core.getCupCandidatePlayers }));

import { NextRequest } from 'next/server';
import { GET as setup } from './setup/route';
import { PUT as plan } from './plan/route';
import { PUT as sideAwards } from './side-awards/route';
import { GET as participants, POST as addPlayer } from './participants/route';
import { DELETE as removePlayer } from './participants/[userId]/route';

function request(token: string | undefined, method: string, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost/api/cup/${CUP}/x`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const asManager = (allowed = true, isAdmin = false) => {
  caller = buildSupabaseMock(
    [],
    { can_manage_tournament: allowed },
    { byTable: { users: [{ data: { is_admin: isAdmin, name: 'Anne' }, error: null }] } },
  );
};

let token: string | undefined;
const cupParams = { params: Promise.resolve({ id: CUP }) };
const playerParams = { params: Promise.resolve({ id: CUP, userId: PLAYER }) };

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
const PLAN_BODY = {
  courseId: COURSE,
  teeBoxId: TEE,
  teeOffAt: FUTURE,
  presetId: 'klassisk',
  customSessions: null,
  strategy: 'handicap',
  bestBallAllowancePct: null,
};
const callPlan = (body: unknown = PLAN_BODY) => plan(request(token, 'PUT', body), cupParams);
const callAwards = (body: unknown = { awards: [] }) => sideAwards(request(token, 'PUT', body), cupParams);
const callAdd = (body: unknown = { userId: PLAYER }) => addPlayer(request(token, 'POST', body), cupParams);

const ROUTES = [
  ['GET setup', () => setup(request(token, 'GET'), cupParams)],
  ['PUT plan', () => callPlan()],
  ['PUT side-awards', () => callAwards()],
  ['GET participants', () => participants(request(token, 'GET'), cupParams)],
  ['POST participants', () => callAdd()],
  ['DELETE participants', () => removePlayer(request(token, 'DELETE'), playerParams)],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  token = 'token-sjef';
  asManager();
  cupRow = {
    id: CUP,
    name: 'Klubbmesterskapet',
    status: 'draft',
    team_1_name: 'Team Nord',
    team_2_name: 'Team Sør',
    short_id: 'abcd2345',
    group_id: null,
  };
  planRow = null;
  awardRows = [];
  participantRows = [];
  core.saveCupPlanCore.mockResolvedValue({ ok: true });
  core.addCupParticipantCore.mockResolvedValue({ ok: true });
  core.removeCupParticipantCore.mockResolvedValue({ ok: true });
  core.saveSideAwardConfigCore.mockResolvedValue({ ok: true });
  core.getCupCandidatePlayers.mockResolvedValue([]);
});

describe.each(ROUTES)('porten: %s', (_name, call) => {
  it('uten token: 401, og ingenting skrives', async () => {
    token = undefined;
    expect((await call()).status).toBe(401);
    expect(core.saveCupPlanCore).not.toHaveBeenCalled();
    expect(core.addCupParticipantCore).not.toHaveBeenCalled();
    expect(core.removeCupParticipantCore).not.toHaveBeenCalled();
    expect(core.saveSideAwardConfigCore).not.toHaveBeenCalled();
  });

  it('en annen bruker: 403, og ingen kan endre planen eller lista', async () => {
    token = 'token-fremmed';
    asManager(false);
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_manager' });
    expect(core.saveCupPlanCore).not.toHaveBeenCalled();
    expect(core.addCupParticipantCore).not.toHaveBeenCalled();
    expect(core.removeCupParticipantCore).not.toHaveBeenCalled();
    expect(core.saveSideAwardConfigCore).not.toHaveBeenCalled();
  });

  it('en cup som ikke finnes: 404', async () => {
    cupRow = null;
    expect((await call()).status).toBe(404);
  });

  it('arrangøren slipper inn', async () => {
    expect((await call()).status).toBe(200);
  });
});

describe('PUT plan', () => {
  it('skrives med verdiene fra kroppen, og tiden som UTC', async () => {
    expect((await callPlan()).status).toBe(200);
    expect(core.saveCupPlanCore).toHaveBeenCalledWith(fake.client, {
      tournamentId: CUP,
      courseId: COURSE,
      teeBoxId: TEE,
      scheduledTeeOffAt: FUTURE,
      values: { presetId: 'klassisk', strategy: 'handicap', customSessions: null, bestBallAllowancePct: null },
    });
    expect(core.revalidateCupSetup).toHaveBeenCalledWith(CUP, null);
  });

  it('uten tid: arrangøren starter rundene selv', async () => {
    await callPlan({ ...PLAN_BODY, teeOffAt: null });
    expect(core.saveCupPlanCore.mock.calls[0][1]).toMatchObject({ scheduledTeeOffAt: null });
  });

  it('sammensatte økter fra nettet går tilbake som de er', async () => {
    await callPlan({ ...PLAN_BODY, presetId: 'tilpasset', customSessions: ['singles_matchplay'] });
    expect(core.saveCupPlanCore.mock.calls[0][1].values).toMatchObject({
      presetId: 'tilpasset',
      customSessions: ['singles_matchplay'],
    });
  });

  it.each([
    ['plan_preset', { presetId: 'ukjent' }],
    ['plan_strategy', { strategy: 'ukjent' }],
    ['plan_sessions', { presetId: 'tilpasset', customSessions: [] }],
    ['plan_best_ball', { bestBallAllowancePct: 101 }],
    ['plan_course', { courseId: '' }],
    ['plan_tee', { teeBoxId: '' }],
    ['plan_tee_off_invalid', { teeOffAt: 'i morgen' }],
    ['plan_tee_off_invalid', { teeOffAt: 7 }],
    ['plan_tee_off_past', { teeOffAt: '2020-01-01T10:00:00.000Z' }],
  ])('%s: 409, og ingenting skrives (%j)', async (error, patch) => {
    const res = await callPlan({ ...PLAN_BODY, ...patch });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error });
    expect(core.saveCupPlanCore).not.toHaveBeenCalled();
  });

  it.each([
    ['not_draft', 409],
    ['plan_course', 409],
    ['plan_tee', 409],
    ['not_found', 404],
    ['plan_save_failed', 500],
  ])('kjernen sier %s: %i', async (error, status) => {
    core.saveCupPlanCore.mockResolvedValue({ ok: false, error });
    const res = await callPlan();
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
    expect(core.revalidateCupSetup).not.toHaveBeenCalled();
  });

  it('planen er lagret, men kampene fikk den ikke: 502, og cachene bustes', async () => {
    core.saveCupPlanCore.mockResolvedValue({ ok: false, error: 'plan_matches_not_updated' });
    const res = await callPlan();
    expect(res.status).toBe(502);
    expect(core.revalidateCupSetup).toHaveBeenCalledWith(CUP, null);
  });
});

describe('PUT side-awards', () => {
  const award = { kind: 'ctp', holeNumber: 7, points: 1, winnerCount: 1 };

  it('hele lista går til kjernen', async () => {
    expect((await callAwards({ awards: [award] })).status).toBe(200);
    expect(core.saveSideAwardConfigCore).toHaveBeenCalledWith(fake.client, { tournamentId: CUP, awards: [award] });
    expect(core.revalidateCupSideAwards).toHaveBeenCalledWith(CUP, null);
  });

  it('en kropp uten liste: 400', async () => {
    expect((await callAwards({ awards: 'alle' })).status).toBe(400);
    expect(core.saveSideAwardConfigCore).not.toHaveBeenCalled();
  });

  it('noe annet enn rader i lista: 409, før kjernen leser felt på dem', async () => {
    const res = await callAwards({ awards: [null] });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'invalid_side_award' });
    expect(core.saveSideAwardConfigCore).not.toHaveBeenCalled();
  });

  it.each(['invalid_side_award', 'duplicate_side_award', 'cup_started', 'cup_finished', 'winners_already_registered'])(
    '%s: 409, sidepoeng kan ikke endres etter start',
    async (error) => {
      core.saveSideAwardConfigCore.mockResolvedValue({ ok: false, error });
      const res = await callAwards({ awards: [award] });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error });
    },
  );
});

describe('GET setup', () => {
  it('gir planen og sidepoengene slik skjemaet på nettet leser dem', async () => {
    planRow = {
      course_id: COURSE,
      tee_box_id: TEE,
      scheduled_tee_off_at: FUTURE,
      preset_id: 'singler',
      custom_sessions: null,
      strategy: 'random',
      best_ball_allowance_pct: 90,
    };
    awardRows = [
      { kind: 'ctp', hole_number: 7, points: '1', gir_max_per_team: null },
      { kind: 'ctp', hole_number: 7, points: '1', gir_max_per_team: null },
      { kind: 'gir', hole_number: 12, points: '0.5', gir_max_per_team: 4 },
    ];

    const body = await (await setup(request(token, 'GET'), cupParams)).json();

    expect(body).toMatchObject({ id: CUP, name: 'Klubbmesterskapet', status: 'draft', team1Name: 'Team Nord' });
    expect(body.plan).toEqual({
      courseId: COURSE,
      teeBoxId: TEE,
      teeOffAt: FUTURE,
      presetId: 'singler',
      customSessions: null,
      strategy: 'random',
      bestBallAllowancePct: 90,
    });
    expect(body.sideAwards).toEqual([
      { kind: 'ctp', holeNumber: 7, points: 1, winnerCount: 2 },
      { kind: 'gir', holeNumber: 12, points: 0.5, maxPerTeam: 4 },
    ]);
  });

  it('uten plan ennå: null', async () => {
    const body = await (await setup(request(token, 'GET'), cupParams)).json();
    expect(body.plan).toBeNull();
    expect(body.sideAwards).toEqual([]);
  });
});

describe('GET participants', () => {
  const candidate = (id: string, pending = false) => ({ id, displayName: `Navn ${id}`, hcpIndex: 12.4, pending });

  it('lista, lenka og taket, og de som alt er med, står ikke som kandidater', async () => {
    participantRows = [
      { user_id: PLAYER, team_number: 2, is_captain: true, users: { name: 'Ola Kompis', nickname: 'Ola', hcp_index: '8.1' } },
    ];
    core.getCupCandidatePlayers.mockResolvedValue([candidate(PLAYER), candidate('ny'), candidate('venter', true)]);

    const body = await (await participants(request(token, 'GET'), cupParams)).json();

    expect(body).toMatchObject({ shortId: 'abcd2345', cap: 40, status: 'draft' });
    expect(body.participants).toEqual([{ userId: PLAYER, name: 'Ola Kompis', hcpIndex: 8.1, teamNumber: 2, isCaptain: true }]);
    expect(body.candidates).toEqual([
      { userId: 'ny', name: 'Navn ny', hcpIndex: 12.4, pending: false },
      { userId: 'venter', name: 'Navn venter', hcpIndex: 12.4, pending: true },
    ]);
    expect(core.getCupCandidatePlayers.mock.calls[0][1]).toMatchObject({ userId: MANAGER, isAdmin: false, groupId: null });
  });

  it('global admin og klubb-cup har ikke tak', async () => {
    asManager(true, true);
    const admin = await (await participants(request(token, 'GET'), cupParams)).json();
    expect(admin.cap).toBeNull();
  });

  it('en startet cup: lista står, og ingen å legge til', async () => {
    cupRow = { ...cupRow, status: 'active' };
    const body = await (await participants(request(token, 'GET'), cupParams)).json();
    expect(body.candidates).toEqual([]);
    expect(core.getCupCandidatePlayers).not.toHaveBeenCalled();
  });
});

describe('POST participants', () => {
  it('skrives av arrangøren, med kilden for kallerens rolle', async () => {
    expect((await callAdd()).status).toBe(200);
    expect(core.addCupParticipantCore).toHaveBeenCalledWith(fake.client, caller, {
      tournamentId: CUP,
      targetUserId: PLAYER,
      actor: { userId: MANAGER, isAdmin: false },
      groupId: null,
    });
    expect(core.revalidateCupSetup).toHaveBeenCalledWith(CUP, null);
  });

  it.each([[{}], [{ userId: 'x' }], [{ userId: 7 }]])('kroppen %j: 400', async (body) => {
    expect((await callAdd(body)).status).toBe(400);
    expect(core.addCupParticipantCore).not.toHaveBeenCalled();
  });

  it.each(['not_draft', 'not_candidate', 'too_many_players'])('%s: 409', async (error) => {
    core.addCupParticipantCore.mockResolvedValue({ ok: false, error });
    const res = await callAdd();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error });
    expect(core.revalidateCupSetup).not.toHaveBeenCalled();
  });
});

describe('DELETE participants', () => {
  it('skrives med spilleren fra stien', async () => {
    expect((await removePlayer(request(token, 'DELETE'), playerParams)).status).toBe(200);
    expect(core.removeCupParticipantCore).toHaveBeenCalledWith(fake.client, { tournamentId: CUP, targetUserId: PLAYER });
  });

  it('en startet cup: 409', async () => {
    core.removeCupParticipantCore.mockResolvedValue({ ok: false, error: 'not_draft' });
    expect((await removePlayer(request(token, 'DELETE'), playerParams)).status).toBe(409);
  });

  it('et id som ikke er en uuid: 404 uten kall', async () => {
    const res = await removePlayer(request(token, 'DELETE'), { params: Promise.resolve({ id: CUP, userId: 'x' }) });
    expect(res.status).toBe(404);
    expect(core.removeCupParticipantCore).not.toHaveBeenCalled();
  });
});
