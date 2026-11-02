// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type A (#2752): portene og oversettelsen i rutene for kampene og start. Reglene har
 * sine egne suiter (`generer/actions.test.ts` og `lib/cup/actions.test.ts` kjører de
 * samme kjernene), så kjernene er byttet ut her. Her står det rutene svarer for: hvem
 * som slipper inn, hvilken klient som skriver, at et nytt forsøk ikke lager kampene to
 * ganger, og hvilken status en regel-kode blir.
 */

const CUP = '44444444-4444-4444-8444-444444444444';
const MANAGER = '11111111-1111-4111-8111-111111111111';
const OUTSIDER = '99999999-9999-4999-8999-999999999999';
const A = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';

let cupRow: Record<string, unknown> | null;
let gameCount: number;
let gamesError: { message: string } | null;

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'tournaments') return { data: cupRow, error: null };
  if (op.table === 'games') return { data: null, count: gameCount, error: gamesError } as QueryResponse;
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
  generateCupMatchesCore: vi.fn(),
  revalidateCupGenerated: vi.fn(),
  startTournamentCore: vi.fn(),
  revalidateCupStarted: vi.fn(),
  loadCupGenerateInput: vi.fn(),
}));
vi.mock('@/lib/cup/generateMatchesCore', () => ({
  generateCupMatchesCore: core.generateCupMatchesCore,
  revalidateCupGenerated: core.revalidateCupGenerated,
}));
vi.mock('@/lib/cup/startTournamentCore', () => ({
  startTournamentCore: core.startTournamentCore,
  revalidateCupStarted: core.revalidateCupStarted,
}));
vi.mock('@/lib/cup/loadCupGenerateInput', () => ({ loadCupGenerateInput: core.loadCupGenerateInput }));

import { NextRequest } from 'next/server';
import { GET as generate } from './generate/route';
import { POST as matches } from './matches/route';
import { POST as start } from './start/route';

function request(authToken: string | undefined, method: string, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (authToken) headers.authorization = `Bearer ${authToken}`;
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
const params = { params: Promise.resolve({ id: CUP }) };
const MATCH = { id: 'singles_matchplay-1', format: 'singles_matchplay', label: 'Singel 1', side1: [A], side2: [B], segment: 'full' };
const BODY = { matches: [MATCH], expectedExisting: 0 };
const callMatches = (body: unknown = BODY) => matches(request(token, 'POST', body), params);
const callStart = () => start(request(token, 'POST'), params);
const callGenerate = () => generate(request(token, 'GET'), params);

const ROUTES = [
  ['GET generate', callGenerate],
  ['POST matches', () => callMatches()],
  ['POST start', callStart],
] as const;

const INPUT = {
  participants: [{ id: A, displayName: 'Ola', hcpIndex: 12, gender: 'mens' }],
  planCourseName: 'Stiklestad',
  planTeeName: 'Gul',
  selectedTee: { id: 'tee', name: 'Gul' },
  presetId: 'singler',
  customSessions: [],
  strategy: 'handicap',
};

beforeEach(() => {
  vi.clearAllMocks();
  token = 'token-sjef';
  cupRow = { name: 'Klubbmesterskapet', status: 'draft', team_1_name: 'Team Nord', team_2_name: 'Team Sør', group_id: null };
  gameCount = 0;
  gamesError = null;
  asManager();
  core.generateCupMatchesCore.mockResolvedValue({ ok: true, groupId: null });
  core.startTournamentCore.mockResolvedValue({ ok: true });
  core.loadCupGenerateInput.mockResolvedValue(INPUT);
});

describe('portene', () => {
  it.each(ROUTES)('%s: 401 uten token', async (_name, call) => {
    token = undefined;
    const res = await call();
    expect(res.status).toBe(401);
    expect(core.generateCupMatchesCore).not.toHaveBeenCalled();
    expect(core.startTournamentCore).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('%s: 403 for den som ikke styrer cupen', async (_name, call) => {
    token = 'token-fremmed';
    asManager(false);
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_manager' });
    expect(core.generateCupMatchesCore).not.toHaveBeenCalled();
    expect(core.startTournamentCore).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('%s: 404 når cupen ikke finnes', async (_name, call) => {
    cupRow = null;
    expect((await call()).status).toBe(404);
  });
});

describe('GET generate', () => {
  it('gir planen, de påmeldte, taket og antall kamper', async () => {
    gameCount = 3;
    const res = await callGenerate();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: CUP,
      name: 'Klubbmesterskapet',
      status: 'draft',
      team1Name: 'Team Nord',
      team2Name: 'Team Sør',
      matchCap: 36,
      existingMatchCount: 3,
      plan: {
        courseName: 'Stiklestad',
        teeName: 'Gul',
        tee: INPUT.selectedTee,
        presetId: 'singler',
        customSessions: [],
        strategy: 'handicap',
      },
      players: INPUT.participants,
    });
  });

  it('uten bane og tee er planen null', async () => {
    core.loadCupGenerateInput.mockResolvedValue({ ...INPUT, selectedTee: undefined });
    expect((await (await callGenerate()).json()).plan).toBeNull();
  });

  it('administrator og klubb-cup har ikke tak', async () => {
    asManager(true, true);
    expect((await (await callGenerate()).json()).matchCap).toBeNull();
    asManager();
    cupRow = { ...cupRow, group_id: '55555555-5555-4555-8555-555555555555' };
    expect((await (await callGenerate()).json()).matchCap).toBeNull();
  });
});

describe('POST matches', () => {
  it('skriver med arrangørens egen klient, og oppdaterer cup-sidene', async () => {
    const res = await callMatches();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(core.generateCupMatchesCore).toHaveBeenCalledTimes(1);
    const [client, input] = core.generateCupMatchesCore.mock.calls[0];
    expect(client).toBe(caller);
    expect(input).toEqual({ tournamentId: CUP, userId: MANAGER, isAdmin: false, matches: [MATCH] });
    expect(core.revalidateCupGenerated).toHaveBeenCalledWith(CUP, null);
  });

  it('kampene finnes alt: et nytt forsøk skriver ingenting', async () => {
    gameCount = 1;
    const res = await callMatches();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'matches_changed' });
    expect(core.generateCupMatchesCore).not.toHaveBeenCalled();
  });

  it('fikk vi ikke telt, skrives ingenting', async () => {
    gamesError = { message: 'nede' };
    expect((await callMatches()).status).toBe(500);
    expect(core.generateCupMatchesCore).not.toHaveBeenCalled();
  });

  it.each([
    ['uten kamper', { expectedExisting: 0 }],
    ['uten antall', { matches: [MATCH] }],
    ['håndlaget kamp', { matches: [{ ...MATCH, format: 'stableford' }], expectedExisting: 0 }],
  ])('400 %s', async (_name, body) => {
    const res = await callMatches(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_request' });
    expect(core.generateCupMatchesCore).not.toHaveBeenCalled();
  });

  it.each([
    ['not_draft', 409],
    ['no_matches', 409],
    ['missing_plan', 409],
    ['plan_tee', 409],
    ['tee_off_in_past', 409],
    ['not_members', 409],
    ['too_many_matches', 409],
    ['too_many_players', 409],
    ['invalid_team_strokes_override', 409],
    ['invalid_source_match', 409],
    ['not_found', 404],
    ['profile_read_failed', 500],
    ['rollback_failed', 500],
    ['insert_failed', 500],
  ] as const)('koden %s blir %s', async (code, status) => {
    core.generateCupMatchesCore.mockResolvedValue({ error: code });
    const res = await callMatches();
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: code });
    expect(core.revalidateCupGenerated).not.toHaveBeenCalled();
  });
});

describe('POST start', () => {
  it('starter med arrangørens klient, og oppdaterer cup-sidene', async () => {
    const res = await callStart();
    expect(res.status).toBe(200);
    expect(core.startTournamentCore).toHaveBeenCalledWith(caller, CUP);
    expect(core.revalidateCupStarted).toHaveBeenCalledWith(CUP, null);
  });

  it.each([
    ['too_few_matches', 409],
    ['wrong_status', 409],
    ['not_found', 404],
    ['start_failed', 500],
  ] as const)('koden %s blir %s', async (code, status) => {
    core.startTournamentCore.mockResolvedValue({ ok: false, error: code });
    const res = await callStart();
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: code });
    expect(core.revalidateCupStarted).not.toHaveBeenCalled();
  });
});
