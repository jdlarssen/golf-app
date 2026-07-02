-- 0125_games_round_report.sql
-- Issue #1008 — AI-rundereferat ved avsluttet spill (Pressetribunen v1).
--
-- Design notes:
--  * Nullable text column on games; NULL = ikke generert → alle flater faller
--    stille tilbake til dagens oppførsel (0096-mønsteret fra
--    game_players.result_summary).
--  * Skrives ÉN gang ved avslutning via service-role-klienten i
--    endGame/endGameWithSideWinners (RLS-bypass), tømmes av reopenGame.
--  * Ingen RLS-endring: kolonnen arver games-radens eksisterende SELECT-policyer
--    (deltaker-eller-admin + creator). Kolonnen er NULL frem til spillet
--    avsluttes, så ingenting lekker før finish. Tilskuerlenken leser via
--    service-role (0121-mønsteret) og trenger heller ingen policy.
--  * Additiv + nullable ⇒ kan påføres prod før koden deployes (0123-mønsteret).
--
-- ⚠ Apply to staging first, verify, then prod (per CLAUDE.md DB discipline).

alter table public.games
  add column if not exists round_report text;

comment on column public.games.round_report is
  'AI-generert kampreferat (norsk prosa, 3–6 setninger), generert én gang ved avslutning. NULL = ikke generert (manglende API-nøkkel, tynt datagrunnlag eller feil) — flatene faller da stille tilbake. Refs #1008.';
