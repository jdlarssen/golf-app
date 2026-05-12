-- Make course/tee-box optional so admins can save partial drafts.
-- A draft with `status = 'draft'` may have either column NULL; the publish
-- step still enforces both NOT NULL via application-layer validation
-- (see lib/games/gamePayload.ts).
--
-- Design: docs/plans/2026-05-12-progressive-draft-creation-design.md

alter table public.games
  alter column course_id drop not null,
  alter column tee_box_id drop not null;

comment on column public.games.course_id is
  'Course chosen for the round. Required for status=scheduled and beyond; nullable while status=draft.';
comment on column public.games.tee_box_id is
  'Tee-box chosen for the round. Required for status=scheduled and beyond; nullable while status=draft.';
