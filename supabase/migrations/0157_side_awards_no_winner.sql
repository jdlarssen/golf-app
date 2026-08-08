-- 0157_side_awards_no_winner.sql
--
-- «Ingen vinner» på cup-sidepoeng (#1530). Arrangøren må kunne registrere at
-- INGEN fikk nærmest hullet / lengste drive — f.eks. når ingen traff greenen.
--
-- Hvorfor en ny kolonne og ikke bare `winner_user_id IS NULL`: den tilstanden
-- er allerede opptatt. Migrasjon 0154 definerer NULL som «vinneren er ikke
-- tastet ennå», og `isSideAwardRegistered` (lib/cup/sideAwardsRegistered.ts)
-- bruker nettopp det til å blokkere «Avslutt cupen» til alt er registrert.
-- «Ingen vant» er en TREDJE tilstand: ferdig registrert, men uten vinner.
-- Samme skille som gir-tellerne allerede har mellom NULL (ikke registrert) og
-- 0 (registrert null GIR) — se 0156.
--
-- Poeng: et innslag uten vinner gir 0 til begge lag. Det faller ut av seg selv
-- — computeCupLeaderboard summerer bare rader med `winnerTeam` 1 eller 2, og
-- en no_winner-rad har `winner_user_id IS NULL` og mapper derfor til null.
--
-- RLS uendret fra 0154: SELECT for authenticated, INGEN write-policies — all
-- skriving går via service-role i server-actions gatet av
-- requireAdminOrClubAdminOfCup, så den nye kolonnen er automatisk dekket mot
-- direkte PostgREST-writes.

alter table public.tournament_side_awards
  add column no_winner boolean not null default false;

-- Formkrav: de to vinner-tilstandene er gjensidig utelukkende (en rad kan
-- ikke både ha en vinner og «ingen vinner»), og gir-rader har ingen
-- vinner-attribusjon i det hele tatt — de kan aldri være no_winner.
alter table public.tournament_side_awards
  add constraint tournament_side_awards_no_winner_shape_check
  check (
    no_winner = false
    or (winner_user_id is null and kind in ('ctp', 'ld'))
  );
