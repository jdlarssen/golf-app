-- 0136_game_prizes.sql
-- #1051 (Penger i potten, del 2 av epic #1039): premiebord + sponsor.
--
-- Arrangøren kan legge inn et premiebord på spillet: premie + valgfri sponsor
-- (tekst) for 1.–3. plass og for hvert aktive LD/CTP-slott. Spillerne ser
-- premiebordet før start, sponsorene får en tekststripe på tavle-flatene, og
-- ved rundeslutt kobles premiene til vinnerne i en «Premieutdeling»-seksjon.
--
-- Avgrensning (bruker-vedtak 2026-07-05): sponsorer er TEKST, ikke logo. Appen
-- har ingen bilde-opplastings-infrastruktur — logo er skilt ut som eget issue.
--
-- Datamodell:
--   • games.prizes jsonb — bounded liste (maks 7 slott: 3 plasseringer + 2 LD
--     + 2 CTP). jsonb, ikke barnebord, fordi lista er liten og fast, arver
--     games-RLS gratis, rir på game-${id}-cachen, og skrives atomisk med
--     games-raden (ingen multi-steg-insert å kompensere).
--
-- Element-form (validert i Zod, lib/games/prizes.ts — valideringens hjem):
--   { category: 'placement' | 'longest_drive' | 'closest_to_pin',
--     position: number,        -- placement 1–3, ld/ctp 1–2
--     description: string,     -- premien, 1–120 tegn
--     sponsor: string | null } -- sponsornavn ≤60 tegn, null = ingen sponsor
--
-- Unikhet på (category, position) og posisjon-grenser håndheves i Zod, ikke DB
-- — hele arrayen skrives atomisk. DB-CHECK er backstop for array-formen + taket.

-- ── games: premiebord ─────────────────────────────────────────────────────────
-- NOT NULL DEFAULT '[]' → tom liste betyr «ingen premier» (feature av). Har
-- default, så gen:types gjør den valgfri på Insert (ingen kode-bump nødvendig).
-- CHECK sikrer array-form og øvre grense 7 (regel-én-hjem: taket speiles i Zod,
-- og en test asserterer at de er enige — jf. teeRatingDbCheck-mønsteret).
alter table public.games
  add column if not exists prizes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(prizes) = 'array' and jsonb_array_length(prizes) <= 7);

comment on column public.games.prizes is
  '#1051: premiebord — bounded jsonb-liste (maks 7 slott: 3 plasseringer + 2 LD '
  '+ 2 CTP). Hvert element: {category, position, description, sponsor}. Tom = '
  'ingen premier (feature av). Validert i Zod (lib/games/prizes.ts); DB-CHECK er '
  'backstop for array-form + tak. Arver games-RLS (creator/admin update).';

-- ── RLS: hvem kan skrive prizes ───────────────────────────────────────────────
-- Ingen ny policy nødvendig. games-UPDATE er allerede arrangør-gated:
--   • «games creator update» (created_by = auth.uid())
--   • «games admin update»   (is_admin())
-- En jsonb-kolonne på games arver dette gratis — en hostile PATCH på
-- games.prizes fra en vanlig spiller treffer 0 rader (verifisert med #440-riggen).
