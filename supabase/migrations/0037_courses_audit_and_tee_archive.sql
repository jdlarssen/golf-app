-- Fase 2 av #223. To uavhengige endringer levert i samme migration siden
-- begge er en del av samme bane-admin-vedlikeholds-trygghet-arbeidet.
--
-- 1. courses-audit: updated_at + updated_by. Settes eksplisitt av
--    application-laget i `updateCourse`-server-action (matcher pattern fra
--    0034_users_handicap_updated_at.sql). Trigger-basert oppdatering ble
--    droppet til fordel for testbarhet og forutsigbarhet.
--
-- 2. tee_boxes-soft-archive: archived_at. Lar admin fjerne tees som er i
--    bruk i historiske spill uten å miste FK-integritet. games.tee_box_id
--    forblir gyldig — kun lese-stier som lister "aktive tees" filtrerer
--    archived_at IS NULL.
--
-- Fase 1-kontrakten flagget begge som Fase 2-arbeid; ingen prior decisions
-- forhindrer dem.

-- 1. courses.updated_at + updated_by
alter table public.courses
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid references public.users(id);

comment on column public.courses.updated_at is
  'Sist endret. Settes eksplisitt av updateCourse server-action. Eksisterende '
  'rader får now() via default ved migration; updated_by er NULL til første '
  'framtidige update. Fase 2 av #223.';

comment on column public.courses.updated_by is
  'Brukeren som sist endret banen. NULL for eksisterende rader (før Fase 2) '
  'og brukere som er slettet siden endringen. Visning faller tilbake til '
  '«Sist endret DATO» uten navn ved NULL. Fase 2 av #223.';

-- 2. tee_boxes.archived_at
alter table public.tee_boxes
  add column archived_at timestamptz;

comment on column public.tee_boxes.archived_at is
  'Når NULL: tee-en er aktiv og vises i CourseForm + new-game-picker. '
  'Når satt: tee-en er soft-arkivert — beholdes for historiske spill (FK '
  'fra games.tee_box_id), men skjules fra admin-flater og new-game-flyt. '
  'En-veis i Fase 2; un-arkivér-UI kommer i Fase 3 av #223.';

-- Ingen RLS-endringer:
-- - courses + tee_boxes leses fortsatt under eksisterende admin-only-policies
--   (alle relevante stier krever is_admin = true).
-- - archived_at-filter er applikasjons-side, ikke RLS-håndhevet. Hvis vi
--   senere får ikke-admin lesere på tee_boxes (f.eks. for crowdsource-flow),
--   må vi vurdere policy-justering.
