# Dok-avstemmeren — sannhet mot terreng (#1078, epic #1073)

Ukentlig read-only loop som avstemmer styringsdokumentene mot virkeligheten
(live DB, repo, hooks) og retter *etterprøvbare fakta* — aldri regler. Kjøres av
en planlagt cloud-routine, eller manuelt («kjør dok-avstemmeren»).

## Harde rammer

- **Read-only mot databasene:** kun SELECT (mot prod er det sanksjonert og
  logges av prod-brannmuren som `allow-prod-readonly`). Aldri skriv.
- **Normative skal/må-regler endres ALDRI automatisk.** Bare fakta som kan
  bevises med en kommando (stier, tall, kommandoer som virker/ikke virker).
  Regel-avvik (samme grense med ulike verdier i flere hjem) → issue med label
  `needs-brainstorming` eller vanlig bug + milestone, aldri stille harmonisering.
- **Fail-closed:** MCP nede, tom respons eller assertion rød → issue «Dok-avstemmeren
  fikk ikke verifisert» med detaljer. Aldri stille grønn skip.
- **Utfall per kjøring:** maks ÉN docs-PR (alle fakta-fikser samlet) + issues.
  `git diff --stat` i PR-en skal kun vise `.md`-filer. Commit-bodies siterer
  bevis-spørringen/kommandoen for hvert fikset faktum.

## Steg 1 — Skjema-snapshot (prod + staging)

Kjør den kanoniske spørringen mot BEGGE miljøer (prod `glofubopddkjhymcbaph`,
staging `snwmueecmfqqdurxedxv`) via Supabase MCP `execute_sql`:

```sql
select json_build_object(
  'rls', (select json_agg(json_build_object('tbl', relname, 'rls', relrowsecurity, 'policies', (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname)) order by relname)
          from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relkind='r'),
  'checks_total', (select count(*) from pg_constraint where connamespace='public'::regnamespace and contype='c'),
  'checks_by_tbl', (select json_object_agg(tbl, n) from (select conrelid::regclass::text tbl, count(*) n from pg_constraint where connamespace='public'::regnamespace and contype='c' group by 1) s),
  'triggers', (select json_agg(json_build_object('tbl', t.tgrelid::regclass::text, 'name', t.tgname) order by t.tgrelid::regclass::text, t.tgname)
               from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and not t.tgisinternal),
  'secdef', (select json_agg(proname order by proname) from pg_proc where pronamespace='public'::regnamespace and prosecdef)
) as snapshot;
```

**Assertions (rød = hele kjøringen eskalerer, aldri «tomt = OK»):**

- Kjernetabellene `games`, `scores`, `users`, `game_players` finnes, har
  `rls=true` og `policies > 0`.
- Tabell-antall ≥ 30 (guard mot å ha truffet feil skjema/prosjekt).
- **Idempotens:** kjør spørringen to ganger mot prod — byte-identisk JSON
  (fanger at spørringen selv er deterministisk).

Regenerer så den markør-avgrensede seksjonen i `docs/schema-ground-truth.md`
(mellom `GENERERT-SEKSJON-START/-SLUTT`) fra prod-resultatet, i formatet som
står der. Prod↔staging-avvik → eget issue per avvik (ikke docs-fiks — skjema-
avvik er DB-arbeid).

## Steg 2 — Claims-manifest

Verifiser hver påstand med kommandoen; avvik → fiks i docs-PR-en. Manifestet
utvides når nye målbare claims dukker opp i styringsdokumentene.

| # | Påstand (hjem) | Bevis-kommando | Sist verifisert |
|---|---|---|---|
| C1 | CLAUDE.md → Datamodell: tabell-antall og peker til generert seksjon | Steg 1-spørringen (`tables_total`) | 2026-07-07 (34) |
| C2 | CLAUDE.md → Scoring: tall-løs formulering + fasit-kommando | `npx vitest run lib/scoring` | 2026-07-07 |
| C3 | CLAUDE.md → Samarbeidsmodell: SQL-tilgang beskriver MCP + staging-først + prod-luke | grep «Supabase MCP» CLAUDE.md; `.claude/hooks/mcp-guard.sh` finnes | 2026-07-07 |
| C4 | forge-workflow.md: primær kontrakt-søkemetode er per-issue-iterasjon | `gh search issues ... in:comments` returnerer tomt (kjent); per-issue `gh api .../comments` virker | 2026-07-07 |
| C5 | schema-ground-truth.md: generert seksjon < 15 dager gammel | dato i seksjons-headeren vs `date -u` | 2026-07-07 |
| C6 | docs/test-discipline.md-terskler vs pre-commit-hook: kjent tre-tall-avvik (3/5/10) er ENTEN uendret ELLER løst per eierbeslutning | grep toContain i begge filer | 2026-07-07 (issue filet) |

## Steg 3 — Memory-drift-flagg

Grep agent-memory (`~/.claude/projects/-Users-jdl-Dokumenter-GitHub-golf-app/memory/`)
for «out of date», «stale», «utdatert», «drift». Hvert treff som peker på et
repo-dokument → verifiser og ta fiksen med i docs-PR-en. Memory-filene selv
røres ikke av loopen.

## Steg 4 — Lever

1. Én docs-PR («docs: dok-avstemmeren <dato>») med alle fakta-fikser + regenerert
   seksjon. Bevis-kommando i hver commit-body.
2. Issues for: skjema-avvik prod↔staging, regel-avvik (eierbeslutning),
   uverifiserbare claims. Alltid med milestone (9 = Backlog hvis ingen passer).
3. Ingen funn → én linje i kjøringsloggen («alt avstemt») — det er suksess.
   Når Morgenbriefen (#1080) finnes: heartbeat-kommentar der.
