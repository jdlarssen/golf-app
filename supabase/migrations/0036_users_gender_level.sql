-- Issue #92: profil-felt for kjønn og spillerklasse (auto-default i game-wizard)
--
-- Lagrer brukerens kjønn og spillerklasse på public.users for å auto-defaulte
-- M/D/J-toggle i game-wizardens tee-valg. Per-spill freeze ligger fortsatt i
-- game_players.tee_gender (#48); disse feltene er kun default-kilden.

-- Kjønn for brukere: bare mens/ladies (juniors er en spillerklasse, ikke et kjønn).
create type user_gender as enum ('mens', 'ladies');

-- Spillerklasse: brukes til å auto-velge juniortee (når banen har en) +
-- fremtidig senior-tee-logikk.
create type player_level as enum ('junior', 'normal', 'senior');

alter table public.users
  add column gender user_gender,
  add column level player_level not null default 'normal';

comment on column public.users.gender is
  'Brukerens kjønn. Brukt som default for M/D/J-toggle i game-wizard. NULL = ikke besvart (utløser soft-prompt på /profile).';

comment on column public.users.level is
  'Spillerklasse. Junior overstyrer kjønn i tee-defaulten; senior påvirker ikke toggle i dag (reservert for fremtidig senior-tee-logikk).';
