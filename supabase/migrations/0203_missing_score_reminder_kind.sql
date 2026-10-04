-- 0203_missing_score_reminder_kind.sql
-- Utvid notifications_kind_check med 'missing_score_reminder' (#2268, eierens
-- valg B): arrangøren trykker «Påminn» på en hull-rad i arrangørpulten, og
-- spilleren får «du mangler slag på hull H» i innboksen, som push og på e-post.
--
-- Egen kind, ikke `deliver_reminder` med et hull-felt: mark-read, push-taggen
-- i service-workeren og innboksens «avgjort»-regel leser kind, og ville ellers
-- blandet et hull-varsel med en leveringspåminnelse for samme spill.
--
-- Samme drop/re-add-mønster som 0163 og 0172. Payload-shape (game_id,
-- game_name, holes) valideres i TS-laget (lib/notifications/types.ts,
-- missingScoreReminderSchema). CHECK-en gater kun kind-strengen, og
-- lib/notifications/kindCheckParity.test.ts holder lista lik TS-unionen.
--
-- Additiv: den gamle koden skriver aldri den nye verdien, så migrasjonen kan
-- legges på før koden deployes. Uten den avviser CHECK-en innsettingen, og
-- `notify` logger bare feilen: spilleren får verken varsel, push eller e-post.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'invite',
    'peer_approval_request',
    'scorecard_submitted',
    'scorecard_approved',
    'scorecard_rejected',
    'scorecard_reopened',
    'game_finished',
    'game_reopened',
    'product_update',
    'team_invite',
    'registration_request',
    'registration_approved',
    'registration_rejected',
    'registration_expired',
    'team_member_withdrew',
    'deliver_reminder',
    'cup_finished',
    'cup_started',
    'club_join_request',
    'club_role_changed',
    'friend_request',
    'friend_accepted',
    'player_added',
    'game_started',
    'auto_start_blocked',
    'achievement_unlocked',
    'idea_built',
    'payment_reminder',
    'cup_signup',
    'cup_lineup_revealed',
    'missing_score_reminder'
  ));
