# Spec: Staging mangler rls_auto_enable-funksjonen (prod↔staging-konvergens)

**Issue:** #1105 · **Branch:** claude/1105-staging-mangler-rls-auto-enable

## Problem
Dok-avstemmeren (#1078, første kjøring) fant at event-trigger-funksjonen `public.rls_auto_enable()`
og dens event-trigger `ensure_rls` finnes i prod (`glofubopddkjhymcbaph`) men ikke i staging
(`snwmueecmfqqdurxedxv`). Verifisert denne økten via read-only introspeksjon: staging har
`has_fn=0`, `has_evt=0`. Funksjonen er en `SECURITY DEFINER` event-trigger som lytter på
`ddl_command_end` og auto-slår-på RLS på nye `public`-tabeller — et defense-in-depth-lag som
fanger en glemt `enable row level security` før tabellen eksponeres. Ingen migrasjonsfil i
`supabase/migrations/` oppretter objektene (grep: kun `0137` refererer dem, som en existence-guarded
revoke) — de ble laget direkte mot prod og aldri fanget i migrasjonsflyten, derav driften.

Ingen akutt data-eksponering: alle 34 `public`-tabeller i staging har allerede RLS på
(`public_tables_without_rls=0`). Dette er ren skjema-konvergens, ikke en åpen RLS-luke.

## Design

1. **Hent kanonisk definisjon fra prod (I1 — ground truth, ikke hukommelse).** Ved bygg,
   re-kjør mot prod read-only og kopier funksjonskroppen verbatim (ikke transkriber fra denne
   kontrakten):
   ```sql
   select pg_get_functiondef(p.oid)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'rls_auto_enable';
   ```
   Referanse-definisjonen (verifisert 2026-07-07): `RETURNS event_trigger`, `LANGUAGE plpgsql`,
   `SECURITY DEFINER`, `SET search_path TO 'pg_catalog'`, owner `postgres`; kroppen looper
   `pg_event_trigger_ddl_commands()` for `command_tag IN ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')`
   på `public`-tabeller og kjører `alter table if exists … enable row level security`.

2. **Ny migrasjon `supabase/migrations/0138_rls_auto_enable_staging_parity.sql`** (løpenummer etter
   `0137`). Idempotent og safe-no-op der objektene finnes, slik at den kan påføres begge miljøer:
   - `create or replace function public.rls_auto_enable() … security definer set search_path to 'pg_catalog' …`
     (eksakt prod-kropp fra steg 1).
   - Guarded event-trigger (Postgres har **ikke** `create event trigger if not exists` — bruk DO-blokk):
     ```sql
     do $$
     begin
       if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
         execute $ct$ create event trigger ensure_rls on ddl_command_end
           when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
           execute function public.rls_auto_enable() $ct$;
       end if;
     end $$;
     ```
   - **ACL-paritet med prod (0137):** prod-ACL er `{postgres=X/postgres,service_role=X/postgres}` —
     `public`/`anon`/`authenticated` er allerede revoked der. `0137` kjørte kun sin revoke på prod
     (existence-guard no-op'et på staging), så den nye funksjonen på staging må selv matche:
     ```sql
     revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
     ```
     Uten dette får staging-funksjonen default PUBLIC-execute → ny drift + #1121-stil advisory.

3. **Påfør staging** via Supabase MCP `apply_migration` (project `snwmueecmfqqdurxedxv`).

4. **Verifiser staging positivt (I3 — fravær av feil ≠ suksess).** Objektene finnes ikke via
   0-rad-fella; bekreft eksplisitt:
   ```sql
   select
     (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='rls_auto_enable') as has_fn,          -- forvent 1
     (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='rls_auto_enable') as secdef,           -- forvent true
     (select p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='rls_auto_enable') as cfg,              -- forvent {search_path=pg_catalog}
     (select p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='rls_auto_enable') as acl,              -- forvent {postgres=X/postgres,service_role=X/postgres}
     (select count(*) from pg_event_trigger where evtname='ensure_rls' and evtenabled='O') as has_evt; -- forvent 1
   ```
   **Funksjonell røyktest** (bevis at triggeren faktisk fyrer), i transaksjon som rulles tilbake:
   ```sql
   begin;
   create table public._rls_probe_1105 (id int);
   select relrowsecurity from pg_class where relname='_rls_probe_1105';  -- forvent true
   rollback;
   ```

5. **PR.** Ikke bruker-synlig (backend defense-in-depth) → **ingen version-bump, ingen CHANGELOG-linje**;
   bruk commit-prefiks `chore(db):` slik at commit-msg-hooken passerer fritt. `Refs #1105` i
   commit-body, `Closes #1105` i PR-body. Ingen `staging-verify`-skill (ingen UI-flyt) — steg 4 ér
   verifikasjonen.

## Edge Cases & Guardrails
- **Event-trigger uten `IF NOT EXISTS`:** må guardes i DO-blokk (steg 2) — ellers feiler re-kjøring
  på prod/allerede-oppdatert staging med «event trigger already exists».
- **ACL-drift-tilbakefall:** hopp ikke over revoke-linja (steg 2). Uten den divergerer staging igjen
  neste dok-avstemmer-kjøring, og prod-vakta ville flagget en ny `anon`/`authenticated`-EXECUTE-advisory.
- **Ingen prod-DDL-endring kreves:** objektene finnes identisk på prod. Migrasjonen er der en ekte
  no-op (`create or replace` = samme kropp, event-trigger-guard hopper over, revoke allerede kjørt).
- **Ownership:** både funksjon og event-trigger eies av `postgres` på prod; `apply_migration` kjører
  som `postgres`, så eierskapet matcher automatisk. Ikke sett owner eksplisitt.

## Key Decisions
- **Konvergensretning = kun staging får ny DDL.** Issuet slår fast «Ingen prod-endring nødvendig».
  Migrasjonen er skrevet idempotent slik at den *kan* påføres prod for migrasjonshistorikk-paritet,
  men det er **ikke** påkrevd og krever i så fall prod-brannmur-luka (`touch .claude/approve-prod`)
  + eksplisitt eier-godkjenning i økten. Default: hopp over prod-apply; dok-avstemmeren sammenligner
  skjema-objekter (ikke migrasjonshistorikk), så paritet oppnås så snart staging har objektene.
- **Ingen ny pgTAP-test som gate.** `supabase/tests/prod_vakt_hardening_1121_test.sql` utelater bevisst
  `rls_auto_enable` (prod-only). Regresjonsvernet her er dok-avstemmerens skjema-diff, ikke en ny test.

**Claude's Discretion:** eksakt migrasjonsfilnavn-slug (behold prefiks `0138_`), kommentar-stil i
migrasjonen, og hvorvidt en liten pgTAP-assertion legges til (valgfritt, ikke påkrevd). Om eier i
økten ber om prod-paritet: følg staging→verifiser→prod-rekkefølgen bak brannmur-luka.

## Success Criteria
- [ ] `supabase/migrations/0138_rls_auto_enable_staging_parity.sql` finnes, idempotent, med funksjon
      (verbatim prod-kropp) + guarded `ensure_rls` event-trigger + revoke fra public/anon/authenticated.
- [ ] Migrasjonen påført staging; verifikasjons-SELECT (steg 4) gir `has_fn=1`, `secdef=true`,
      `cfg={search_path=pg_catalog}`, `acl={postgres=X/postgres,service_role=X/postgres}`, `has_evt=1`.
- [ ] Funksjonell røyktest (steg 4): ny `public`-tabell i rullet-tilbake transaksjon får `relrowsecurity=true`.
- [ ] Staging↔prod-skjema for dette objektet konvergert (ingen gjenstående `rls_auto_enable`-avvik).
- [ ] PR åpnet med `Closes #1105`; `chore(db):`-commit med `Refs #1105`, uten version-bump/CHANGELOG.

## Gates
- [ ] `npm run build` (grønn — migrasjonen rører ikke TS, men bekreft ingen utilsiktet drift).
- [ ] Migrasjon påført staging via Supabase MCP + verifikasjons-SELECT (I3-positiv bekreftelse).
- [ ] Funksjonell røyktest bestått på staging.

## Files Likely Touched
- `supabase/migrations/0138_rls_auto_enable_staging_parity.sql` — ny migrasjon som oppretter funksjon
  + event-trigger + ACL-hardening på staging (idempotent, safe-no-op på prod).

## Out of Scope
- **Endring på prod.** Objektene finnes der allerede; ingen prod-DDL i default-scope (se Key Decisions).
- **docs/schema-ground-truth.md-oppdatering.** «(kun prod)»- og «ETT avvik»-annotasjonene (linje 121, 183)
  ligger i den auto-genererte seksjonen (`GENERERT-SEKSJON-START`, «ikke rediger for hånd») og selv-korrigeres
  ved neste dok-avstemmer-kjøring når staging har konvergert.
- **Ny pgTAP-test i `supabase/tests/`** som obligatorisk gate (se Key Decisions).
- **Bredere prod↔staging-drift-sweep.** Kun `rls_auto_enable`/`ensure_rls`; andre skjema-fakta matcher
  allerede per #1078.
