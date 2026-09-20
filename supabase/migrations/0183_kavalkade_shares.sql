-- 0183_kavalkade_shares.sql
-- #2130 (K4, epic #1040): én rad hver gang et kavalkade-kort blir delt.
--
-- ⚠️ Staging først, prod FØR merge og kun etter eier-ja (prod-brannmuren #1074).
--    Uten tabellen deles kortene fortsatt — loggingen er best-effort og svelger
--    sin egen feil — men ingen deling blir talt, og desember-leddet i #1040
--    («delt av minst tre spillere som ikke er Jørgen») kan ikke måles.
--
-- ## Hva raden er, og hva den ikke er
--
-- Raden er en hendelse: «denne spilleren delte dette kortet». Den er ikke en
-- tilstand, så den oppdateres aldri og har ingen unik nøkkel — deler du det
-- samme kortet to ganger, er det to delinger. K5 teller DISTINKTE `user_id`,
-- så gjentatte delinger blåser ikke opp tallet.
--
-- Vi lagrer ingenting om mottakeren. Web Share sier ikke hvor filen havnet, og
-- vi vil ikke vite det heller.
--
-- ## Hvem får lese
--
-- Bare dine egne delinger. Hvem som har delt hva er ikke de andres sak, og
-- `kavalkades` (0182) satte allerede den linja. Desember-tallet på admin-flata
-- (K5, #2131) leses med service-rollen, ikke herfra.
--
-- All skriving går gjennom service-rollen i `lib/kavalkade/logKavalkadeShare.ts`,
-- kalt fra en server-action som henter `user_id` fra sesjonen. Klienten har
-- verken skrive-policy ELLER skrive-rettighet, så en direkte PostgREST-PATCH
-- avvises på rettigheten og ikke bare på 0 rader (felle 3,
-- `docs/bug-prevention.md`).
--
-- ## card_kind har to hjem
--
-- Listen under er den samme som `KAVALKADE_CARD_KINDS` i
-- `lib/kavalkade/cardModel.ts`. To hjem for én regel er felle 4, så
-- `lib/kavalkade/cardKindDbCheck.test.ts` leser denne fila og feiler hvis de to
-- lista går fra hverandre.

create table public.kavalkade_shares (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  -- Året kortet forteller om (`KAVALKADE_YEAR`).
  year       integer not null check (year between 2020 and 2100),
  -- Hvilket kort som ble delt. Samme slug som i kort-ruta.
  card_kind  text not null check (
    card_kind in (
      'year',
      'best-round',
      'nemesis-hole',
      'rival',
      'form-peak',
      'team',
      'gang-winner',
      'gang-birdies',
      'gang-snowmen',
      'gang-tightest'
    )
  ),
  created_at timestamptz not null default now()
);

comment on table public.kavalkade_shares is
  'Én rad per deling av et kavalkade-kort (#2130, epic #1040). Hendelse, ikke '
  'tilstand: skrives av service-rollen når delingen gikk gjennom eller '
  'nedlastingen startet, og endres aldri. K5 teller distinkte user_id.';

-- Tjener både RLS-lesingen (egen rad) og opprydningen når en bruker slettes.
create index kavalkade_shares_user_id_idx on public.kavalkade_shares (user_id);

alter table public.kavalkade_shares enable row level security;

-- Les: bare dine egne delinger. Ingen insert/update/delete-policy — skriving
-- eies av service-rollen.
create policy "kavalkade_shares own select"
  on public.kavalkade_shares for select to authenticated
  using (auth.uid() = user_id);

-- Rettigheter i tillegg til RLS: anon har ingenting å gjøre her, og en innlogget
-- klient skal avvises på rettigheten når hen prøver å skrive.
revoke all on table public.kavalkade_shares from anon;
revoke insert, update, delete on table public.kavalkade_shares from authenticated;
