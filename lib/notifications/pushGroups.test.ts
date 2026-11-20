import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NOTIFICATION_KINDS, type NotificationKind } from './types';
import { MUTABLE_PUSH_GROUPS, PUSH_GROUPS, pushGroupForKind, type PushGroupId } from './pushGroups';

/**
 * Type A (#2315): the groups on Profil → Varsler og tema, one home for the
 * server filter and the app. The table below is the contract's grouping; a
 * kind moving group is a visible change for players and must show up here.
 */
const EXPECTED: Record<NotificationKind, PushGroupId> = {
  idea_built: 'rounds',
  product_update: 'rounds',
  invite: 'rounds',
  team_invite: 'rounds',
  player_added: 'rounds',
  registration_approved: 'rounds',
  registration_rejected: 'rounds',
  registration_expired: 'rounds',
  game_started: 'rounds',
  game_moved: 'rounds',
  tee_time_changed: 'rounds',
  game_cancelled: 'rounds',
  auto_start_blocked: 'rounds',
  game_finished: 'rounds',
  game_reopened: 'rounds',
  achievement_unlocked: 'rounds',
  payment_reminder: 'rounds',
  cup_started: 'rounds',
  cup_finished: 'rounds',
  cup_lineup_revealed: 'rounds',
  league_round_open: 'rounds',
  league_round_closing: 'rounds',
  organizer_evening_status: 'rounds',
  peer_approval_request: 'scorecards',
  scorecard_submitted: 'scorecards',
  scorecard_approved: 'scorecards',
  scorecard_rejected: 'scorecards',
  scorecard_reopened: 'scorecards',
  deliver_reminder: 'scorecards',
  missing_score_reminder: 'scorecards',
  all_scorecards_delivered: 'scorecards',
  game_stale_reminder: 'scorecards',
  league_marker_request: 'scorecards',
  friend_request: 'friends',
  friend_accepted: 'friends',
  friend_achievement: 'friends',
  club_role_changed: 'friends',
  registration_request: 'signups',
  team_member_withdrew: 'signups',
  cup_signup: 'signups',
  club_join_request: 'signups',
};

const GROUP_IDS = PUSH_GROUPS.map((g) => g.id);

describe('pushGroupForKind', () => {
  it.each(NOTIFICATION_KINDS)('%s has one of the four groups, the one in the table', (kind) => {
    const group = pushGroupForKind(kind);
    expect(GROUP_IDS).toContain(group);
    expect(group).toBe(EXPECTED[kind]);
  });

  it('the table covers every kind and nothing else', () => {
    expect(new Set(Object.keys(EXPECTED))).toEqual(new Set(NOTIFICATION_KINDS));
  });

  it('idea_built sits under «Rundene dine» (the owner, 14.11: no switch of its own)', () => {
    expect(pushGroupForKind('idea_built')).toBe('rounds');
  });
});

describe('PUSH_GROUPS', () => {
  it('lists the four groups once each, in display order', () => {
    expect(GROUP_IDS).toEqual(['rounds', 'scorecards', 'friends', 'signups']);
  });

  it('only «Rundene dine» is locked', () => {
    expect(PUSH_GROUPS.filter((g) => g.locked).map((g) => g.id)).toEqual(['rounds']);
  });

  it('MUTABLE_PUSH_GROUPS is exactly the groups that are not locked, in the same order', () => {
    expect(MUTABLE_PUSH_GROUPS).toEqual(PUSH_GROUPS.filter((g) => !g.locked).map((g) => g.id));
  });
});

// Trap #4 (AGENTS.md): the list of groups a player can mute lives here and in
// the CHECK on notification_preferences.muted_groups. They must agree.
describe('notification_preferences CHECK ↔ MUTABLE_PUSH_GROUPS agreement (trap #4)', () => {
  it('the CHECK in 0236 allows exactly the groups that can be turned off', () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../../supabase/migrations/0236_notification_preferences.sql'),
      'utf-8',
    );
    const m = sql.match(/check \(muted_groups <@ array\[([^\]]*)\]::text\[\]\)/);
    if (!m) throw new Error('Could not find the muted_groups CHECK in 0236');
    const allowed = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
    expect(allowed).toEqual([...MUTABLE_PUSH_GROUPS]);
  });
});
