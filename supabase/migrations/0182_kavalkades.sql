-- 0182_kavalkades.sql
-- #2128 (K2, epic #1040): én lagret kavalkade per spiller per år.
--
-- ⚠️ Staging først, prod FØR merge og kun etter eier-ja (prod-brannmuren #1074).
--    Uten tabellen svarer Kavalkaden med en feil første gang noen åpner den etter
--    24. desember — koden leser og skriver hit før den viser noe som helst.
--
-- ## Hvorfor raden er endelig
--
-- Kavalkaden er skjult til frysegrensen (`lib/kavalkade/release.ts`), og fakta
-- regnes bare på runder avsluttet FØR den. Første gang en spiller åpner siden,
-- er dataene altså allerede endelige — raden skrives én gang og oppdateres
-- aldri. Derfor verken fingeravtrykk eller regenerering, og derfor ingen
-- update-policy: rader her er uforanderlige.
--
-- ## Én rad, ikke to
--
-- Kontrakten (#1040, 16.09) skisserte en `scope`-kolonne med 'personal' og
-- 'gang'. K1 (#2127) leverte i stedet ÉN `KavalkadeFacts` per spiller, med
-- `personal`, `team` og `gang` i samme objekt — og etter Tillegg 2 regnes
-- gjengens tall fra spillerens egne runder, så en «gjeng-rad» har ingen egen
-- eier å hete etter. Kolonnen ville dermed hatt samme verdi i hver eneste rad.
-- Nøkkelen er (user_id, year), som er det suksesskriteriet faktisk måler:
-- «første åpning gir ÉN rad».
--
-- ## Hvem får lese
--
-- Bare din egen rad. `facts` inneholder navn og tall fra medspillerne dine, og
-- et ferdig spill er ikke world-read (#1542) — kavalkaden skal ikke bli en
-- bakvei inn i tall spilleren ellers ikke ser. All skriving går gjennom
-- service-rollen i `lib/kavalkade/getOrCreateKavalkade.ts`; klienten har ingen
-- skrive-policy OG ingen skrive-rettighet, så en direkte PostgREST-PATCH
-- avvises på rettigheten og ikke bare på 0 rader (felle 3).

create table public.kavalkades (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  -- Året kavalkaden forteller om (`KAVALKADE_YEAR`). Én rad per spiller per år.
  year         integer not null check (year between 2020 and 2100),
  -- Hele `KavalkadeFacts` fra `lib/kavalkade/buildKavalkadeFacts.ts`, slik den
  -- var ved frysegrensen. Objekt, aldri liste eller skalar.
  facts        jsonb not null check (jsonb_typeof(facts) = 'object'),
  -- AI-innledningen. NULL er en gyldig, forventet tilstand: uten
  -- ANTHROPIC_API_KEY vises kortene uten tekst (#1008-mønsteret).
  narrative    text,
  generated_at timestamptz not null default now(),
  unique (user_id, year)
);

comment on table public.kavalkades is
  'Årets kavalkade per spiller (#2128, epic #1040). Skrives én gang, første '
  'gang spilleren åpner siden etter frysegrensen, og endres aldri. Fakta er '
  'deterministiske (buildKavalkadeFacts); narrative er AI-pynt som kan mangle.';

alter table public.kavalkades enable row level security;

-- Les: bare din egen rad. Ingen insert/update/delete-policy — skriving eies av
-- service-rollen.
create policy "kavalkades own select"
  on public.kavalkades for select to authenticated
  using (auth.uid() = user_id);

-- Rettigheter i tillegg til RLS: anon har ingenting å gjøre her, og en
-- innlogget klient skal avvises på rettigheten når hen prøver å skrive.
revoke all on table public.kavalkades from anon;
revoke insert, update, delete on table public.kavalkades from authenticated;
