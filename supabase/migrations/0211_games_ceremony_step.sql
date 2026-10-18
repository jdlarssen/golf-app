-- 0211 (#2298): premieutdelingen på storskjermen.
--
-- Arrangøren styrer premieutdelingen fra mobilen, og storskjermen (#2275)
-- viser den. TV-en er anonym (spectate_token), så den kan ikke lytte på
-- realtime. Mobilen skriver steget her, og TV-en spør etter det.
--
-- ceremony_step: null = premieutdelingen er av (TV-en viser «Ferdig spilt»).
-- k = antall viste steg: sidepremiene og de tre pallplassene, altså høyst 4
-- (lib/games/ceremony.ts CEREMONY_MAX_STEP, låst mot CHECK-en i
-- ceremony.test.ts). Ingen default.
--
-- RLS: «games creator update» (created_by = auth.uid()) og «games admin
-- update» (is_admin()) dekker kolonnen; en annen bruker treffer 0 rader.
-- Ingen trigger på games rører kolonnen (competition_links, finish_pipeline_at
-- og league_round_id vokter bare sine egne kolonner). Ingen ny policy.
--
-- Rekkefølge mot prod: additiv kolonne, og koden leser den. Påføres staging,
-- så prod, FØR koden merges. Uten kolonnen svarer lesingen på TV-en og
-- arrangørens premieutdelingsside med en feil.

alter table public.games
  add column ceremony_step smallint
  check (ceremony_step between 0 and 4);
