# Spec: rls_auto_enable event-trigger — staging/prod-paritet

**Issue:** #1130 · **Branch:** claude/1130-rls-auto-enable-staging-parity

## Problem

Event-trigger-funksjonen `public.rls_auto_enable()` og dens event-trigger `ensure_rls` (defense-in-depth: skrur automatisk på RLS på nye `public`-tabeller) finnes på **prod** (`glofubopddkjhymcbaph`) men **ikke på staging** (`snwmueecmfqqdurxedxv`). Verifisert read-only 2026-07-07: prod har `fn_count=1, evt_count=1`; staging har `0/0`.

Rot-årsaken er bekreftet: objektene finnes **ikke i migrasjonshistorikken**. `grep -rn "rls_auto_enable\|event trigger" supabase/` treffer kun 0137 (revoke under existence-guard) og pgTAP-testen — aldri en `create`. De ble altså laget manuelt rett på prod utenfor migrasjoner, derav driften. Konsekvensen er at en ny tabell opprettet på staging uten eksplisitt `enable row level security` IKKE får RLS auto-påskrudd der, så en manglende-RLS-tabell oppfører seg annerledes på staging enn prod — et paritetsgap som svekker staging som pre-prod-speil.

Migrasjon `0137_harden_prod_vakt_advisories.sql:52-64` revoker allerede `execute` på funksjonen under en existence-guard, så den er trygg uansett — men den *skaper* den ikke.

## Design

Én ny idempotent migrasjon som reproduserer prod-objektene verbatim, slik at begge miljøer (og enhver fremtidig fresh env) får dem ved replay.

1. **Ny migrasjon `supabase/migrations/0138_rls_auto_enable_parity.sql`.**
   ⚠️ Bekreft løpenummeret mot `origin/main` (ikke bare denne branchen) før du navngir — `git fetch origin && ls` på `origin/main:supabase/migrations/`. Siste på denne branchen er `0137`; bruk neste ledige.

   Innhold, i denne rekkefølgen:

   **a) `create or replace function public.rls_auto_enable()`** — reproduser prod-definisjonen EKSAKT (hentet read-only fra prod 2026-07-07; ikke skriv den fra hukommelse):
   ```sql
   create or replace function public.rls_auto_enable()
    returns event_trigger
    language plpgsql
    security definer
    set search_path to 'pg_catalog'
   as $function$
   declare
     cmd record;
   begin
     for cmd in
       select *
       from pg_event_trigger_ddl_commands()
       where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
         and object_type in ('table','partitioned table')
     loop
        if cmd.schema_name is not null and cmd.schema_name in ('public') and cmd.schema_name not in ('pg_catalog','information_schema') and cmd.schema_name not like 'pg_toast%' and cmd.schema_name not like 'pg_temp%' then
         begin
           execute format('alter table if exists %s enable row level security', cmd.object_identity);
           raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
         exception
           when others then
             raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
         end;
        else
           raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
        end if;
     end loop;
   end;
   $function$;
   ```
   `SECURITY DEFINER` + owner `postgres` er nødvendig: funksjonen må kunne `alter table ... enable row level security` på vilkårlige nye tabeller. Supabase-migrasjonskjøreren kjører som `postgres`, så eierskapet matcher prod automatisk.

   **b) Revoke, for advisory-paritet med 0137.** Uten dette får den nyopprettede staging-funksjonen default `PUBLIC EXECUTE` og gjeninnfører nøyaktig advisoryet 0137 fjernet (på en fresh replay kjører 0137 *før* 0138, så 0137s guard-revoke er no-op når funksjonen ennå ikke finnes). Idempotent på prod (allerede revoket):
   ```sql
   revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
   ```

   **c) Idempotent create av event-triggeren `ensure_rls`.** `create event trigger` støtter ikke `if not exists`, så guard med DO-blokk (matcher prod: `ddl_command_end`, tags `CREATE TABLE`/`CREATE TABLE AS`/`SELECT INTO`):
   ```sql
   do $$
   begin
     if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
       create event trigger ensure_rls
         on ddl_command_end
         when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
         execute function public.rls_auto_enable();
     end if;
   end $$;
   ```

2. **Påfør staging FØRST via Supabase MCP** (`apply_migration`, project `snwmueecmfqqdurxedxv`). Dette er den egentlige fiksen — staging er miljøet som mangler objektene.

3. **Verifiser paritet på staging** (I3 — absence of error ≠ success; positiv bekreftelse kreves):
   ```sql
   select
     (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='rls_auto_enable') as fn,
     (select count(*) from pg_event_trigger where evtname='ensure_rls') as evt,
     (not has_function_privilege('anon','public.rls_auto_enable()','EXECUTE')) as anon_revoked;
   ```
   EXPECT: `fn=1, evt=1, anon_revoked=true`.

   Deretter en behavioral smoke som beviser at triggeren faktisk fyrer (rull tilbake — ingen testtabell skal overleve):
   ```sql
   begin;
   create table public._rls_probe_1130 (id int);
   select relrowsecurity from pg_class where relname='_rls_probe_1130';
   rollback;
   ```
   EXPECT: `relrowsecurity = true`.

4. **Prod-apply (idempotent no-op, eier-gated).** Prod har allerede begge objektene, så migrasjonen er en ren no-op der (CREATE OR REPLACE med identisk kropp, event-trigger-guarden hopper over, revoke allerede utført av 0137). For at prods migrasjons-ledger skal matche stagings, påfør 0138 på prod ETTER staging-verifisering — men KUN bak prod-brannmuren: eksplisitt eier-godkjenning i økten + `touch .claude/approve-prod` (engangs-luke, jf. bindings §Enforcement). Uten den godkjenningen: stopp, migrasjonen er uansett idempotent og går rent på neste prod-push.

5. **pgTAP-paritetsguard.** `supabase/tests/prod_vakt_hardening_1121_test.sql:20-21` sier i dag eksplisitt at `rls_auto_enable` IKKE asserteres fordi den er «prod-only event trigger (absent from local/staging)» — den kommentaren blir feil etter denne fiksen. Oppdater kommentaren og legg til en assertion (bump `plan(28)` → `plan(30)`) som verifiserer at funksjonen finnes, at event-triggeren `ensure_rls` finnes, og at anon/authenticated ikke har EXECUTE:
   ```sql
   select ok(exists(select 1 from pg_event_trigger where evtname='ensure_rls'),
     '#1130: ensure_rls event trigger present (staging/prod parity)');
   select ok(not has_function_privilege('anon','public.rls_auto_enable()','EXECUTE')
         and not has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE'),
     '#1130: rls_auto_enable not client-executable');
   ```
   Kjør `npm run test:rls`. ⚠️ `test:rls` exiter 0 selv når den SKIPPER (supabase CLI mangler) — kjøringen teller kun hvis output viser pgTAP-resultater, ikke «[skipped, not failed]»-banneret. CLI mangler → skriv testen likevel + noter `VERIFICATION GAP: test:rls ikke kjørt`.

## Edge Cases & Guardrails

- **0138 må ligge ETTER 0137, aldri før.** Rekkefølgen er det som gjør revoke-steget (1b) nødvendig — 0137s guard-revoke treffer ingenting på en fresh replay der funksjonen skapes i 0138.
- **Idempotens på prod:** alle tre stegene (CREATE OR REPLACE, revoke, guardet event-trigger-create) er trygge å kjøre om igjen. Ikke bruk `drop event trigger` uten guard — en naken drop/create ville kortvarig fjerne beskyttelsen på prod midt i transaksjonen.
- **Ikke «forbedre» prod-kroppen.** Reproduser verbatim (inkl. `search_path = 'pg_catalog'`, ikke `''`). Avvik ville skape en ny drift i motsatt retning.
- **Behavioral smoke ruller tilbake.** `_rls_probe_1130` må aldri committes til staging — hele proben er i `begin; … rollback;`.

## Key Decisions

- **Idempotent migrasjon fremfor manuell staging-DDL:** issuet ber eksplisitt om «helst som en idempotent migrasjon … slik at begge miljøer får den ved fremtidig replay». Manuell DDL rett på staging ville reprodusere selve rot-årsaken (objekt utenfor migrasjonshistorikk).
- **Ta med revoke i migrasjonen:** ikke kosmetisk — uten den re-introduserer den nyskapte staging-funksjonen 0137-advisoryet ved fresh replay.
- **Prod-apply er ledger-hygiene, ikke funksjonell endring:** prod-runtime er allerede korrekt; prod-apply gated bak brannmuren og valgfritt om eier avstår.

**Claude's Discretion:** eksakt migrasjonsnummer (0138 med mindre `origin/main` allerede har det); nøyaktig ordlyd på pgTAP-assertion-meldingene og den oppdaterte kommentaren i test-fila; om prod-apply gjøres i denne økten eller overlates til neste push (begge korrekte gitt idempotensen).

## Success Criteria

- [ ] Ny migrasjon `supabase/migrations/0138_rls_auto_enable_parity.sql` (eller neste ledige nr.) skaper funksjon + revoke + guardet event-trigger, verbatim mot prod-definisjonen.
- [ ] Migrasjonen påført staging via MCP; verifiserings-SELECT gir `fn=1, evt=1, anon_revoked=true`.
- [ ] Behavioral smoke på staging: en ny `public`-tabell får `relrowsecurity=true` uten eksplisitt `enable row level security`.
- [ ] Migrasjonen er idempotent (trygg å kjøre to ganger uten feil eller endring på prod).
- [ ] `prod_vakt_hardening_1121_test.sql` oppdatert: stale «prod-only»-kommentar rettet + de **to** assertions fra steg 5 (event-trigger `ensure_rls` finnes + `rls_auto_enable` ikke client-executable — sistnevnte `has_function_privilege`-kall beviser samtidig at funksjonen finnes, siden det feiler på en fraværende funksjon), `plan(28)` → `plan(30)`. Legger du en tredje, dedikert funksjons-eksistens-assertion, må `plan()` til `30 + 1` — ellers feiler pgTAP-kjøringen på plan-mismatch.
- [ ] Prod-ledger i sync ELLER dokumentert utsatt til neste push (eier-gate respektert).

## Gates

- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npm run test:rls` (eller `VERIFICATION GAP:` hvis supabase CLI mangler lokalt)
- [ ] Staging verifiserings-SELECT (`fn=1, evt=1, anon_revoked=true`) + behavioral smoke (`relrowsecurity=true`)
- [ ] `bash tests/hooks/guard.test.sh` hvis commit-meldinger må gå via `--body-file` (bash-guard matcher prosa som nevner prod)

## Files Likely Touched

- `supabase/migrations/0138_rls_auto_enable_parity.sql` — ny migrasjon (funksjon + revoke + event-trigger)
- `supabase/tests/prod_vakt_hardening_1121_test.sql` — fjern stale «prod-only»-kommentar (linje 20-21), legg til paritets-assertions, bump `plan()`

## Out of Scope

- Ingen produktendring, ingen bruker-synlig flate → ingen version-bump, ingen CHANGELOG-linje. Bruk et internt commit-prefiks (`chore(db)`/`fix … [no-changelog]`) med `Refs #1130` i body. Bruk `--body-file` for commit/PR siden teksten nevner prod (bash-guard).
- `docs/schema-ground-truth.md:120-121` («ETT avvik: rls_auto_enable finnes kun i prod») ligger i den auto-genererte seksjonen (regenereres av dok-avstemmeren) — ikke rediger for hånd; paritetsnotatet oppdateres av neste dok-avstemmer-kjøring.
- Ingen endring i selve RLS-policyene på eksisterende tabeller — dette gjelder kun defense-in-depth-auto-triggeren for FREMTIDIGE tabeller.
- Ikke rør 0137s eksisterende revoke-guard (den forblir korrekt og komplementær).
