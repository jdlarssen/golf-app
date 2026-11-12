import { describe, it, expect, vi } from 'vitest';
import type { LeagueSnapshot } from './getLigaSnapshot';
import { buildAppLeagueView } from './buildAppLeagueView';

function snapshot(scoring: string): LeagueSnapshot {
  return {
    league: {
      id: 'l1',
      name: 'Vinterliga på Trackman',
      season_start: '2026-11-02',
      season_end: '2027-02-07',
      format: 'stableford',
      scoring,
      standings_model: 'best_n',
      missed_round_policy: 'penalty',
      penalty_kind: 'worst_plus_one',
      penalty_fixed_over_par: null,
      best_n_count: 5,
      course_scope: 'single_course_single_tee',
      course_id: 'c1',
      tee_box_id: 'tb1',
      status: 'active',
      created_by: 'admin',
      created_at: '2026-11-01T00:00:00Z',
      started_at: '2026-11-01T00:00:00Z',
      finished_at: null,
      group_id: null,
      spectate_token: null,
      join_code: null,
      is_simulator: true,
      sim_settings: { green_stimp: '10', hacked: 'x' },
      hcp_allowance_pct: 75,
      hcp_max_strokes: 32,
    },
    rounds: [
      {
        id: 'r1',
        sequence: 1,
        label: 'Runde 1',
        courseId: 'c1',
        teeBoxId: 'tb1',
        opensAt: '2026-11-02T00:00:00Z',
        closesAt: '2026-11-15T22:59:00Z',
        originalClosesAt: '2026-11-15T22:59:00Z',
        windowOverriddenAt: null,
        flaggedFlights: 0,
        flightCount: 2,
        deliveredUserIds: ['A'],
        inProgressUserIds: ['B'],
        awaitingMarker: [{ gameId: 'g9', userId: 'C', markerUserId: 'A', submittedBy: 'C' }],
        teeName: 'Gul',
        courseName: 'St Andrews',
        simOverride: { green_stimp: '12' },
        simSettings: { green_stimp: '12' },
        overriddenKeys: ['green_stimp'],
        settingsLocked: true,
      },
    ],
    participants: [
      { userId: 'A', name: 'Anne Admin', nickname: ' Anne ', acceptedAt: null, hasPlayed: true },
      { userId: 'B', name: 'Bjørn', nickname: null, acceptedAt: null, hasPlayed: false },
      { userId: 'C', name: null, nickname: null, acceptedAt: null, hasPlayed: false },
    ],
    standings: {
      net: {
        rows: [
          {
            userId: 'A',
            value: 36,
            roundsPlayed: 1,
            ranked: true,
            rank: 1,
            perRound: [{ roundId: 'r1', value: 36, points: null, penalised: false, deliveredOutsideWindow: false, gameId: 'g1' }],
          },
        ],
      },
      gross: {
        rows: [
          {
            userId: 'A',
            value: 30,
            roundsPlayed: 1,
            ranked: true,
            rank: 1,
            perRound: [{ roundId: 'r1', value: 30, points: null, penalised: false, deliveredOutsideWindow: false, gameId: 'g1' }],
          },
        ],
      },
    },
  };
}

describe('buildAppLeagueView — the wire shape the app reads (#2638)', () => {
  it('locks the whole view for a simulator league', () => {
    expect(buildAppLeagueView(snapshot('net'), 'B')).toEqual({
      league: {
        id: 'l1',
        name: 'Vinterliga på Trackman',
        status: 'active',
        format: 'stableford',
        scoring: 'net',
        standingsModel: 'best_n',
        bestN: 5,
        isSimulator: true,
        simSettings: { green_stimp: '10' },
        seasonStart: '2026-11-02',
        seasonEnd: '2027-02-07',
        hcpAllowancePct: 75,
        hcpMaxStrokes: 32,
        shareUrl: null,
      },
      rounds: [
        {
          id: 'r1',
          label: 'Runde 1',
          sequence: 1,
          opensAt: '2026-11-02T00:00:00Z',
          closesAt: '2026-11-15T22:59:00Z',
          ready: true,
          teeName: 'Gul',
          courseName: 'St Andrews',
          delivered: ['A'],
          inProgress: ['B'],
          awaitingMarker: [{ gameId: 'g9', userId: 'C', markerUserId: 'A', submittedBy: 'C' }],
          simSettings: { green_stimp: '12' },
          overriddenKeys: ['green_stimp'],
          settingsLocked: true,
        },
      ],
      participants: [
        // #2813: the name, not the nickname (' Anne ').
        { userId: 'A', name: 'Anne Admin', fullName: null, hcpIndex: null },
        { userId: 'B', name: 'Bjørn', fullName: null, hcpIndex: null },
        { userId: 'C', name: null, fullName: null, hcpIndex: null },
      ],
      standings: [
        {
          userId: 'A',
          rank: 1,
          value: 36,
          ranked: true,
          roundsPlayed: 1,
          // #2815: the cell names the flight, so the app can open its card.
          perRound: [{ roundId: 'r1', value: 36, points: null, penalised: false, gameId: 'g1' }],
        },
      ],
      me: { userId: 'B', isParticipant: true, isOrganizer: false, canJoin: false, canLeave: false },
    });
  });

  it('a gross league sends the gross table', () => {
    const row = buildAppLeagueView(snapshot('gross'), 'A').standings[0];
    expect({ value: row.value, gameId: row.perRound[0].gameId }).toEqual({ value: 30, gameId: 'g1' });
  });

  it('the full name and HCP come only from the details a participant gets', () => {
    const details = new Map([
      ['A', { fullName: 'Anne Admin', hcpIndex: 9.4 }],
      ['B', { fullName: 'Bjørn', hcpIndex: null }],
    ]);
    expect(buildAppLeagueView(snapshot('net'), 'B', details).participants).toEqual([
      { userId: 'A', name: 'Anne Admin', fullName: 'Anne Admin', hcpIndex: 9.4 },
      { userId: 'B', name: 'Bjørn', fullName: 'Bjørn', hcpIndex: null },
      { userId: 'C', name: null, fullName: null, hcpIndex: null },
    ]);
  });

  // #2748: «Del lenka» follows the web page's rule (`participantShareUrl`, Type A
  // in joinCode.test.ts): what is checked here is that the view passes the real
  // participant test to it.
  it('the share link goes to a participant only', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined);
    const base = snapshot('net');
    const withCode = { ...base, league: { ...base.league, join_code: 'abcd2345' } };
    const inLeague = withCode.participants[0].userId;
    expect(buildAppLeagueView(withCode, inLeague).league.shareUrl).toBe('https://tornygolf.no/liga/bli-med/abcd2345');
    expect(buildAppLeagueView(withCode, 'en-annen').league.shareUrl).toBeNull();
    expect(buildAppLeagueView(base, inLeague).league.shareUrl).toBeNull();
    vi.unstubAllEnvs();
  });

  it('a viewer who is not in the league is marked so', () => {
    expect(buildAppLeagueView(snapshot('net'), 'Z').me).toEqual({
      userId: 'Z',
      isParticipant: false,
      isOrganizer: false,
      canJoin: false,
      canLeave: false,
    });
    // #2661: the league's creator may approve in a marker's stead.
    expect(buildAppLeagueView(snapshot('net'), 'admin').me.isOrganizer).toBe(true);
  });

  // #2839: the buttons are `leagueSelfServiceState`'s answer for the viewer. The
  // rule itself has its table in selfService.test.ts; here we check that the view
  // feeds it the snapshot's club, status, participant row and `hasPlayed`.
  describe('self-service (#2839)', () => {
    type Case = {
      name: string;
      group: string | null;
      status: string;
      viewer: string; // 'A' has played, 'B' has not, 'Z' is not in the league
      clubMember: boolean;
      canJoin: boolean;
      canLeave: boolean;
    };
    const cases: Case[] = [
      { name: 'standalone league, outsider', group: null, status: 'draft', viewer: 'Z', clubMember: true, canJoin: false, canLeave: false },
      { name: 'standalone league, participant', group: null, status: 'draft', viewer: 'B', clubMember: false, canJoin: false, canLeave: false },
      { name: 'club draft, member not in', group: 'k1', status: 'draft', viewer: 'Z', clubMember: true, canJoin: true, canLeave: false },
      { name: 'club draft, non-member', group: 'k1', status: 'draft', viewer: 'Z', clubMember: false, canJoin: false, canLeave: false },
      { name: 'club active, member not in', group: 'k1', status: 'active', viewer: 'Z', clubMember: true, canJoin: false, canLeave: false },
      { name: 'club finished, member not in', group: 'k1', status: 'finished', viewer: 'Z', clubMember: true, canJoin: false, canLeave: false },
      { name: 'club draft, participant not played', group: 'k1', status: 'draft', viewer: 'B', clubMember: true, canJoin: false, canLeave: true },
      { name: 'club active, participant not played', group: 'k1', status: 'active', viewer: 'B', clubMember: true, canJoin: false, canLeave: true },
      { name: 'club active, participant has played', group: 'k1', status: 'active', viewer: 'A', clubMember: true, canJoin: false, canLeave: false },
      { name: 'club finished, participant not played', group: 'k1', status: 'finished', viewer: 'B', clubMember: true, canJoin: false, canLeave: false },
      // `canViewLeague` says isClubMember:false for a participant (short-circuit),
      // so an admin-added participant who is no club member can still leave.
      { name: 'club draft, participant who is no club member', group: 'k1', status: 'draft', viewer: 'B', clubMember: false, canJoin: false, canLeave: true },
    ];
    it.each(cases)('$name', ({ group, status, viewer, clubMember, canJoin, canLeave }) => {
      const base = snapshot('net');
      const snap = { ...base, league: { ...base.league, group_id: group, status } };
      const me = buildAppLeagueView(snap, viewer, null, clubMember).me;
      expect({ canJoin: me.canJoin, canLeave: me.canLeave }).toEqual({ canJoin, canLeave });
    });
  });
});
