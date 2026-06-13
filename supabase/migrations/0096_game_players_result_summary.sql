-- #572 Vis spillerens eget resultat på avsluttede spill-kort.
--
-- Kompakt, strukturert per-spiller-utfall beregnet ved `endGame` og lest billig
-- på avsluttede-spill-kortene. Strukturert jsonb (ikke ferdig streng) så kortet
-- kan formatere per locale (i18n #60). Formen er en diskriminert union, eid av
-- app-koden (lib/scoring/resultSummary.ts) — ingen CHECK/skjema her, så nye
-- summary-former er en kode-endring, ikke en migrasjon:
--   {"kind":"placement","rank":1,"fieldSize":4,"isTeam":false}
--   {"kind":"matchplay","outcome":"win","margin":"3&2"}
--   {"kind":"skins","skins":4,"rank":1,"fieldSize":4}
--
-- Nullable: NULL = ikke beregnet (modus uten støtte, eller eldre spill før
-- backfill) → kortet faller tilbake til den generiske 🏆-emojien.
--
-- Ingen RLS-endring: spilleren leser allerede sin egen game_players-rad via
-- finished-visibility-policyen; skrivingen skjer med service-role-klienten i
-- endGame/backfill (RLS-bypass).
alter table public.game_players
  add column if not exists result_summary jsonb;

comment on column public.game_players.result_summary is
  'Kompakt per-spiller-utfall for avsluttede spill (#572). Strukturert jsonb-union eid av lib/scoring/resultSummary.ts. NULL = ikke beregnet → 🏆-fallback på kortet.';
