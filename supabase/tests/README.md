# RLS integrasjonstester (pgTAP)

Denne mappa inneholder ende-til-ende-tester for Postgres **row-level-security**-policyene
våre. De kjører mot en **ekte lokal Postgres** med alle migrasjonene i
`supabase/migrations/` påført — ikke mot mocks, og ikke mot produksjon. Tema for #440 er
`scores`-write-policyene; rigg-primitivene er bygd for gjenbruk av #412 / #414
(RLS-policy-omskrivinger).

> **Status (per #440):** Riggen er komplett og kjørbar, men den krever Docker + Supabase
> CLI lokalt. Riggen ble **kjørt grønt** mot en ekte lokal Postgres med alle 91
> migrasjonene påført: alle 19 asserts (de fire invariantene + kontroller) passerte,
> og en mutasjonstest bekreftet at en feil policy ville gjøre dem røde — så det er ekte
> håndhevelse, ikke false-positives.
>
> **Én snublestein:** `supabase start` feiler i dag fordi to migrasjonspar deler
> tall-prefiks (`0026_*` × 2, `0027_*` × 2), og CLI-ens `schema_migrations`-bokføring
> krever unik versjon-nøkkel. Selve SQL-en har ingen konflikt — den ble verifisert ved
> å boote en bar Postgres og påføre migrasjonene direkte med `psql` (se «Slik kjører
> du»). Migrasjons-omdøpingen spores som eget issue; når den lander, virker
> `supabase test db` rett ut av boksen. `npm run build` og resten av CI rører ikke disse
> filene (se «CI / skip-guard»).

## Hva som testes

`scores_write_rls_test.sql` dekker write-invariantene fra #387 / migrasjon
`0073_block_withdrawn_score_writes.sql`, som en ikke-admin `auth.uid()` i et **aktivt**
spill:

| # | Invariant |
|---|-----------|
| 1 | Aktiv, ikke-trukket, ikke-levert spiller **KAN** skrive egne **+** flight-scorer (insert + update) |
| 2 | Trukket spiller (`game_players.withdrawn_at` satt) **BLOKKERES** (insert + update) — både spilleren selv og en flight-kompis som prøver å skrive på dem |
| 3 | Levert spiller (`game_players.submitted_at` satt) **BLOKKERES** (insert + update) |
| 4 | **Admin bypasser** — kan skrive hvem som helst, inkludert trukket/levert |

Pluss negative kontroller (en outsider utenfor spillet blokkeres; service-rollen bypasser RLS)
som beviser at RLS faktisk håndheves og ikke bare vinker alt gjennom.

## Slik kjører du

Krever **Docker Desktop** kjørende + **Supabase CLI** installert
(`brew install supabase/tap/supabase`).

### A) Standardveien (når duplikat-prefiks-issuet er løst)

```bash
supabase start      # booter Postgres + påfører alle migrasjoner inkl. RLS-policyene
supabase test db    # kjører pgTAP-suitene under supabase/tests/
#  — eller via npm-scriptet (skipper trygt hvis CLI mangler):
npm run test:rls
supabase stop
```

### B) Verifisert vei i dag (rundt duplikat-prefiks-blokkeren)

`supabase start` bokfører hver migrasjon på tall-prefiks og kolliderer på de doble
`0026`/`0027`-ene. Selve SQL-en er konfliktfri, så boot en bar Postgres og påfør
migrasjonene direkte med `psql`:

```bash
# 1. Flytt migrasjonene midlertidig til side så supabase start booter en bar DB.
mv supabase/migrations /tmp/torny_migrations && mkdir supabase/migrations
supabase start

# 2. Påfør alle migrasjonene i filnavn-rekkefølge (én feil = stopp).
for f in $(ls /tmp/torny_migrations/*.sql | sort); do
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$f"
done

# 3. Kjør RLS-suiten (cd inn i tests/ så `\ir fixtures/…` resolver relativt).
cd supabase/tests && PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f scores_write_rls_test.sql

# 4. Rydd opp: stopp stacken og legg migrasjonene tilbake.
cd ../.. && supabase stop && rm -rf supabase/migrations && mv /tmp/torny_migrations supabase/migrations
```

Forventet output (begge veier): TAP fra `scores_write_rls_test.sql` — `1..19` etterfulgt
av `ok 1 .. ok 19`. Hvis en policy-endring (f.eks. #412/#414) bryter en invariant, ryker
den korresponderende linja som `not ok N` med en lesbar beskrivelse.

## CI / skip-guard

`npm run test:rls` er **opt-in**: det er bevisst IKKE en del av `npm test` (Vitest) eller
`npm run build`. Eksisterende CI rører derfor aldri disse filene, så en manglende lokal DB
gjør **ikke** CI rød. Scriptet sjekker først om `supabase`-CLI-en finnes:

- **CLI finnes** → kjører `supabase test db` og propagerer en ekte test-feil (exit ≠ 0).
- **CLI mangler** → printer en hjelpe-melding og avslutter `0` (skippet, ikke feilet).

Det er den ærlige skip-guarden: testene er reelle når en DB finnes, og inerte ellers.

## Filstruktur

- `scores_write_rls_test.sql` — pgTAP-planen (`plan(19)`) med de fire invariantene + kontroller.
- `fixtures/rls_helpers.psql` — **gjenbrukbare** seed- + impersonerings-primitiver i et eget
  `torny_rls`-skjema. Inkluderes i testen via `\ir fixtures/rls_helpers.psql`.
  `.psql`-endelsen (ikke `.sql`) er bevisst: `supabase test db` glob-er `tests/**/*.sql`,
  så fixtur-fila kjøres ikke som en frittstående test (den har ingen TAP-plan).

### Gjenbruk i #412 / #414

`fixtures/rls_helpers.psql` er sannhetskilden for hvordan man impersonerer en bruker og
seeder en spill-graf. Nye RLS-suiter trenger bare:

```sql
\ir fixtures/rls_helpers.psql
select torny_rls.seed_active_game();        -- aktivt spill, 5 deltakere + 1 outsider
select torny_rls.as_user(torny_rls.active_id());   -- bli authenticated med denne auth.uid()
-- ... probe via torny_rls.try_insert_score() / try_update_score(), assert med ok()
```

Impersoneringen (`as_user`) speiler produksjons-runtime: den setter rolla `authenticated`
og forfalsker `request.jwt.claims->>'sub'`, akkurat den stien `auth.uid()` leser fra. De
samme `SECURITY DEFINER`-hjelperne (`is_admin`, `same_flight`, `is_in_game`) kjører som i
prod. Seeding gjøres som `postgres` (RLS bypasses) via `as_service()`; hver probe setter
eksplisitt `authenticated` igjen, og det er det som gjør en grønn assert meningsfull.
