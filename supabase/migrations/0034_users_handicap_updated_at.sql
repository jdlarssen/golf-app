-- Adds users.handicap_updated_at to track when a player last confirmed
-- (or had updated) their hcp_index. Drives the stale-handicap prompt
-- shown on the scheduled-game waiting room: the card appears only when
-- the timestamp is older than HANDICAP_STALENESS_WEEKS (4 weeks) — see
-- lib/handicap/staleness.ts.
--
-- Bump points (see app/profile/actions.ts, app/complete-profile/actions.ts,
-- app/admin/spillere/[id]/actions.ts, app/games/[id]/actions.ts):
--   1. updateProfile (self-edit on /profile)
--   2. completeProfile (first-time onboarding)
--   3. admin updates another player's hcp_index
--   4. confirmHandicap server-action (the "Ja, stemmer" button)
--
-- Backfill strategy: existing users get now() so everyone starts "fresh"
-- and gets the 4-week grace before their first prompt. Avoids a launch-day
-- prompt bomb. New users get default now() on insert.

alter table public.users
  add column handicap_updated_at timestamptz;

update public.users set handicap_updated_at = now();

alter table public.users
  alter column handicap_updated_at set not null,
  alter column handicap_updated_at set default now();
