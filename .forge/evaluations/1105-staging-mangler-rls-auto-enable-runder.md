# Forge-evaluering: #1105 — Staging mangler rls_auto_enable-funksjonen (prod↔staging-konvergens)

**Verdikt: ACCEPT**
**Dato:** 2026-07-08
**Bygger:** nattkjøreren (#1079), modell Opus
**Evaluator:** skeptisk fresh-context gjennomgang (migrasjon + live katalog-introspeksjon mot staging `snwmueecmfqqdurxedxv`, read-only mot prod `glofubopddkjhymcbaph`)

Ren skjema-konvergens: `rls_auto_enable()` + event-triggeren `ensure_rls` fantes på prod men ikke staging. Migrasjonen henter funksjonskroppen verbatim fra prod (I1 — `pg_get_functiondef`, ikke transkribert fra kontrakten), er idempotent/safe-no-op, og er verifisert positivt på staging (I3). Alle kontraktens Success Criteria er bevist med kommando-utfall. Ingen blokkerende funn.

## Runde 1 — ACCEPT

### Grønn-main (fersk main, Node 22, uavhengig kjørt)

| Port | Kommando | Resultat |
|---|---|---|
| Typecheck | `npm run typecheck` | **exit 0** |
| Vitest | `npm test` | **4739/4739** grønne (379 filer) |
| Lint | `npm run lint` | **0 errors** (54 pre-eksisterende warnings) |
| Guard | `bash tests/hooks/guard.test.sh` | **39 bestått, 0 feilet** |

### Ground-truth (prod, read-only — 0 writes)

- `pg_get_functiondef(rls_auto_enable)` hentet verbatim fra prod og limt inn i migrasjonen uten transkripsjon.
- Prod-attributter: `secdef=true`, `cfg={search_path=pg_catalog}`, `acl={postgres=X/postgres,service_role=X/postgres}`, owner `postgres`.
- Prod event-trigger `ensure_rls`: `ddl_command_end`, tags `{CREATE TABLE, CREATE TABLE AS, SELECT INTO}`, `evtenabled=O`, fn `rls_auto_enable`, owner `postgres`.
- Staging før migrasjon: `has_fn=0`, `has_evt=0`, 34 public-tabeller, `tables_without_rls=0` (ingen åpen RLS-luke — ren konvergens).

### Migrasjon påført staging (`0138_rls_auto_enable_staging_parity.sql`)

Applied via Supabase MCP `apply_migration` → `{success:true}`.

### Positiv verifikasjon på staging (I3 — fravær av feil ≠ suksess)

| Sjekk | Forventet | Faktisk |
|---|---|---|
| `has_fn` | 1 | **1** |
| `secdef` | true | **true** |
| `cfg` | `{search_path=pg_catalog}` | **`{search_path=pg_catalog}`** |
| `acl` | `{postgres=X/postgres,service_role=X/postgres}` | **`{postgres=X/postgres,service_role=X/postgres}`** |
| `has_evt` (`evtenabled=O`) | 1 | **1** |
| owner | postgres | **postgres** |
| def_matches (staging `pg_get_functiondef` = prod-streng) | true | **true** (byte-for-byte identisk) |

### Funksjonell røyktest (bevis at triggeren fyrer)

`create table public._rls_probe_1105 (id int)` → `pg_class.relrowsecurity` = **true**. Probe droppet etterpå (`probe_count=0`). Triggeren auto-slår RLS på nye public-tabeller, akkurat som på prod.

### Per-kriterium

| SC | Verdikt | Evidens |
|---|---|---|
| SC1 — migrasjon m/ funksjon (verbatim) + guarded event-trigger + revoke | **PASS** | `0138_...sql`; funksjonskropp verbatim fra prod; event-trigger i DO-guard (ingen `CREATE EVENT TRIGGER IF NOT EXISTS`); `revoke execute ... from public, anon, authenticated`. |
| SC2 — påført staging + verifikasjons-SELECT | **PASS** | Se verifikasjonstabell over — alle felt matcher. |
| SC3 — funksjonell røyktest gir `relrowsecurity=true` | **PASS** | Probe-tabell fikk RLS på automatisk. |
| SC4 — skjema konvergert (ingen gjenstående avvik) | **PASS** | `def_matches=true`, ACL identisk, event-trigger identisk. |
| SC5 — PR m/ `Closes #1105`, `chore(db):`+`Refs #1105`, ingen bump/CHANGELOG | **PASS** | Ikke bruker-synlig backend defense-in-depth → `chore(db):`-prefiks passerer commit-msg-hooken uten bump; PR under. |

### Idempotens / prod-safety

Migrasjonen er en ekte no-op på prod: `create or replace` gir identisk kropp, event-trigger-guarden hopper over (finnes), og revoke ble allerede kjørt av 0137. Ingen prod-DDL påført (utenfor scope per Key Decisions) — kun read-only SELECT mot prod, som er sanksjonert.

## Runde 2 — Kryss-modell-gate (Steg 4.5)

**Modell:** Sonnet (bygget kjørte på Opus — annen modell, egen blindsone).
**Verdikt: CONFIRM.**

Gaten fikk KUN kontrakten, diffen og runde 1-rapporten (fersk kontekst, ingen bygg-historikk) og forsøkte å motbevise at SC1–SC5 er oppfylt. Den stolte ikke på rapporten, men re-verifiserte uavhengig mot live prod (read-only) + staging:

- Funksjonskropp: hentet `pg_get_functiondef` fra prod på nytt og diffet mot migrasjonen — identisk (inkl. `SECURITY DEFINER`, `SET search_path TO 'pg_catalog'`, plpgsql-kropp + RAISE LOG-tekst).
- Event-trigger: prod `ensure_rls` = `ddl_command_end`, tags `{CREATE TABLE, CREATE TABLE AS, SELECT INTO}` — matcher DO-guarden.
- ACL: prod `proacl={postgres=X/postgres,service_role=X/postgres}`, staging nå identisk etter revoke; owner `postgres` begge steder.
- Migrasjonshistorikk: `list_migrations` på staging viser `20260708224215 / rls_auto_enable_staging_parity` — genuint påført, ikke bare påstått.
- Idempotens: kjørte hele migrasjonskroppen på nytt mot staging — ingen feil, `evt_count` forble 1 (ingen dobbel event-trigger), revoke no-op når privilegiet alt er borte.
- Egen røyktest: `create table ... inside rolled-back txn` → `relrowsecurity=true` (triggeren fyrer faktisk).
- Commit-hygiene: `b541dae` er `chore(db):` med `Refs #1105`, kun migrasjonsfila endret, ingen `package.json`/`CHANGELOG.md`-diff.

Ingen substansiell defekt funnet. → **CONFIRM**, gå til levering (Steg 5).
