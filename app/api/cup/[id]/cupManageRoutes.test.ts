// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import type { CupSnapshot } from '@/lib/cup/getCupSnapshot';

/**
 * Type A (#2752): portene og oversettelsen i appens ruter for å styre en cup.
 * Reglene og skrivingen har sine egne suiter (`withdrawalActions.test.ts` og
 * `actions.test.ts` kjører de samme kjernene), så de er byttet ut her. Her står
 * det rutene svarer for: hvem som slipper inn, hvem handlingen skrives på, hva en
 * kropp må inneholde, og hvilken status en regel-kode blir.
 */

const CUP = '44444444-4444-4444-8444-444444444444';
const GAME = '55555555-5555-4555-8555-555555555555';
const MANAGER = '11111111-1111-4111-8111-111111111111';
const OUTSIDER = '99999999-9999-4999-8999-999999999999';
const TARGET = '22222222-2222-4222-8222-222222222222';
const RESERVE = '33333333-3333-4333-8333-333333333333';

let tournaments: unknown[] = [{ group_id: null }];
let tournamentError: { message: string } | null = null;

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'tournaments') return { data: tournaments[0] ?? null, error: tournamentError };
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
  withdrawCupPlayerCore: vi.fn(),
  withdrawSelfFromCupCore: vi.fn(),
  undoCupWithdrawalCore: vi.fn(),
  setFourballWithdrawalChoiceCore: vi.fn(),
  revalidateCup: vi.fn(),
  swapCupMatchPlayerCore: vi.fn(),
  expireCupSwapCaches: vi.fn(),
  getCupSnapshot: vi.fn(),
  getCupCandidatePlayers: vi.fn(),
  loadCupWithdrawalContext: vi.fn(),
}));
vi.mock('@/lib/cup/withdrawalCore', () => ({
  withdrawCupPlayerCore: core.withdrawCupPlayerCore,
  withdrawSelfFromCupCore: core.withdrawSelfFromCupCore,
  undoCupWithdrawalCore: core.undoCupWithdrawalCore,
  setFourballWithdrawalChoiceCore: core.setFourballWithdrawalChoiceCore,
  revalidateCup: core.revalidateCup,
}));
vi.mock('@/lib/cup/swapCupMatchPlayerCore', () => ({
  swapCupMatchPlayerCore: core.swapCupMatchPlayerCore,
  expireCupSwapCaches: core.expireCupSwapCaches,
}));
vi.mock('@/lib/cup/getCupSnapshot', () => ({ getCupSnapshot: core.getCupSnapshot }));
vi.mock('@/lib/cup/getCupCandidatePlayers', () => ({
  getCupCandidatePlayers: core.getCupCandidatePlayers,
}));
vi.mock('@/lib/cup/cupWithdrawalContext', () => ({
  loadCupWithdrawalContext: core.loadCupWithdrawalContext,
}));

import { NextRequest } from 'next/server';
import { GET as manage } from './manage/route';
import { GET as withdrawal } from './withdrawal/route';
import { POST as withdraw } from './withdraw/route';
import { POST as undo } from './withdraw/undo/route';
import { POST as withdrawSelf } from './withdraw-self/route';
import { POST as playOn } from './matches/[gameId]/play-on/route';
import { GET as swapCandidates } from './matches/[gameId]/swap-candidates/route';
import { POST as swap } from './matches/[gameId]/swap/route';

const snapshot = {
  tournament: {
    id: CUP,
    name: 'Klubbmesterskapet',
    status: 'active',
    group_id: null,
    team_1_name: 'Team Nord',
    team_2_name: 'Team Sør',
  },
  leaderboard: {
    matches: [
      {
        gameId: GAME,
        matchLabel: 'Singel 1',
        team1PlayerName: 'Ola',
        team2PlayerName: 'Kari',
        gameMode: 'singles_matchplay',
        status: 'scheduled',
        team1UserIds: [TARGET],
        team2UserIds: ['kari'],
      },
    ],
  },
  roster: {
    team1: [{ userId: TARGET, name: 'Ola', nickname: null, withdrawn: false }],
    team2: [{ userId: 'kari', name: 'Kari', nickname: null, withdrawn: false }],
  },
} as unknown as CupSnapshot;

function request(token: string | undefined, path: string, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const cupParams = { params: Promise.resolve({ id: CUP }) };
const matchParams = { params: Promise.resolve({ id: CUP, gameId: GAME }) };
const asManager = (allowed = true) => {
  caller = buildSupabaseMock(
    [],
    { can_manage_tournament: allowed },
    { byTable: { users: [{ data: { is_admin: false }, error: null }] } },
  );
};

/** The routes only the cup's manager may call, with a body the route accepts. */
const MANAGER_ROUTES = [
  ['GET manage', () => manage(request(currentToken, `/api/cup/${CUP}/manage`), cupParams)],
  ['GET withdrawal for en annen', () => withdrawal(request(currentToken, `/api/cup/${CUP}/withdrawal?userId=${TARGET}`), cupParams)],
  ['POST withdraw', () => withdraw(request(currentToken, `/api/cup/${CUP}/withdraw`, { userId: TARGET }), cupParams)],
  ['POST withdraw/undo', () => undo(request(currentToken, `/api/cup/${CUP}/withdraw/undo`, { userId: TARGET }), cupParams)],
  ['POST play-on', () => playOn(request(currentToken, `/api/cup/${CUP}/matches/${GAME}/play-on`, { playOn: true }), matchParams)],
  ['GET swap-candidates', () => swapCandidates(request(currentToken, `/api/cup/${CUP}/matches/${GAME}/swap-candidates`), matchParams)],
  ['POST swap', () => swap(request(currentToken, `/api/cup/${CUP}/matches/${GAME}/swap`, { outUserId: TARGET, inUserId: RESERVE }), matchParams)],
] as const;
let currentToken: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  tournaments = [{ group_id: null }];
  tournamentError = null;
  currentToken = 'token-sjef';
  asManager();
  core.getCupSnapshot.mockResolvedValue(snapshot);
  core.getCupCandidatePlayers.mockResolvedValue([]);
  core.loadCupWithdrawalContext.mockResolvedValue({
    tournament: snapshot.tournament,
    player: { userId: TARGET, name: 'Ola' },
    pending: [],
    untouched: [{ gameId: GAME, matchLabel: 'Singel 1' }],
  });
  core.withdrawCupPlayerCore.mockResolvedValue({ writtenGameIds: [GAME], skippedGameIds: [] });
  core.withdrawSelfFromCupCore.mockResolvedValue({
    groupId: null,
    writtenGameIds: [GAME],
    skippedGameIds: [],
  });
  core.undoCupWithdrawalCore.mockResolvedValue({ undoneGameIds: [GAME] });
  core.setFourballWithdrawalChoiceCore.mockResolvedValue({ gameId: GAME });
  core.swapCupMatchPlayerCore.mockResolvedValue({ gameIds: [GAME] });
});

describe.each(MANAGER_ROUTES)('porten: %s', (_name, call) => {
  it('uten token: 401, og ingenting skrives eller leses', async () => {
    currentToken = undefined;
    expect((await call()).status).toBe(401);
    expect(core.getCupSnapshot).not.toHaveBeenCalled();
  });

  it('en utenforstående: 403, med databasens eget svar på hvem som styrer', async () => {
    currentToken = 'token-fremmed';
    asManager(false);
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_manager' });
    expect(caller.__rpcCalls).toEqual([
      { name: 'can_manage_tournament', params: { p_tournament_id: CUP } },
    ]);
    for (const fn of [
      core.withdrawCupPlayerCore,
      core.undoCupWithdrawalCore,
      core.setFourballWithdrawalChoiceCore,
      core.swapCupMatchPlayerCore,
      core.getCupSnapshot,
      core.loadCupWithdrawalContext,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('en cup som ikke finnes: 404', async () => {
    tournaments = [];
    expect((await call()).status).toBe(404);
  });

  it('en lesefeil er 500, ikke et nei', async () => {
    tournamentError = { message: 'boom' };
    expect((await call()).status).toBe(500);
  });

  it('arrangøren slipper inn', async () => {
    expect((await call()).status).toBe(200);
  });
});

describe('trekket', () => {
  it('arrangørens trekk skrives på spilleren, av arrangøren, med valgene fra skjemaet', async () => {
    const res = await withdraw(
      request('token-sjef', `/api/cup/${CUP}/withdraw`, {
        userId: TARGET,
        playOnGameIds: [GAME, 'ikke-en-uuid'],
        offeredGameIds: [GAME],
      }),
      cupParams,
    );
    expect(await res.json()).toEqual({ ok: true, partial: false });
    const [, args] = core.withdrawCupPlayerCore.mock.calls[0];
    expect(args).toMatchObject({ tournamentId: CUP, userId: TARGET, byUserId: MANAGER });
    expect([...args.playOnGameIds]).toEqual([GAME]);
    expect([...args.offeredGameIds]).toEqual([GAME]);
    expect(core.revalidateCup).toHaveBeenCalledWith(CUP, null, [GAME]);
  });

  it('kamper som rakk å starte: delvis, og cachene for dem bustes også', async () => {
    core.withdrawCupPlayerCore.mockResolvedValue({ writtenGameIds: [GAME], skippedGameIds: ['annen'] });
    const res = await withdraw(request('token-sjef', `/api/cup/${CUP}/withdraw`, { userId: TARGET }), cupParams);
    expect(await res.json()).toEqual({ ok: true, partial: true });
    expect(core.revalidateCup).toHaveBeenCalledWith(CUP, null, [GAME, 'annen']);
  });

  it.each([{}, { userId: 'ola' }])('en kropp uten gyldig spiller: 400 (%j)', async (body) => {
    const res = await withdraw(request('token-sjef', `/api/cup/${CUP}/withdraw`, body), cupParams);
    expect(res.status).toBe(400);
    expect(core.withdrawCupPlayerCore).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', 404],
    ['wrong_status', 409],
    ['no_pending_matches', 409],
    ['withdraw_failed', 500],
    ['noe_ukjent', 500],
  ])('regelens %s blir %i, uten å bruste cachene', async (error, status) => {
    core.withdrawCupPlayerCore.mockResolvedValue({ error });
    const res = await withdraw(request('token-sjef', `/api/cup/${CUP}/withdraw`, { userId: TARGET }), cupParams);
    expect(res.status).toBe(status);
    expect(core.revalidateCup).not.toHaveBeenCalled();
  });

  it('en spiller trekker seg selv: skrevet på seg selv, uten arrangørens port', async () => {
    const res = await withdrawSelf(request('token-fremmed', `/api/cup/${CUP}/withdraw-self`, {}), cupParams);
    expect(res.status).toBe(200);
    expect(core.withdrawSelfFromCupCore.mock.calls[0][1]).toEqual({ tournamentId: CUP, userId: OUTSIDER });
  });

  it('selv-trekk uten kamper i cupen: 403', async () => {
    core.withdrawSelfFromCupCore.mockResolvedValue({ error: 'not_participant' });
    const res = await withdrawSelf(request('token-fremmed', `/api/cup/${CUP}/withdraw-self`, {}), cupParams);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_participant' });
  });

  it('selv-trekk uten token: 401', async () => {
    expect((await withdrawSelf(request(undefined, `/api/cup/${CUP}/withdraw-self`, {}), cupParams)).status).toBe(401);
    expect(core.withdrawSelfFromCupCore).not.toHaveBeenCalled();
  });
});

describe('bekreftelsen', () => {
  it('uten userId: spillerens eget, og uten arrangørens port', async () => {
    currentToken = 'token-fremmed';
    asManager(false);
    const res = await withdrawal(request('token-fremmed', `/api/cup/${CUP}/withdrawal`), cupParams);
    expect(res.status).toBe(200);
    expect(core.loadCupWithdrawalContext.mock.calls[0][0]).toMatchObject({ userId: OUTSIDER });
    expect((await res.json()).player).toMatchObject({ isSelf: true });
  });

  it('den som ikke står i noen kamp: 404, ingenting å bekrefte', async () => {
    core.loadCupWithdrawalContext.mockResolvedValue({
      tournament: snapshot.tournament,
      player: { userId: OUTSIDER, name: 'Ukjent' },
      pending: [],
      untouched: [],
    });
    expect((await withdrawal(request('token-fremmed', `/api/cup/${CUP}/withdrawal`), cupParams)).status).toBe(404);
  });

  it('en klubb-cup er stengt for en utenforstående, som cup-siden', async () => {
    core.getCupSnapshot.mockResolvedValue({
      ...snapshot,
      tournament: { ...snapshot.tournament, group_id: 'klubb' },
    });
    caller = buildSupabaseMock([], {}, {
      byTable: {
        group_members: [{ data: null, error: null }],
        users: [{ data: { is_admin: false }, error: null }],
        tournament_participants: [{ data: null, error: null }],
      },
    });
    expect((await withdrawal(request('token-fremmed', `/api/cup/${CUP}/withdrawal`), cupParams)).status).toBe(404);
    expect(core.loadCupWithdrawalContext).not.toHaveBeenCalled();
  });
});

describe('makkervalget', () => {
  it('valget sendes videre, og må være en boolean', async () => {
    await playOn(request('token-sjef', `/api/cup/${CUP}/matches/${GAME}/play-on`, { playOn: false }), matchParams);
    expect(core.setFourballWithdrawalChoiceCore.mock.calls[0][1]).toEqual({
      tournamentId: CUP,
      gameId: GAME,
      playOn: false,
    });
    const bad = await playOn(request('token-sjef', `/api/cup/${CUP}/matches/${GAME}/play-on`, { playOn: 'ja' }), matchParams);
    expect(bad.status).toBe(400);
  });
});

describe('byttet', () => {
  it('byttet skrives av arrangøren, og cachene for hele bunten bustes', async () => {
    core.swapCupMatchPlayerCore.mockResolvedValue({ gameIds: [GAME, 'avledet'] });
    const res = await swap(
      request('token-sjef', `/api/cup/${CUP}/matches/${GAME}/swap`, { outUserId: TARGET, inUserId: RESERVE }),
      matchParams,
    );
    expect(res.status).toBe(200);
    const [, clientAsCaller, args] = core.swapCupMatchPlayerCore.mock.calls[0];
    expect(clientAsCaller).toBe(caller);
    expect(args).toEqual({
      tournamentId: CUP,
      gameId: GAME,
      groupId: null,
      actorUserId: MANAGER,
      actorIsAdmin: false,
      outUserId: TARGET,
      inUserId: RESERVE,
    });
    expect(core.expireCupSwapCaches).toHaveBeenCalledWith(CUP, [GAME, 'avledet']);
    expect(core.revalidateCup).toHaveBeenCalledWith(CUP, null, [GAME, 'avledet']);
  });

  it.each([
    ['not_found', 404],
    ['already_started', 409],
    ['too_many_players', 409],
    ['swap_failed', 500],
  ])('regelens %s blir %i', async (error, status) => {
    core.swapCupMatchPlayerCore.mockResolvedValue({ error });
    const res = await swap(
      request('token-sjef', `/api/cup/${CUP}/matches/${GAME}/swap`, { outUserId: TARGET, inUserId: RESERVE }),
      matchParams,
    );
    expect(res.status).toBe(status);
    expect(core.expireCupSwapCaches).not.toHaveBeenCalled();
  });

  it('en kropp uten to gyldige spillere: 400', async () => {
    const res = await swap(request('token-sjef', `/api/cup/${CUP}/matches/${GAME}/swap`, { outUserId: TARGET }), matchParams);
    expect(res.status).toBe(400);
    expect(core.swapCupMatchPlayerCore).not.toHaveBeenCalled();
  });

  it('kandidater til en kamp i en annen cup: 404', async () => {
    const other = { params: Promise.resolve({ id: CUP, gameId: '66666666-6666-4666-8666-666666666666' }) };
    const res = await swapCandidates(request('token-sjef', `/api/cup/${CUP}/matches/x/swap-candidates`), other);
    expect(res.status).toBe(404);
  });
});
