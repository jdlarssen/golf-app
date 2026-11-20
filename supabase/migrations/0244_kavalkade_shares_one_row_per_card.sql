-- 0244_kavalkade_shares_one_row_per_card.sql
-- Owner-ordered audit 20.11 (package p02): one row per player, year and card.
--
-- ⚠️ Staging first, prod BEFORE merge and only after the owner's yes (prod
--    firewall #1074). Without the index the app still works: the logger treats
--    23505 as «already counted», and without the index that code never fires.
--
-- 0183 stored every share as an event, so the same card shared a hundred times
-- was a hundred rows. The admin number (countKavalkadeSharers, K5) counts
-- DISTINCT user_id, so the extra rows never changed it, but nothing capped how
-- many rows one player could add. Now a player has at most one row per card per
-- year: ten rows a year at most.
--
-- The logger (`lib/kavalkade/logKavalkadeShare.ts`) inserts as before and reads
-- the unique violation (23505) as «this share is already counted». It also
-- accepts only `KAVALKADE_YEAR`; the year rule has its home there, not here,
-- so the CHECK from 0183 (2020–2100) is left as it is.

-- Keep the first row of each (user, year, card) before the index can be built.
-- The Kavalkade has not opened yet, so in prod this is expected to delete
-- nothing; on staging it removes test shares.
delete from public.kavalkade_shares s
using public.kavalkade_shares keep
where s.user_id = keep.user_id
  and s.year = keep.year
  and s.card_kind = keep.card_kind
  and (keep.created_at, keep.id) < (s.created_at, s.id);

create unique index kavalkade_shares_user_year_card_key
  on public.kavalkade_shares (user_id, year, card_kind);

comment on table public.kavalkade_shares is
  'Én rad per spiller, år og kort-type (#2130, epic #1040; unik fra 0244). '
  'Skrives av service-rollen når delingen gikk gjennom eller nedlastingen '
  'startet, og endres aldri. K5 teller distinkte user_id.';
