-- #475 i18n Fase 0: per-user locale preference.
--
-- Nullable on purpose: NULL means "not chosen yet" and the app falls through
-- to NEXT_LOCALE cookie -> Accept-Language -> default 'no'. No CHECK
-- constraint — the allowed set lives in app code (i18n/routing.ts) so adding
-- gd/ga/Nordic locales later is a code change, not a migration.
alter table public.users
  add column if not exists locale text;

comment on column public.users.locale is
  'UI locale preference (e.g. ''no'', ''en''). NULL = not set; app falls back to cookie/Accept-Language. Allowed values enforced in app code (i18n/routing.ts).';
