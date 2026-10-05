import type { NotificationKind, NotificationPayload } from './types';

/**
 * One example payload per notification kind, for tests that must cover every
 * kind (#2201). The mapped type makes the compiler demand an entry for a new
 * kind. Fixed ids, the same shapes as `deeplink.test.ts`.
 */
export const TEST_GAME_ID = '11111111-1111-1111-1111-111111111111';
export const TEST_TOURNAMENT_ID = '22222222-2222-2222-2222-222222222222';
export const TEST_GROUP_ID = '33333333-3333-3333-3333-333333333333';
const OTHER_ID = '44444444-4444-4444-4444-444444444444';
const SHORT_ID = 'abcd1234';

export const testPayloads: { [K in NotificationKind]: NotificationPayload<K> } = {
  invite: { game_id: TEST_GAME_ID, game_name: 'X', invited_by_name: 'Per' },
  peer_approval_request: { game_id: TEST_GAME_ID, game_name: 'X', submitter_name: 'Per' },
  scorecard_submitted: { game_id: TEST_GAME_ID, game_name: 'X', player_name: 'Per' },
  scorecard_approved: { game_id: TEST_GAME_ID, game_name: 'X', approver_name: 'Per' },
  scorecard_rejected: { game_id: TEST_GAME_ID, game_name: 'X', rejecter_name: 'Per' },
  scorecard_reopened: { game_id: TEST_GAME_ID, game_name: 'X', actor_name: 'Per' },
  game_finished: { game_id: TEST_GAME_ID, game_name: 'X' },
  game_reopened: { game_id: TEST_GAME_ID, game_name: 'X', actor_name: 'Per' },
  product_update: { source_id: OTHER_ID, title: 'Nytt', body: 'Tekst' },
  team_invite: {
    game_id: TEST_GAME_ID,
    game_short_id: SHORT_ID,
    game_name: 'X',
    team_name: 'Lag',
    invited_by_name: 'Per',
    request_id: OTHER_ID,
  },
  registration_request: { game_id: TEST_GAME_ID, game_name: 'X', requester_name: 'Per' },
  registration_approved: { game_id: TEST_GAME_ID, game_name: 'X' },
  registration_rejected: { game_id: TEST_GAME_ID, game_name: 'X' },
  registration_expired: { game_id: TEST_GAME_ID, game_name: 'X' },
  team_member_withdrew: {
    game_id: TEST_GAME_ID,
    game_short_id: SHORT_ID,
    game_name: 'X',
    withdrawn_player_name: 'Per',
  },
  deliver_reminder: { game_id: TEST_GAME_ID, game_name: 'X' },
  missing_score_reminder: { game_id: TEST_GAME_ID, game_name: 'X', holes: [10, 11] },
  all_scorecards_delivered: { game_id: TEST_GAME_ID, game_name: 'X' },
  game_stale_reminder: { game_id: TEST_GAME_ID, game_name: 'X' },
  cup_finished: { tournament_id: TEST_TOURNAMENT_ID, tournament_name: 'Cup' },
  cup_started: { tournament_id: TEST_TOURNAMENT_ID, tournament_name: 'Cup' },
  cup_signup: {
    tournament_id: TEST_TOURNAMENT_ID,
    tournament_name: 'Cup',
    group_id: TEST_GROUP_ID,
    participant_name: 'Per',
    action: 'joined',
  },
  cup_lineup_revealed: {
    tournament_id: TEST_TOURNAMENT_ID,
    tournament_name: 'Cup',
    session_format: 'Foursome',
    match_count: 4,
  },
  club_join_request: { group_id: TEST_GROUP_ID, group_name: 'Klubb', requester_name: 'Per' },
  club_role_changed: { group_id: TEST_GROUP_ID, group_name: 'Klubb', new_role: 'admin' },
  friend_request: { actor_id: OTHER_ID, actor_name: 'Per' },
  friend_accepted: { actor_id: OTHER_ID, actor_name: 'Per', via: 'accept' },
  player_added: { game_id: TEST_GAME_ID, game_name: 'X', added_by_name: 'Per' },
  game_started: { game_id: TEST_GAME_ID, game_name: 'X' },
  auto_start_blocked: { game_id: TEST_GAME_ID, game_name: 'X', reason: 'pending_players' },
  achievement_unlocked: {
    game_id: TEST_GAME_ID,
    game_name: 'X',
    moments: [{ kind: 'eagle', count: 1 }],
  },
  idea_built: { submission_id: OTHER_ID },
  payment_reminder: {
    game_id: TEST_GAME_ID,
    game_name: 'X',
    entry_fee_kr: 200,
    payment_link: null,
  },
};
