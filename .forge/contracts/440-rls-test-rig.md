# Contract: #440 — RLS-integrasjonstest-rigg (scores write-RLS)

## Goal
Repoet har **ingen** RLS-integrasjonstest-infra. Bygg en liten, kjørbar rigg som verifiserer `scores`-write-policyene ende-til-ende mot en ekte Postgres-rolle (ikke bare policy-uttrykk på papiret), og dekk write-RLS-invariantene fra #387.

## Asserts riggen skal dekke
Som en ikke-admin `auth.uid()` i et aktivt spill:
- aktiv, ikke-trukket, ikke-levert spiller **KAN** skrive egne + flight-scorer
- trukket spiller (`withdrawn_at` satt) **BLIR blokkert** (insert + update)
- levert spiller (`submitted_at` satt) **BLIR blokkert**
- admin **bypasser**

## Approach (i prioritert rekkefølge — velg første som er kjørbar i miljøet)
1. **Supabase CLI lokalt** (`supabase init` finnes ikke ennå — ingen `config.toml`). Hvis Docker er tilgjengelig: `supabase init` + `supabase start` + `supabase test db` med **pgTAP**-tester i `supabase/tests/`. Dette er den foretrukne riggen — kjører migrasjonene + policyene i ekte Postgres.
2. **pgTAP-only** mot en seedet test-DB hvis CLI/Docker delvis virker.
3. **Fallback hvis Docker/lokal-Supabase IKKE er tilgjengelig i dette miljøet:** ikke fake en grønn test. Scaffold riggen komplett (pgTAP-filer + `supabase/config.toml` + npm-script `test:rls`) slik at den kjører så snart `supabase start` er oppe, skriv en kort `supabase/tests/README.md` med «slik kjører du», og **rapporter blokkereren ærlig** i PR-beskrivelsen + til koordinator. Marker testene slik at CI ikke rødner på manglende DB (skip-guard), men la dem være reelle når DB finnes.

## File Boundaries
- This stream ONLY touches (alle NYE filer der mulig):
  - `supabase/tests/**` (pgTAP), `supabase/config.toml` (ny, kun hvis `supabase init`)
  - `supabase/tests/README.md`
  - `package.json` KUN hvis du legger til et `test:rls`-script (IKKE legg til npm-deps om mulig — pgTAP kjører i Postgres, ikke node)
- Do NOT modify: `app/**`, `lib/**`, eksisterende `supabase/migrations/**`, `vitest.config.ts`, andre test-filer.

## Dependencies
- Depends on: none. (Søsken #412/#414 vil senere bruke denne riggen — så hold assertene gjenbrukbare/parametriserte.)

## Test-disiplin
Dette er **Type-grenseland (RLS-integrasjon)** — ny test-infra, ikke app-endring → ingen version-bump, ingen CHANGELOG. Ikke dupliser scoring-asserts. Hold riggen til RLS-roundtrip, ingenting annet.

## Success Criteria
- [ ] Rigg eksisterer og dekker de fire assertene over.
- [ ] Hvis kjørbar i miljøet: testene er grønne og output limt i PR. Hvis ikke: scaffold + README + ærlig blokker-rapport, skip-guard så CI ikke rødner.
- [ ] `npm run build` fortsatt grønt (ingen app-kode rørt).
- [ ] PR mot `main` med `Closes #440` + tagline. Ingen version-bump (test-infra).
