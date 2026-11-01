// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildAppCupView } from './buildAppCupView';
import type { CupSnapshot } from './getCupSnapshot';

// Type A (#2752): what the app may know about a cup. The rule that matters most
// is the owner's from #1468: nothing about the result until the cup is finished.
const ME = 'me';

type Match = CupSnapshot['leaderboard']['matches'][number];

const match = (gameId: string, overrides: Partial<Match> = {}): Match => ({
  gameId,
  matchLabel: `Kamp ${gameId}`,
  team1PlayerName: 'Ola',
  team2PlayerName: 'Kari',
  gameMode: 'singles_matchplay',
  status: 'scheduled',
  result: null,
  sourceGameId: null,
  allScorecardsSubmitted: false,
  allPlayersWithdrawn: false,
  team1UserIds: ['ola'],
  team2UserIds: ['kari'],
  createdBy: 'organiser',
  withdrawal: null,
  soloPlayOn: null,
  playOnChoicePending: false,
  pointsTeam1: 0,
  pointsTeam2: 0,
  ...overrides,
});

const snapshot = (
  status: 'draft' | 'active' | 'finished',
  matches: Match[],
  extra: Partial<CupSnapshot['leaderboard']> = {},
): CupSnapshot =>
  ({
    tournament: {
      id: 'cup-1',
      name: 'Klubbmesterskapet',
      team_1_name: 'Team Nord',
      team_2_name: 'Team Sør',
      points_to_win: 14.5,
      status,
      winner_team: null,
      created_by: 'organiser',
      created_at: '2026-11-01T08:00:00Z',
      started_at: '2026-11-01T09:00:00Z',
      finished_at: null,
      group_id: null,
      win_points: 1,
      tie_points: 0.5,
    },
    leaderboard: {
      team1Name: 'Team Nord',
      team2Name: 'Team Sør',
      team1Points: 7,
      team2Points: 3,
      pointsToWin: 14.5,
      winner: status === 'finished' ? 1 : null,
      matches,
      finishedMatches: matches.filter((m) => m.status === 'finished').length,
      remainingMatches: matches.filter((m) => m.status !== 'finished').length,
      sideAwardPoints: { team1: 2, team2: 1 },
      ...extra,
    },
    roster: {
      team1: [{ userId: 'ola', name: 'Ola Kompis', nickname: null, withdrawn: false }],
      team2: [{ userId: 'kari', name: 'Kari Arrangør', nickname: 'Kari', withdrawn: false }],
    },
    sideAwards: [],
    performanceInputs: [],
  }) as unknown as CupSnapshot;

const view = (snap: CupSnapshot, userId = ME, lineupPending = false, readable: string[] = []) =>
  buildAppCupView(snap, {
    userId,
    lineupPending,
    unknownLabel: 'Ukjent spiller',
    readableGameIds: new Set(readable),
    canManage: false,
  });

describe('hvilke kamper appen kan åpne (#1542)', () => {
  const games = [match('min-utkast', { status: 'draft', team1UserIds: [ME] }), match('annen', { status: 'active' })];

  it('følger det RLS lar kalleren lese, ikke hvem som spiller', () => {
    // En spiller: egen kamp i utkast er skjult, så ingen knapp.
    expect(view(snapshot('active', games), ME, false, []).matches.map((m) => [m.gameId, m.mine, m.canOpen])).toEqual([
      ['min-utkast', true, false],
      ['annen', false, false],
    ]);
    // Arrangøren eller admin: leser alle, og spiller ingen av dem.
    expect(
      view(snapshot('active', games), 'arrangor', false, ['min-utkast', 'annen']).matches.map((m) => m.canOpen),
    ).toEqual([true, true]);
  });
});

describe('«Trekk meg fra cupen»', () => {
  const planned = match('kamp', { status: 'scheduled', team1UserIds: [ME] });

  it('står med en kamp igjen i en cup som går, som lenka på cup-siden', () => {
    expect(view(snapshot('active', [planned])).canWithdrawSelf).toBe(true);
    expect(view(snapshot('active', [match('annen', { status: 'scheduled' })])).canWithdrawSelf).toBe(false);
    expect(view(snapshot('active', [{ ...planned, status: 'active' }])).canWithdrawSelf).toBe(false);
    expect(view(snapshot('finished', [planned])).canWithdrawSelf).toBe(false);
  });
});

describe('uttaket', () => {
  it('en ferdig cup venter ikke på kapteinene, selv om en økt aldri ble avdekket', () => {
    expect(view(snapshot('active', []), ME, true).lineupPending).toBe(true);
    expect(view(snapshot('finished', []), ME, true).lineupPending).toBe(false);
  });
});

describe('hemmeligheten mens cupen pågår (#1468)', () => {
  const finished = match('ferdig', {
    status: 'finished',
    result: { winnerSide: 1, formatted: '3&2' },
    pointsTeam1: 1,
  });

  it.each(['draft', 'active'] as const)('%s: ingen resultater og ingen utfall i svaret', (status) => {
    const body = view(snapshot(status, [finished]));

    expect(body.results).toBeNull();
    expect(body.matches[0].outcome).toBeNull();
  });

  it('hele JSON-svaret mens cupen pågår inneholder verken poeng, vinner eller resultattekst', () => {
    const json = JSON.stringify(view(snapshot('active', [finished])));

    for (const secret of ['team1Points', 'pointsTeam1', 'points1', 'winner', '3&2', 'sideAwardPoints', 'mvp']) {
      expect(json).not.toContain(secret);
    }
  });

  it('en spilt kamp sier «spilt», ikke hvem som vant', () => {
    expect(view(snapshot('active', [finished])).matches[0].status).toBe('played');
  });

  it('fremdriften og poengmålet er ingen hemmelighet', () => {
    const body = view(snapshot('active', [finished, match('neste')]));

    expect(body.pointsToWin).toBe(14.5);
    expect(body.progress).toEqual({ played: 1, total: 2 });
  });
});

describe('kampene', () => {
  it('dine kamper står først, så etter status', () => {
    const body = view(
      snapshot('active', [
        match('spilt', { status: 'finished' }),
        match('ikke-startet'),
        match('min-spilt', { status: 'finished', team1UserIds: [ME] }),
        match('pagar', { status: 'active' }),
        match('levert', { status: 'active', allScorecardsSubmitted: true }),
        match('min-pagar', { status: 'active', team2UserIds: [ME] }),
      ]),
    );

    expect(body.matches.map((m) => [m.gameId, m.mine])).toEqual([
      ['min-pagar', true],
      ['min-spilt', true],
      ['pagar', false],
      ['levert', false],
      ['ikke-startet', false],
      ['spilt', false],
    ]);
  });

  it('holder lik rekkefølge innenfor samme status', () => {
    const body = view(snapshot('active', [match('a'), match('b'), match('c')]));

    expect(body.matches.map((m) => m.gameId)).toEqual(['a', 'b', 'c']);
  });

  it('en kamp avgjort ved trekk sier hvem som trakk seg og hvem som fikk den', () => {
    const body = view(
      snapshot('active', [
        match('walkover', {
          withdrawal: { outcome: 'walkover', winnerSide: 2, withdrawnUserIds: ['ola'] },
        } as unknown as Partial<Match>),
      ]),
    );

    expect(body.matches[0]).toMatchObject({
      status: 'decidedWalkover',
      withdrawnName: 'Ola Kompis',
      walkoverTeam: 'Team Sør',
    });
  });

  it('kallenavnet går foran navnet, og en ukjent spiller får reserveordet', () => {
    const body = view(
      snapshot('active', [
        match('kari', { withdrawal: { outcome: 'halved', winnerSide: null, withdrawnUserIds: ['kari'] } } as unknown as Partial<Match>),
        match('borte', { withdrawal: { outcome: 'halved', winnerSide: null, withdrawnUserIds: ['borte'] } } as unknown as Partial<Match>),
      ]),
    );

    expect(body.matches.map((m) => m.withdrawnName)).toEqual(['Kari', 'Ukjent spiller']);
  });

  it('venter arrangøren med valget om makkeren spiller alene, sier statusen det', () => {
    const body = view(
      snapshot('active', [
        match('valg', {
          gameMode: 'fourball_matchplay',
          team1UserIds: ['ola', 'mate'],
          team2UserIds: ['kari', 'per'],
          playOnChoicePending: true,
          withdrawal: { outcome: 'halved', winnerSide: null, withdrawnSide: 1, withdrawnUserIds: ['ola'] },
        } as unknown as Partial<Match>),
      ]),
    );

    expect(body.matches[0].status).toBe('playOnPending');
  });

  it('sier hvem som spiller alene', () => {
    const body = view(snapshot('active', [match('solo', { soloPlayOn: { partnerName: 'Ola' } })]));

    expect(body.matches[0].soloPartnerName).toBe('Ola');
  });
});

describe('uttaket', () => {
  it('sier fra når kapteinene setter opp lagene', () => {
    expect(view(snapshot('active', []), ME, true).lineupPending).toBe(true);
    expect(view(snapshot('active', []), ME, false).lineupPending).toBe(false);
  });
});

describe('en ferdig cup', () => {
  const played = match('spilt', {
    status: 'finished',
    result: { winnerSide: 1, formatted: '3&2' },
    pointsTeam1: 1,
    team1UserIds: ['ola'],
  });

  it('har vinneren og poengene fra snapshot-en, tall for tall', () => {
    const snap = snapshot('finished', [played]);
    const { results } = view(snap);

    expect(results).toMatchObject({
      winner: 1,
      winnerName: 'Team Nord',
      team1Points: snap.leaderboard.team1Points,
      team2Points: snap.leaderboard.team2Points,
    });
  });

  it('delt seier har ingen vinner', () => {
    const { results } = view(snapshot('finished', [played], { winner: null }));

    expect(results).toMatchObject({ winner: null, winnerName: null });
  });

  it('kampens utfall bruker spilleren i singel og laget i lagformat', () => {
    const body = view(
      snapshot('finished', [
        played,
        match('lag', {
          gameMode: 'best_ball',
          status: 'finished',
          result: { winnerSide: 2, formatted: '1 opp' },
          pointsTeam2: 1,
        }),
        match('delt', { status: 'finished', result: { winnerSide: 'tied', formatted: 'AS' }, pointsTeam1: 0.5, pointsTeam2: 0.5 }),
      ]),
    );
    const outcome = (id: string) => body.matches.find((m) => m.gameId === id)?.outcome;

    expect(outcome('spilt')).toEqual({ points1: 1, points2: 0, tied: false, formatted: '3&2', winnerName: 'Ola' });
    expect(outcome('lag')).toEqual({ points1: 0, points2: 1, tied: false, formatted: '1 opp', winnerName: 'Team Sør' });
    expect(outcome('delt')).toEqual({ points1: 0.5, points2: 0.5, tied: true, formatted: 'AS', winnerName: null });
  });

  it('en uferdig kamp i en tvangsavsluttet cup har ikke noe utfall', () => {
    const body = view(snapshot('finished', [match('uferdig', { status: 'active' })]));

    expect(body.matches[0].outcome).toBeNull();
  });

  it('spillerpoengene viser bare lag med spillere, og sidepoeng bare når cupen har dem', () => {
    const { results } = view(snapshot('finished', [played]));

    expect(results?.playerGroups.map((g) => g.teamName)).toEqual(['Team Nord', 'Team Sør']);
    expect(results?.sideAwardPoints).toBeNull();
    expect(results?.sideAwards).toEqual([]);
  });
});
