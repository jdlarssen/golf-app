// native/app/src/data/teamPage.test.ts
// #2840 del 3: svarene fra lagsidens rute, sett fra appen (Type A). Reglene er på
// serveren. Her testes oversettelsen, formsjekken, at kroppen bare har det ruta leser,
// og at ingenting sendes uten nett.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter mockene */
import { BASE_URL, mockFetch, mockNetwork, requestInit, respondWith, useWebRoute } from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

const SHORT_ID = 'abcd2345';
const PATH = `${BASE_URL}/api/pamelding/${SHORT_ID}/lag`;
const GAME = {
  id: 'g1',
  shortId: SHORT_ID,
  name: 'Onsdagsgolfen',
  courseName: 'Byneset',
  joinEffect: 'instant',
  signupsClosed: false,
  teamSize: 4,
  teeOffAt: '2026-11-19T17:30:00.000Z',
};
const CAPTAIN = {
  kind: 'captain',
  game: GAME,
  myRowId: 'r1',
  myStatus: 'approved',
  teamName: 'Birdie-jegerne',
  captain: { requestId: 'r1', userId: 'u1', displayName: 'Martin Berg', status: 'approved' },
  members: [{ requestId: 'r2', userId: 'u2', displayName: 'Ola Kompis', status: 'pending', isGuest: false }],
  unavailableFriendIds: ['u9'],
};

function teamPage(): typeof import('./teamPage') {
  return require('./teamPage') as typeof import('./teamPage');
}

describe('fetchTeamPage', () => {
  useWebRoute();

  it('#2840: en titt (raden «Laget ditt») spør uten å telle som besøk', async () => {
    respondWith(200, CAPTAIN);
    expect(await teamPage().fetchTeamPage(SHORT_ID, { visit: false })).toEqual({ ok: true, view: CAPTAIN });
    expect(mockFetch).toHaveBeenCalledWith(`${PATH}?visit=0`, expect.objectContaining({ method: 'GET' }));
  });

  it('spør lagsidens sti og leser kapteinens visning', async () => {
    respondWith(200, CAPTAIN);
    expect(await teamPage().fetchTeamPage(SHORT_ID)).toEqual({ ok: true, view: CAPTAIN });
    expect(mockFetch).toHaveBeenCalledWith(PATH, expect.objectContaining({ method: 'GET' }));
  });

  it.each([
    ['ingen lag', { kind: 'no_team', game: GAME }],
    ['påmeldt alene', { kind: 'solo', game: GAME }],
    ['et lag vi ikke finner', { kind: 'team_unknown', game: GAME, noCaptain: true }],
    [
      'en gammel invitasjon',
      { kind: 'invited_unknown', game: GAME, invitationId: 'i1', captainName: 'Kari Nord', teamName: null },
    ],
  ])('%s', async (_label, body) => {
    respondWith(200, body);
    expect(await teamPage().fetchTeamPage(SHORT_ID)).toEqual({ ok: true, view: body });
  });

  it('en eldre server uten lagstørrelse, tid og venner gir ingen ledige plasser og ingen grå venner', async () => {
    const { teamSize: _s, teeOffAt: _t, ...oldGame } = GAME;
    const { unavailableFriendIds: _u, ...older } = CAPTAIN;
    respondWith(200, { ...older, game: oldGame });
    expect(await teamPage().fetchTeamPage(SHORT_ID)).toEqual({
      ok: true,
      view: { ...CAPTAIN, game: { ...GAME, teamSize: null, teeOffAt: null }, unavailableFriendIds: [] },
    });
  });

  it('en medspiller uten gjeste-flagg er en gjest, som på serveren, og en rad med feil form faller bort', async () => {
    respondWith(200, {
      ...CAPTAIN,
      members: [{ requestId: 'r3', userId: 'u3', displayName: null, status: 'approved' }, { requestId: 'r4' }],
    });
    const result = await teamPage().fetchTeamPage(SHORT_ID);
    expect(result.ok && result.view.kind === 'captain' && result.view.members).toEqual([
      { requestId: 'r3', userId: 'u3', displayName: null, status: 'approved', isGuest: true },
    ]);
  });

  it.each([
    [401, {}, 'unauthorized'],
    [404, { error: 'game_not_found' }, 'not_found'],
    [500, { error: 'load_failed' }, 'load_failed'],
    [200, { ...CAPTAIN, kind: 'noe_nytt' }, 'load_failed'],
    [200, { ...CAPTAIN, game: null }, 'load_failed'],
    [200, { ...CAPTAIN, myStatus: 'kanskje' }, 'load_failed'],
    [200, { kind: 'invited_unknown', game: GAME }, 'load_failed'],
  ])('oversetter %i %j til %s', async (status, body, reason) => {
    respondWith(status, body);
    expect(await teamPage().fetchTeamPage(SHORT_ID)).toEqual({ ok: false, reason });
  });

  it('sender ingenting uten nett', async () => {
    mockNetwork.online = false;
    expect(await teamPage().fetchTeamPage(SHORT_ID)).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('handlingene', () => {
  useWebRoute();

  it.each([
    ['removeTeammate', ['r2'], { intent: 'remove', requestId: 'r2' }, 'removed'],
    ['resendInvite', ['r2'], { intent: 'resend', requestId: 'r2' }, 'resent'],
    ['transferCaptaincy', ['r2'], { intent: 'transfer', requestId: 'r2' }, 'transferred'],
    ['attachToTeam', ['i1'], { intent: 'attach', invitationId: 'i1' }, 'attached'],
    ['addTeammate', ['u5'], { intent: 'add', friendId: 'u5' }, 'added'],
    ['addTeammate', ['u5', 'r3'], { intent: 'add', friendId: 'u5', replaceRequestId: 'r3' }, 'added'],
  ] as const)('%s(%j) sender %j', async (fn, args, body, status) => {
    respondWith(200, { status });
    const call = teamPage()[fn] as (shortId: string, ...rest: string[]) => Promise<unknown>;
    expect(await call(SHORT_ID, ...args)).toEqual({ ok: true, status });
    expect(mockFetch).toHaveBeenCalledWith(PATH, expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(requestInit().body as string)).toEqual(body);
  });

  it('«Bytt» sier om den gamle raden gikk', async () => {
    respondWith(200, { status: 'added', replaced: true });
    expect(await teamPage().addTeammate(SHORT_ID, 'u5', 'r3')).toEqual({ ok: true, status: 'added', replaced: true });
  });

  it.each([
    [401, {}, 'unauthorized'],
    [403, { error: 'teammate_not_friend' }, 'teammate_not_friend'],
    [404, { error: 'not_found' }, 'not_found'],
    [409, { error: 'captain_is_guest' }, 'captain_is_guest'],
    [409, { error: 'team_full' }, 'team_full'],
    [409, { error: 'noe_nytt' }, 'db_error'],
    [500, { error: 'db_error' }, 'db_error'],
    [200, { status: 'noe_nytt' }, 'db_error'],
  ])('oversetter %i %j til %s', async (status, body, reason) => {
    respondWith(status, body);
    expect(await teamPage().removeTeammate(SHORT_ID, 'r2')).toEqual({ ok: false, reason });
  });

  it('sender ingenting uten nett', async () => {
    mockNetwork.online = false;
    expect(await teamPage().resendInvite(SHORT_ID, 'r2')).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
