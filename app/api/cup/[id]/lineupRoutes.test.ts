// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClientMock, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2752): portene og oversettelsen i uttakets ruter. Reglene har sin egen suite
 * (`lineupActions.test.ts` kjører de samme kjernene), så kjernene er byttet ut her. Her står
 * det rutene svarer for: hvem som slipper inn, at brukeren kommer fra tokenet og aldri fra
 * kroppen, og at en kropp ikke kan velge noe annet enn det kjernen spør om.
 */

const CUP = '44444444-4444-4444-8444-444444444444';
const SESSION = '55555555-5555-4555-8555-555555555555';
const CAPTAIN = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const fake = createAdminClientMock({
  tokens: { 'token-kaptein': CAPTAIN },
  respond: (): QueryResponse => ({ data: null, error: null }),
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

const core = vi.hoisted(() => ({
  setCupParticipantRoleCore: vi.fn(),
  setCupPlannedMatchCountCore: vi.fn(),
  openCupLineupSessionCore: vi.fn(),
  deleteCupLineupSessionCore: vi.fn(),
  submitCupLineupCore: vi.fn(),
  unlockCupLineupCore: vi.fn(),
  retryCupLineupRevealCore: vi.fn(),
  loadCupLineupBoardFor: vi.fn(),
  loadCupLineupAccessForUser: vi.fn(),
}));
vi.mock('@/lib/cup/lineupCore', () => ({
  setCupParticipantRoleCore: core.setCupParticipantRoleCore,
  setCupPlannedMatchCountCore: core.setCupPlannedMatchCountCore,
  openCupLineupSessionCore: core.openCupLineupSessionCore,
  deleteCupLineupSessionCore: core.deleteCupLineupSessionCore,
  submitCupLineupCore: core.submitCupLineupCore,
  unlockCupLineupCore: core.unlockCupLineupCore,
  retryCupLineupRevealCore: core.retryCupLineupRevealCore,
}));
vi.mock('@/lib/cup/lineupData', () => ({ loadCupLineupBoardFor: core.loadCupLineupBoardFor }));
vi.mock('@/lib/cup/lineupAccess', () => ({ loadCupLineupAccessForUser: core.loadCupLineupAccessForUser }));

import { NextRequest } from 'next/server';
import { GET as lineup } from './lineup/route';
import { POST as open } from './lineup/sessions/route';
import { DELETE as remove } from './lineup/sessions/[sessionId]/route';
import { POST as submit } from './lineup/sessions/[sessionId]/submit/route';
import { POST as unlock } from './lineup/sessions/[sessionId]/unlock/route';
import { POST as reveal } from './lineup/sessions/[sessionId]/reveal/route';
import { PUT as planned } from './planned-match-count/route';
import { POST as role } from './participants/[userId]/role/route';

let token: string | undefined;

function request(method: string, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost/api/cup/${CUP}/x`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const cupParams = { params: Promise.resolve({ id: CUP }) };
const sessionParams = { params: Promise.resolve({ id: CUP, sessionId: SESSION }) };
const roleParams = { params: Promise.resolve({ id: CUP, userId: OTHER }) };

const WRITES = [
  ['POST sessions', () => open(request('POST', { format: 'singles_matchplay', slotCount: 2 }), cupParams), core.openCupLineupSessionCore],
  ['DELETE session', () => remove(request('DELETE'), sessionParams), core.deleteCupLineupSessionCore],
  ['POST submit', () => submit(request('POST', { team: 1, slots: [] }), sessionParams), core.submitCupLineupCore],
  ['POST unlock', () => unlock(request('POST', { team: 1 }), sessionParams), core.unlockCupLineupCore],
  ['POST reveal', () => reveal(request('POST'), sessionParams), core.retryCupLineupRevealCore],
  ['PUT planned', () => planned(request('PUT', { plannedMatchCount: 4 }), cupParams), core.setCupPlannedMatchCountCore],
  ['POST role', () => role(request('POST', { teamNumber: 1, isCaptain: true }), roleParams), core.setCupParticipantRoleCore],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  token = 'token-kaptein';
  for (const fn of Object.values(core)) fn.mockReset();
  for (const [, , fn] of WRITES) fn.mockResolvedValue({ error: '' });
  core.loadCupLineupAccessForUser.mockResolvedValue({ role: { kind: 'captain', teamNumber: 1 }, participants: [] });
});

describe('alle skrivene', () => {
  it.each(WRITES)('%s: 401 uten token, og kjernen spørres ikke', async (_name, call, fn) => {
    token = undefined;
    const res = await call();
    expect(res.status).toBe(401);
    expect(fn).not.toHaveBeenCalled();
  });

  it.each(WRITES)('%s: brukeren kommer fra tokenet', async (_name, call, fn) => {
    const res = await call();
    expect(res.status).toBe(200);
    const loadAccess = fn.mock.calls[0][0] as (id: string) => Promise<unknown>;
    await loadAccess(CUP);
    expect(core.loadCupLineupAccessForUser).toHaveBeenCalledWith(CAPTAIN, CUP);
  });

  it.each(WRITES)('%s: et nei fra kjernen blir 403', async (_name, call, fn) => {
    fn.mockResolvedValue({ error: 'not_allowed' });
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_allowed' });
  });

  it.each(WRITES)('%s: en kjerne som kaster, blir 500', async (_name, call, fn) => {
    fn.mockRejectedValue(new Error('nede'));
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'save_failed' });
  });

  it('en id som ikke er en id, er 404 før kjernen', async () => {
    const res = await reveal(request('POST'), { params: Promise.resolve({ id: CUP, sessionId: 'ikke-id' }) });
    expect(res.status).toBe(404);
    expect(core.retryCupLineupRevealCore).not.toHaveBeenCalled();
  });
});

describe('kroppene', () => {
  it('levering: laget og plassene går til kjernen, og ingen bruker fra kroppen', async () => {
    await submit(request('POST', { team: 2, userId: OTHER, slots: [{ slotIndex: 0, userIds: [OTHER] }] }), sessionParams);
    expect(core.submitCupLineupCore.mock.calls[0][1]).toEqual({
      tournamentId: CUP,
      sessionId: SESSION,
      team: 2,
      slots: [{ slotIndex: 0, userIds: [OTHER] }],
    });
  });

  it('levering: et lag som ikke finnes, blir null, og kjernen sier nei til det', async () => {
    await submit(request('POST', { team: 3, slots: [] }), sessionParams);
    expect(core.submitCupLineupCore.mock.calls[0][1].team).toBeNull();
  });

  it('levering: plasser som ikke er en liste, blir null', async () => {
    await submit(request('POST', { team: 1, slots: 'alle' }), sessionParams);
    expect(core.submitCupLineupCore.mock.calls[0][1].slots).toBeNull();
  });

  it('åpning: format og antall', async () => {
    await open(request('POST', { format: 'singles_matchplay', slotCount: 2 }), cupParams);
    expect(core.openCupLineupSessionCore.mock.calls[0][1]).toEqual({ tournamentId: CUP, format: 'singles_matchplay', slotCount: 2 });
  });

  it('planlagt antall: går som tekst, som fra skjemaet', async () => {
    await planned(request('PUT', { plannedMatchCount: 28 }), cupParams);
    expect(core.setCupPlannedMatchCountCore.mock.calls[0][1]).toEqual({ tournamentId: CUP, plannedRaw: '28' });
  });

  it('rolle: spilleren kommer fra stien, og kaptein må være true', async () => {
    await role(request('POST', { teamNumber: null, isCaptain: 'ja', userId: CAPTAIN }), roleParams);
    expect(core.setCupParticipantRoleCore.mock.calls[0][1]).toEqual({
      tournamentId: CUP,
      userId: OTHER,
      teamNumber: null,
      isCaptain: false,
    });
  });

  it('rolle: et lag som ikke finnes, stopper med invalid_team', async () => {
    const res = await role(request('POST', { teamNumber: 3, isCaptain: false }), roleParams);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'invalid_team' });
    expect(core.setCupParticipantRoleCore).not.toHaveBeenCalled();
  });
});

describe('GET lineup', () => {
  const callLineup = () => lineup(request('GET'), cupParams);

  it('401 uten token', async () => {
    token = undefined;
    expect((await callLineup()).status).toBe(401);
  });

  it('403 uten rolle, og tavla leses ikke', async () => {
    core.loadCupLineupAccessForUser.mockResolvedValue({ role: { kind: 'none' }, participants: [] });
    const res = await callLineup();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_allowed' });
    expect(core.loadCupLineupBoardFor).not.toHaveBeenCalled();
  });

  it('en lesing av tilgangen som feilet, er 500, ikke «ingen tilgang»', async () => {
    core.loadCupLineupAccessForUser.mockResolvedValue({ role: { kind: 'none' }, participants: [], readFailed: true });
    expect((await callLineup()).status).toBe(500);
  });

  it('404 når cupen er borte', async () => {
    core.loadCupLineupBoardFor.mockResolvedValue(null);
    expect((await callLineup()).status).toBe(404);
  });

  it('tavla leses med tilgangen fra tokenet', async () => {
    const access = { role: { kind: 'captain', teamNumber: 1 }, participants: [] };
    core.loadCupLineupAccessForUser.mockResolvedValue(access);
    core.loadCupLineupBoardFor.mockResolvedValue({
      access,
      cupName: 'Cup',
      cupStatus: 'active',
      teamNames: { 1: 'Nord', 2: 'Sør' },
      hasDefaultWeights: true,
      plannedMatchCount: null,
      pointsToWin: null,
      matchCount: 0,
      pendingSlotCount: 0,
      squads: { 1: [], 2: [], unassigned: [] },
      sessions: [],
    });
    const res = await callLineup();
    expect(res.status).toBe(200);
    expect((await res.json()).role).toBe('captain');
    expect(core.loadCupLineupBoardFor.mock.calls[0][0]).toBe(access);
  });
});
