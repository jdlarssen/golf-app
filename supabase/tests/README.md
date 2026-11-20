# RLS integrasjonstester (pgTAP)

Denne mappa inneholder ende-til-ende-tester for Postgres **row-level-security**-policyene
våre. De kjører mot en **ekte lokal Postgres** med alle migrasjonene i
`supabase/migrations/` påført — ikke mot mocks, og ikke mot produksjon. Tema for #440 er
`scores`-write-policyene; rigg-primitivene er bygd for gjenbruk av #412 / #414
(RLS-policy-omskrivinger).

> **Status:** Mappa har én pgTAP-suite per regel (64 filer per 2026-11-20). CI kjører
> alle sammen i `.github/workflows/migrations-gate.yml` på hver PR som rører
> `supabase/migrations/`, `supabase/tests/` eller `supabase/config.toml`. Det er den
> eneste automatiske porten for disse testene.
>
> Lokalt krever riggen Docker + Supabase CLI. Bruk veien under «Slik kjører du» — den er
> den samme som CI bruker.

## Hva som testes

Den første suiten, `scores_write_rls_test.sql` (#440), er malen for resten. Den dekker write-invariantene fra #387 / migrasjon
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

Migrasjonene påføres med `psql` som rollen `postgres`, ikke av `supabase start` (#1320).
Grunnen: hostede prosjekter påfører migrasjoner som `postgres`, og Supabase sine
standard-rettigheter er satt for den rollen. CLI-en påfører som `supabase_admin`. Da
mangler standard-grantene, og suitene feiler med `42501`. Duplikat-prefiksene som
blokkerte `supabase start` før (#533), er rettet: filene heter nå `00261_*` og `00271_*`,
og CI stopper nye duplikater.

```bash
# 1. Flytt migrasjonene midlertidig til side så supabase start booter en bar DB.
mv supabase/migrations /tmp/torny_migrations && mkdir supabase/migrations
supabase start
rmdir supabase/migrations && mv /tmp/torny_migrations supabase/migrations

# 2. Sett standard-rettighetene slik hostede prosjekter har dem (før migrasjonene).
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
SQL

# 3. Påfør alle migrasjonene i filnavn-rekkefølge (én feil = stopp).
for f in $(ls supabase/migrations/*.sql | sort); do
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f "$f"
done

# 4. Kjør alle suitene.
supabase test db    # eller: npm run test:rls

# 5. Rydd opp.
supabase stop
```

> ⚠️ **Stale Docker-volum → masse-falsk-rødt.** `supabase start` gjenbruker et
> eksisterende volum. Har volumet en eldre skjema-tilstand, blir kjøringen masse-rød
> (policyer/tabeller «mangler») uten hint om årsaken. Kur: `supabase stop --no-backup`,
> og kjør stegene over på nytt.

Fasiten for stegene er `.github/workflows/migrations-gate.yml`. Avviker denne fila fra
workflowen, vinner workflowen.

Forventet output: TAP per suite. For `scores_write_rls_test.sql` er det `1..19` etterfulgt
av `ok 1 .. ok 19`. Hvis en policy-endring (f.eks. #412/#414) bryter en invariant, ryker
den korresponderende linja som `not ok N` med en lesbar beskrivelse.

## CI / skip-guard

CI kjører suitene i `migrations-gate.yml` (se «Status»). `npm run test:rls` er i tillegg
en lokal snarvei. Den er bevisst IKKE en del av `npm test` (Vitest) eller `npm run build`,
så en manglende lokal DB gjør ikke `verify`-jobben rød. Scriptet sjekker først om
`supabase`-CLI-en finnes:

- **CLI finnes** → kjører `supabase test db` og propagerer en ekte test-feil (exit ≠ 0).
- **CLI mangler** → printer en hjelpe-melding og avslutter `0` (skippet, ikke feilet).

## Filstruktur

- `*_test.sql` — én pgTAP-suite per regel. `scores_write_rls_test.sql` (`plan(19)`) er den
  første og malen for resten.
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
samme `SECURITY DEFINER`-hjelperne (`is_admin`, `same_flight_or_solo`, `is_in_game`) kjører som i
prod. Seeding gjøres som `postgres` (RLS bypasses) via `as_service()`; hver probe setter
eksplisitt `authenticated` igjen, og det er det som gjør en grønn assert meningsfull.
