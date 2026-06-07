-- 0085_league_best_n.sql
--
-- #452 Liga Fase 2a — «Beste N runder»-sesongmodell. Gir `leagues` en valgfri
-- `best_n_count`: hvor mange av spillerens beste (laveste) runder som teller mot
-- sesong-tabellen. Påkrevd kun når `standings_model = 'best_n'`.
--
-- `standings_model`-CHECK-en fra 0080 tillot allerede 'best_n' og 'points' — Fase 1
-- validerte bare 'total'/'average' i app-laget. Fase 2a tar 'best_n' i bruk; 'points'
-- forblir reservert til Fase 2b. Additiv kolonne, ureferert til koden deployer.

alter table public.leagues
  add column best_n_count int;

alter table public.leagues
  add constraint leagues_best_n_count_positive
    check (best_n_count is null or best_n_count >= 1);

alter table public.leagues
  add constraint leagues_best_n_requires_count
    check (standings_model <> 'best_n' or best_n_count is not null);
