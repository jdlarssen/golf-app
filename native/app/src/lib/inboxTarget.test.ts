// #2759: tabellen «Hvor et trykk fører» i kontrakten, rad for rad, med stiene
// serveren faktisk lager (`notificationDestination`). Type A.
import { notificationDestination } from '../../../../lib/notifications/deeplink';
import {
  TEST_GAME_ID as GAME,
  TEST_GROUP_ID as GROUP,
  TEST_LEAGUE_ID as LEAGUE,
  TEST_TOURNAMENT_ID as CUP,
  testPayloads,
} from '../../../../lib/notifications/testPayloads';
import type { NotificationKind, NotificationPayload } from '../../../../lib/notifications/types';
import { inboxTarget } from './inboxTarget';

const destinationOf = (kind: NotificationKind, payload: object = {}) =>
  notificationDestination({
    kind,
    payload: { ...testPayloads[kind], ...payload } as NotificationPayload,
  });

describe('inboxTarget', () => {
  it.each<[NotificationKind, object]>([
    ['invite', {}],
    ['scorecard_rejected', {}],
    ['game_started', {}],
  ])('%s åpner spillet', (kind, payload) => {
    expect(inboxTarget(destinationOf(kind, payload))).toEqual({
      kind: 'screen',
      target: { name: 'GameHome', params: { gameId: GAME } },
    });
  });

  it.each<[NotificationKind, string]>([
    ['peer_approval_request', 'Approve'],
    ['deliver_reminder', 'Scorecard'],
    ['all_scorecards_delivered', 'EndGame'],
    ['game_stale_reminder', 'EndGame'],
    ['game_finished', 'Leaderboard'],
  ])('%s åpner %s', (kind, name) => {
    expect(inboxTarget(destinationOf(kind))).toEqual({
      kind: 'screen',
      target: { name, params: { gameId: GAME } },
    });
  });

  it('missing_score_reminder åpner det første hullet uten slag', () => {
    expect(inboxTarget(destinationOf('missing_score_reminder'))).toEqual({
      kind: 'screen',
      target: { name: 'Hole', params: { gameId: GAME, holeNumber: 10 } },
    });
  });

  it('ligavarslene og markørens kort åpner ligaens skjermer', () => {
    expect(inboxTarget(destinationOf('league_round_open'))).toMatchObject({
      target: { name: 'League', params: { leagueId: LEAGUE } },
    });
    expect(inboxTarget(destinationOf('league_round_open', { is_simulator: true }))).toMatchObject({
      target: { name: 'LeagueRoundStart', params: { leagueId: LEAGUE } },
    });
    expect(inboxTarget(destinationOf('league_marker_request'))).toMatchObject({
      target: { name: 'MarkerApprove', params: { leagueId: LEAGUE, gameId: GAME } },
    });
  });

  it('cupvarslene åpner cup-rommet og spillerlista', () => {
    expect(inboxTarget(destinationOf('cup_started'))).toMatchObject({
      target: { name: 'Cup', params: { cupId: CUP } },
    });
    expect(inboxTarget(destinationOf('cup_finished'))).toMatchObject({
      target: { name: 'Cup', params: { cupId: CUP } },
    });
    expect(inboxTarget(destinationOf('cup_signup'))).toMatchObject({
      target: { name: 'CupParticipants', params: { cupId: CUP } },
    });
    expect(inboxTarget(destinationOf('cup_signup', { group_id: GROUP }))).toMatchObject({
      target: { name: 'CupParticipants', params: { cupId: CUP } },
    });
  });

  it.each<[NotificationKind]>([['friend_request'], ['friend_accepted']])('%s åpner vennene', (kind) => {
    expect(inboxTarget(destinationOf(kind))).toEqual({
      kind: 'screen',
      target: { name: 'Friends', params: { from: 'notification' } },
    });
  });

  it('achievement_unlocked åpner statistikken', () => {
    expect(inboxTarget(destinationOf('achievement_unlocked'))).toEqual({
      kind: 'screen',
      target: { name: 'RoundStats' },
    });
  });

  it.each<[NotificationKind, string]>([
    ['registration_request', `/admin/games/${GAME}/signups`],
    ['team_invite', '/signup/abcd1234/team'],
    ['team_member_withdrew', '/signup/abcd1234/team'],
    ['club_join_request', `/klubber/${GROUP}`],
    ['club_role_changed', `/klubber/${GROUP}`],
  ])('%s åpner nettsiden', (kind, path) => {
    expect(inboxTarget(destinationOf(kind))).toEqual({ kind: 'web', path });
  });

  it.each<[NotificationKind]>([
    ['game_cancelled'],
    ['registration_rejected'],
    ['registration_expired'],
    ['product_update'],
  ])('%s navigerer ikke', (kind) => {
    expect(inboxTarget(destinationOf(kind))).toEqual({ kind: 'none' });
  });
});
