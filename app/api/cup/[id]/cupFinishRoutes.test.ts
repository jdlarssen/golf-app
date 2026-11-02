// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type A (#2752): portene og oversettelsen i rutene for sidepoeng og avslutning.
 * Reglene har sine egne suiter (`actions.test.ts`, `sideAwardActions.test.ts` og
 * `finishCupMatchCore.test.ts`), så kjernene er byttet ut her. Her står det rutene
 * svarer for: hvem som slipper inn, hvem handlingen skrives på, hva en kropp må
 * inneholde, og hvilken status en regel-kode blir.
 */

const CUP = '44444444-4444-4444-8444-444444444444';
const GAME = '55555555-5555-4555-8555-555555555555';
const AWARD = '66666666-6666-4666-8666-666666666666';
const MANAGER = '11111111-1111-4111-8111-111111111111';
const OUTSIDER = '99999999-9999-4999-8999-999999999999';
const WINNER = '22222222-2222-4222-8222-222222222222';

let tournaments: unknown[] = [{ group_id: 'klubb' }];

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'tournaments') return { data: tournaments[0] ?? null, error: null };
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
  finishTournamentCore: vi.fn(),
  finishCupMatchCore: vi.fn(),
  registerGirCountsCore: vi.fn(),
  registerSideAwardWinnerCore: vi.fn(),
  revalidateCupSideAwards: vi.fn(),
  revalidateCup: vi.fn(),
}));
vi.mock('@/lib/cup/finishTournamentCore', () => ({ finishTournamentCore: core.finishTournamentCore }));
vi.mock('@/lib/cup/finishCupMatchCore', () => ({ finishCupMatchCore: core.finishCupMatchCore }));
vi.mock('@/lib/cup/sideAwardCore', () => ({
  registerGirCountsCore: core.registerGirCountsCore,
  registerSideAwardWinnerCore: core.registerSideAwardWinnerCore,
  revalidateCupSideAwards: core.revalidateCupSideAwards,
}));
vi.mock('@/lib/cup/withdrawalCore', () => ({ revalidateCup: core.revalidateCup }));

import { NextRequest } from 'next/server';
import { POST as finishCup } from './finish/route';
import { POST as finishMatch } from './matches/[gameId]/finish/route';
import { POST as winner } from './side-awards/[awardId]/winner/route';
import { POST as gir } from './side-awards/[awardId]/gir/route';

function request(token: string | undefined, path: string, body: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

const asManager = (allowed = true, name: string | null = 'Anne Admin') => {
  caller = buildSupabaseMock(
    [],
    { can_manage_tournament: allowed },
    { byTable: { users: [{ data: { is_admin: false, name }, error: null }] } },
  );
};

let currentToken: string | undefined;
const cupParams = { params: Promise.resolve({ id: CUP }) };
const matchParams = { params: Promise.resolve({ id: CUP, gameId: GAME }) };
const awardParams = { params: Promise.resolve({ id: CUP, awardId: AWARD }) };
const callFinishCup = (body: unknown = {}) => finishCup(request(currentToken, `/api/cup/${CUP}/finish`, body), cupParams);
const callFinishMatch = (body: unknown = {}) =>
  finishMatch(request(currentToken, `/api/cup/${CUP}/matches/${GAME}/finish`, body), matchParams);
const callWinner = (body: unknown = { winnerUserId: WINNER }) =>
  winner(request(currentToken, `/api/cup/${CUP}/side-awards/${AWARD}/winner`, body), awardParams);
const callGir = (body: unknown = { team1Count: 2, team2Count: 3 }) =>
  gir(request(currentToken, `/api/cup/${CUP}/side-awards/${AWARD}/gir`, body), awardParams);

const ROUTES = [
  ['POST finish', () => callFinishCup()],
  ['POST matches/finish', () => callFinishMatch()],
  ['POST side-awards/winner', () => callWinner()],
  ['POST side-awards/gir', () => callGir()],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  tournaments = [{ group_id: 'klubb' }];
  currentToken = 'token-sjef';
  asManager();
  core.finishTournamentCore.mockResolvedValue({ ok: true, alreadyFinished: false });
  core.finishCupMatchCore.mockResolvedValue({ ok: true, alreadyFinished: false, gameIds: [GAME] });
  core.registerGirCountsCore.mockResolvedValue({ ok: true });
  core.registerSideAwardWinnerCore.mockResolvedValue({ ok: true });
});

describe.each(ROUTES)('porten: %s', (_name, call) => {
  it('uten token: 401, og ingenting skrives', async () => {
    currentToken = undefined;
    expect((await call()).status).toBe(401);
    for (const fn of Object.values(core)) expect(fn).not.toHaveBeenCalled();
  });

  it('en utenforstående: 403, med databasens eget svar på hvem som styrer', async () => {
    currentToken = 'token-fremmed';
    asManager(false);
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_manager' });
    expect(caller.__rpcCalls).toEqual([{ name: 'can_manage_tournament', params: { p_tournament_id: CUP } }]);
    for (const fn of Object.values(core)) expect(fn).not.toHaveBeenCalled();
  });

  it('en cup som ikke finnes: 404', async () => {
    tournaments = [];
    expect((await call()).status).toBe(404);
  });

  // Kriterium: klubbadmin som ikke selv lagde kampene. Porten spør databasen, ikke `created_by`.
  it('den databasen sier styrer, slipper inn', async () => {
    expect((await call()).status).toBe(200);
  });
});

describe('POST finish', () => {
  it('skrives av arrangøren, med samme kjerne som nettet', async () => {
    const res = await callFinishCup({ allowMissing: true });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyFinished: false });
    expect(core.finishTournamentCore).toHaveBeenCalledWith(fake.client, caller, {
      tournamentId: CUP,
      actor: { id: MANAGER, name: 'Anne Admin' },
      allowMissing: true,
      unknownLabel: expect.any(String),
    });
    expect(core.revalidateCup).toHaveBeenCalledWith(CUP, 'klubb', []);
  });

  it('allowMissing er av med mindre det står true', async () => {
    await callFinishCup({ allowMissing: 'ja' });
    expect(core.finishTournamentCore.mock.calls[0][2]).toMatchObject({ allowMissing: false });
  });

  it('uten navn: «Arrangør» i loggen', async () => {
    asManager(true, '   ');
    await callFinishCup();
    expect(core.finishTournamentCore.mock.calls[0][2].actor.name).toBe('Arrangør');
  });

  it('et nytt forsøk på en avsluttet cup er suksess', async () => {
    core.finishTournamentCore.mockResolvedValue({ ok: true, alreadyFinished: true });
    const res = await callFinishCup();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyFinished: true });
  });

  it.each([
    ['not_found', 404],
    ['side_awards_missing', 409],
    ['matches_not_submitted', 409],
    ['match_finish_failed', 502],
    ['finish_failed', 500],
  ])('%s blir %i, og cachene røres ikke', async (error, status) => {
    core.finishTournamentCore.mockResolvedValue({ ok: false, error });
    const res = await callFinishCup();
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
    expect(core.revalidateCup).not.toHaveBeenCalled();
  });
});

describe('POST matches/finish', () => {
  it('skrives av arrangøren, og cachene til verten bustes', async () => {
    core.finishCupMatchCore.mockResolvedValue({ ok: true, alreadyFinished: false, gameIds: ['vert'] });

    const res = await callFinishMatch({ allowMissing: true });

    expect(res.status).toBe(200);
    expect(core.finishCupMatchCore).toHaveBeenCalledWith(fake.client, {
      tournamentId: CUP,
      gameId: GAME,
      actor: { id: MANAGER, name: 'Anne Admin' },
      allowMissing: true,
    });
    expect(core.revalidateCup).toHaveBeenCalledWith(CUP, 'klubb', ['vert']);
  });

  it('et kamp-id som ikke er en uuid: 404 uten kall', async () => {
    const res = await finishMatch(request(currentToken, `/api/cup/${CUP}/matches/x/finish`, {}), {
      params: Promise.resolve({ id: CUP, gameId: 'x' }),
    });
    expect(res.status).toBe(404);
    expect(core.finishCupMatchCore).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', 404],
    ['not_active', 409],
    ['no_players', 409],
    ['not_all_submitted', 409],
    ['not_all_approved', 409],
    ['finish_failed', 500],
  ])('%s blir %i', async (error, status) => {
    core.finishCupMatchCore.mockResolvedValue({ ok: false, error });
    const res = await callFinishMatch();
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });
});

describe('POST side-awards/winner', () => {
  it('vinneren skrives, og siden til cupen bustes', async () => {
    expect((await callWinner()).status).toBe(200);
    expect(core.registerSideAwardWinnerCore).toHaveBeenCalledWith(fake.client, {
      tournamentId: CUP,
      awardId: AWARD,
      winnerUserId: WINNER,
    });
    expect(core.revalidateCupSideAwards).toHaveBeenCalledWith(CUP, 'klubb');
  });

  it('null er «ingen kvalifiserte»', async () => {
    expect((await callWinner({ winnerUserId: null })).status).toBe(200);
    expect(core.registerSideAwardWinnerCore.mock.calls[0][1]).toMatchObject({ winnerUserId: null });
  });

  it.each([[{}], [{ winnerUserId: 'x' }], [{ winnerUserId: 7 }]])('kroppen %j: 400', async (body) => {
    const res = await callWinner(body);
    expect(res.status).toBe(400);
    expect(core.registerSideAwardWinnerCore).not.toHaveBeenCalled();
  });

  it('en spiller utenfor cupen: 409', async () => {
    core.registerSideAwardWinnerCore.mockResolvedValue({ ok: false, error: 'not_a_participant' });
    const res = await callWinner();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'not_a_participant' });
    expect(core.revalidateCupSideAwards).not.toHaveBeenCalled();
  });
});

describe('POST side-awards/gir', () => {
  it('tellerne skrives', async () => {
    expect((await callGir()).status).toBe(200);
    expect(core.registerGirCountsCore).toHaveBeenCalledWith(fake.client, {
      tournamentId: CUP,
      awardId: AWARD,
      team1Count: 2,
      team2Count: 3,
    });
    expect(core.revalidateCupSideAwards).toHaveBeenCalledWith(CUP, 'klubb');
  });

  it.each([[{}], [{ team1Count: 1 }], [{ team1Count: '1', team2Count: 2 }]])('kroppen %j: 400', async (body) => {
    const res = await callGir(body);
    expect(res.status).toBe(400);
    expect(core.registerGirCountsCore).not.toHaveBeenCalled();
  });

  it('tall utenfor grensen: 409', async () => {
    core.registerGirCountsCore.mockResolvedValue({ ok: false, error: 'invalid_counts' });
    const res = await callGir();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'invalid_counts' });
  });

  it('et sidepoeng-id som ikke er en uuid: 404', async () => {
    const res = await gir(request(currentToken, `/api/cup/${CUP}/side-awards/x/gir`, { team1Count: 1, team2Count: 1 }), {
      params: Promise.resolve({ id: CUP, awardId: 'x' }),
    });
    expect(res.status).toBe(404);
  });
});
