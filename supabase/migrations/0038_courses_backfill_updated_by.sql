-- Backfill av courses.updated_by for rader som ble migrert i 0037 uten
-- updated_by-verdi. Setter updated_by = created_by der det er trygt
-- (created_by NOT NULL); lar resten stå som NULL (ingen kilde-data).
--
-- Bakgrunn: 0037 satte updated_at = now() via default på add column, men lot
-- updated_by stå som NULL siden vi ikke ville anta at created_by = updated_by
-- på det tidspunktet. Etter en uke i prod er det klart at fallback til
-- created_by er korrekt for visnings-fallback: ingen andre brukere har
-- redigert disse banene før 0037 ble applied.
--
-- Idempotent: re-kjøring rører kun rader som fortsatt er NULL.

update public.courses
set updated_by = created_by
where updated_by is null
  and created_by is not null;

comment on column public.courses.updated_by is
  'Hvem (auth user id) endret raden sist. NULL kun for legacy-rader fra før '
  '0037 hvor created_by også var NULL. Backfilt fra created_by i 0038.';
