-- 0118 — achievement_unlocked notification kind (#947)
--
-- Adds the `achievement_unlocked` notification kind: fired per round at game
-- finish to a player who unlocked ≥1 notable moment (hole-in-one, eagle, turkey,
-- snowman), bundled into one notification. Same atomic drop+add pattern as
-- 0068/0069/0077/0079/0094. The full current kind-set is preserved; only the
-- new kind is appended.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'invite',
    'peer_approval_request',
    'scorecard_submitted',
    'scorecard_approved',
    'game_finished',
    'product_update',
    'team_invite',
    'registration_request',
    'registration_approved',
    'registration_rejected',
    'team_member_withdrew',
    'deliver_reminder',
    'cup_finished',
    'club_join_request',
    'club_role_changed',
    'friend_request',
    'friend_accepted',
    'cup_started',
    'player_added',
    'game_started',
    'auto_start_blocked',
    -- New for #947:
    'achievement_unlocked'      -- «du låste opp en bragd»-varsel per runde
  ));
