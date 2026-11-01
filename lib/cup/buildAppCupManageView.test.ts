import { describe, it, expect } from 'vitest';
import { buildAppCupManageView, buildAppCupSwapCandidates } from './buildAppCupManageView';
import type { CupSnapshot } from './getCupSnapshot';

/** Type A (#2752): det «Styr cupen» og byttet får vite, ren funksjon av snapshotet. */

const match = (gameId: string, overrides: Record<string, unknown> = {}) => ({
  gameId,
  matchLabel: gameId,
  team1PlayerName: 'Ola',
  team2PlayerName: 'Kari',
  gameMode: 'singles_matchplay',
  status: 'scheduled',
  team1UserIds: ['ola'],
  team2UserIds: ['kari'],
  ...overrides,
});

const snapshot = (status: string, matches: unknown[], withdrawn: string[] = []) =>
  ({
    tournament: {
      id: 'cup',
      name: 'Klubbmesterskapet',
      status,
      team_1_name: 'Team Nord',
      team_2_name: 'Team Sør',
    },
    leaderboard: { matches },
    roster: {
      team1: [
        { userId: 'ola', name: 'Ola Kompis', nickname: null, withdrawn: withdrawn.includes('ola') },
        { userId: 'tapp', name: 'Testspiller Tapp', nickname: null, withdrawn: false },
      ],
      team2: [{ userId: 'kari', name: 'Kari Arrangør', nickname: 'Kari', withdrawn: false }],
    },
  }) as unknown as CupSnapshot;

const view = (snap: CupSnapshot) => buildAppCupManageView(snap, { unknownLabel: 'Ukjent spiller' });

describe('spillerne', () => {
  it('står per lag, med trekk-merket, og lenken bare med en kamp igjen i en cup som går', () => {
    const body = view(
      snapshot('active', [match('a', { status: 'active', team1UserIds: ['tapp'] }), match('b')], ['ola']),
    );
    expect(body.players).toEqual([
      { userId: 'ola', name: 'Ola Kompis', team: 1, withdrawn: true, canAct: true },
      { userId: 'tapp', name: 'Testspiller Tapp', team: 1, withdrawn: false, canAct: false },
      { userId: 'kari', name: 'Kari', team: 2, withdrawn: false, canAct: true },
    ]);
  });

  it.each(['draft', 'finished'])('en cup i %s: ingen lenker', (status) => {
    expect(view(snapshot(status, [match('a')])).players.every((p) => !p.canAct)).toBe(true);
  });
});

describe('kampene', () => {
  it('bare de som ikke har startet', () => {
    const body = view(
      snapshot('active', [
        match('startet', { status: 'active' }),
        match('ferdig', { status: 'finished' }),
        match('planlagt'),
        match('utkast', { status: 'draft' }),
      ]),
    );
    expect(body.matches.map((m) => m.gameId)).toEqual(['planlagt', 'utkast']);
  });

  it('bare en planlagt kamp uten trekk kan få byttet spiller (E6)', () => {
    const body = view(
      snapshot('active', [
        match('fri'),
        match('utkast', { status: 'draft' }),
        match('trukket', { withdrawal: { outcome: 'halved', withdrawnSide: 1, withdrawnUserIds: ['ola'] } }),
        match('alene', { soloPlayOn: { partnerName: 'Tapp' } }),
      ]),
    );
    expect(body.matches.map((m) => [m.gameId, m.canSwap])).toEqual([
      ['fri', true],
      ['utkast', false],
      ['trukket', false],
      ['alene', false],
    ]);
  });
});

describe('makkervalget', () => {
  const fourball = (overrides: Record<string, unknown>) =>
    match('fb', {
      gameMode: 'fourball_matchplay',
      team1UserIds: ['ola', 'tapp'],
      withdrawal: { outcome: 'halved', withdrawnSide: 1, withdrawnUserIds: ['ola'] },
      ...overrides,
    });

  it('venter på arrangøren: makkeren står igjen, og statusen sier det', () => {
    const [row] = view(snapshot('active', [fourball({ playOnChoicePending: true })])).matches;
    expect(row.choice).toEqual({ partnerName: 'Testspiller Tapp', pending: true, playOn: false });
    expect(row.status).toBe('playOnPending');
  });

  it('valget er tatt: alene', () => {
    const [row] = view(
      snapshot('active', [fourball({ withdrawal: null, soloPlayOn: { partnerName: 'Tapp' } })]),
    ).matches;
    expect(row.choice).toEqual({ partnerName: 'Tapp', pending: false, playOn: true });
  });

  it.each([
    ['ikke fourball', { gameMode: 'foursomes_matchplay' }],
    ['ikke planlagt', { status: 'draft' }],
    ['ingen makker igjen', { team1UserIds: ['ola'] }],
    ['begge sider trukket', { withdrawal: { outcome: 'halved', withdrawnSide: 'both', withdrawnUserIds: ['ola', 'kari'] } }],
  ])('%s: ingen valg', (_case, overrides) => {
    expect(view(snapshot('active', [fourball(overrides)])).matches[0].choice).toBeNull();
  });

  it('en cup som ikke går: ingen valg', () => {
    expect(view(snapshot('finished', [fourball({})])).matches[0].choice).toBeNull();
  });
});

describe('kandidatene til et bytte', () => {
  const candidates = [
    { id: 'berit', displayName: 'Berit' },
    { id: 'ola', displayName: 'Ola Kompis' },
    { id: 'vent', displayName: 'Venn uten profil', pending: true },
    { id: 'anne', displayName: 'Anne' },
  ];
  const swap = (snap: CupSnapshot, gameId: string) =>
    buildAppCupSwapCandidates(snap, { gameId, candidates, unknownLabel: 'Ukjent spiller' });

  it('ut er spillerne i kampen, med lag. Inn er resten, uten ventende, sortert', () => {
    expect(swap(snapshot('active', [match('a')]), 'a')).toMatchObject({
      blocked: null,
      bundled: false,
      out: [
        { userId: 'ola', name: 'Ola Kompis', teamName: 'Team Nord' },
        { userId: 'kari', name: 'Kari', teamName: 'Team Sør' },
      ],
      in: [
        { userId: 'anne', name: 'Anne' },
        { userId: 'berit', name: 'Berit' },
      ],
    });
  });

  it('en delt dag: hele bunten, også fra det avledede kortet, og reserven står ikke i noen av dem', () => {
    const snap = snapshot('active', [
      match('vert', { team1UserIds: ['tapp'], team2UserIds: ['kari'] }),
      match('avledet', { sourceGameId: 'vert', team1UserIds: ['ola'], team2UserIds: ['kari'] }),
      match('annen', { team1UserIds: ['anne'], team2UserIds: ['kari'] }),
    ]);
    const body = swap(snap, 'avledet');
    expect(body?.bundled).toBe(true);
    expect(body?.out.map((o) => o.userId)).toEqual(['tapp', 'kari', 'ola']);
    expect(body?.in.map((o) => o.userId)).toEqual(['anne', 'berit']);
  });

  it('en startet kamp i bunten stopper byttet, med vaktas egen kode', () => {
    const snap = snapshot('active', [
      match('vert', { status: 'active' }),
      match('avledet', { sourceGameId: 'vert' }),
    ]);
    expect(swap(snap, 'avledet')?.blocked).toBe('already_started');
    expect(view(snap).matches.map((m) => [m.gameId, m.canSwap])).toEqual([['avledet', false]]);
  });

  it('et trekk et annet sted i bunten stopper byttet, og kortet og skjermen er enige', () => {
    const snap = snapshot('active', [
      match('vert', { withdrawal: { outcome: 'halved', withdrawnSide: 1, withdrawnUserIds: ['ola'] } }),
      match('avledet', { sourceGameId: 'vert' }),
    ]);
    expect(swap(snap, 'avledet')?.blocked).toBe('match_has_withdrawal');
    expect(view(snap).matches.map((m) => [m.gameId, m.canSwap])).toEqual([
      ['vert', false],
      ['avledet', false],
    ]);
  });

  it('en kamp i en annen cup: null', () => {
    expect(swap(snapshot('active', [match('a')]), 'fremmed')).toBeNull();
  });
});
