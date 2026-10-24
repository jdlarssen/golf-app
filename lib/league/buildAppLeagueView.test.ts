import { describe, it, expect } from 'vitest';
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
      is_simulator: true,
      sim_settings: { greenSpeed: 'Stimp 10', hacked: 'x' },
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
        simOverride: { greenSpeed: 'Stimp 12' },
        simSettings: { greenSpeed: 'Stimp 12' },
        overriddenKeys: ['greenSpeed'],
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
            perRound: [{ roundId: 'r1', value: 36, points: null, penalised: false, deliveredOutsideWindow: false }],
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
            perRound: [{ roundId: 'r1', value: 30, points: null, penalised: false, deliveredOutsideWindow: false }],
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
        simSettings: { greenSpeed: 'Stimp 10' },
        seasonStart: '2026-11-02',
        seasonEnd: '2027-02-07',
      },
      rounds: [
        {
          id: 'r1',
          label: 'Runde 1',
          sequence: 1,
          opensAt: '2026-11-02T00:00:00Z',
          closesAt: '2026-11-15T22:59:00Z',
          ready: true,
          delivered: ['A'],
          inProgress: ['B'],
          simSettings: { greenSpeed: 'Stimp 12' },
          overriddenKeys: ['greenSpeed'],
          settingsLocked: true,
        },
      ],
      participants: [
        { userId: 'A', name: 'Anne' },
        { userId: 'B', name: 'Bjørn' },
        { userId: 'C', name: null },
      ],
      standings: [
        {
          userId: 'A',
          rank: 1,
          value: 36,
          ranked: true,
          roundsPlayed: 1,
          perRound: [{ roundId: 'r1', value: 36, points: null, penalised: false }],
        },
      ],
      me: { userId: 'B', isParticipant: true },
    });
  });

  it('a gross league sends the gross table', () => {
    expect(buildAppLeagueView(snapshot('gross'), 'A').standings[0].value).toBe(30);
  });

  it('a viewer who is not in the league is marked so', () => {
    expect(buildAppLeagueView(snapshot('net'), 'Z').me).toEqual({ userId: 'Z', isParticipant: false });
  });
});
