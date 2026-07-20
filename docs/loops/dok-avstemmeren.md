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

Skjema-snapshotet krever pg_catalog-tilgang mot prod+staging. Den finnes bare via
Supabase MCP (interaktivt) eller Management-API med `SUPABASE_ACCESS_TOKEN` — en
token som **aldri skal inn i routine-miljøer**. Derfor er selve spørringen +
regenereringen flyttet til en ukentlig Actions-jobb (#1122), og hvem som gjør hva
avhenger av hvor du kjører:

- **Sky-routine (Nattkjøreren/Dok-avstemmeren har ikke tokenen):** IKKE spør
  databasene. Les i stedet siste kjøring av dok-skjema-jobben og verifiser
  ferskhet — regenereringen skjer der:

  ```bash
  gh run list --workflow dok-skjema.yml --limit 1 \
    --json conclusion,updatedAt,url --jq '.[0]'
  ```

  Ferskhet: siste vellykkede kjøring **< 8 dager** gammel → steget er dekket,
  noter «skjema-snapshot dekket av dok-skjema-jobben (<dato>)» i heartbeaten.
  Eldre enn 8 dager, eller siste kjøring rød → varsel-issue «Dok-avstemmeren:
  skjema-snapshot er utdatert» (milestone 9), aldri stille grønn. Selve
  regenererings-diffen kommer som en egen docs-PR fra jobben (`claude/dok-skjema-*`)
  som eieren merger — ikke bland den inn i dok-avstemmerens egen docs-PR.

- **Interaktiv økt (du har MCP):** kjør den kanoniske spørringen selv mot BEGGE
  miljøer (prod `glofubopddkjhymcbaph`, staging `snwmueecmfqqdurxedxv`) via
  Supabase MCP `execute_sql`, med assertions og regenerering som før. Dette er
  fortsatt sannheten som Actions-jobben automatiserer.

Den kanoniske spørringen (delt mellom MCP og `.github/scripts/dok-skjema.sh` —
hold dem byte-identiske):

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

**Assertions (rød = hele kjøringen eskalerer, aldri «tomt = OK» — håndheves både
av Actions-jobben og i interaktiv kjøring):**

- Kjernetabellene `games`, `scores`, `users`, `game_players` finnes, har
  `rls=true` og `policies > 0`.
- Tabell-antall ≥ 30 (guard mot å ha truffet feil skjema/prosjekt).
- **Idempotens:** kjør spørringen to ganger mot prod — data-identisk (kanonisk,
  nøkkel-sortert; `json_object_agg` er uordnet, så byte-rekkefølge sammenlignes ikke).

Regenerer så den markør-avgrensede seksjonen i `docs/schema-ground-truth.md`
(mellom `GENERERT-SEKSJON-START/-SLUTT`) fra prod-resultatet. Actions-jobben gjør
dette deterministisk (sortert, flate lister) og åpner en docs-PR ved diff;
interaktive økter kan regenerere manuelt i samme format. Prod↔staging-avvik →
eget issue per avvik (ikke docs-fiks — skjema-avvik er DB-arbeid); Actions-jobben
filer et dedupet issue automatisk for avvik utover det kjente (`rls_auto_enable`).

## Steg 2 — Claims-manifest

Verifiser hver påstand med kommandoen; avvik → fiks i docs-PR-en. Manifestet
utvides når nye målbare claims dukker opp i styringsdokumentene.

| # | Påstand (hjem) | Bevis-kommando | Sist verifisert |
|---|---|---|---|
| C1 | CLAUDE.md → Datamodell: tabell-antall og peker til generert seksjon | Steg 1-spørringen (`tables_total`) | 2026-07-20 (35) |
| C2 | CLAUDE.md → Scoring: tall-løs formulering + fasit-kommando | `npx vitest run lib/scoring` | 2026-07-20 (1029) |
| C3 | CLAUDE.md → Samarbeidsmodell: SQL-tilgang beskriver MCP + staging-først + prod-luke | grep «Supabase MCP» CLAUDE.md; `.claude/hooks/mcp-guard.sh` finnes | 2026-07-20 |
| C4 | forge-workflow.md: primær kontrakt-søkemetode er per-issue-iterasjon | `gh search issues ... in:comments` returnerer tomt (kjent); per-issue `gh api .../comments` virker | 2026-07-20 (doc-innhold; gh-quirk ikke re-testbar fra sky) |
| C5 | schema-ground-truth.md: generert seksjon < 15 dager gammel | dato i seksjons-headeren vs `date -u` | 2026-07-20 |
| C6 | docs/test-discipline.md-terskler vs pre-commit-hook: kjent tre-tall-avvik (3/5/10) er ENTEN uendret ELLER løst per eierbeslutning | grep toContain i begge filer | 2026-07-20 (3/5/10-trapp konsistent) |

## Steg 3 — Memory-drift-flagg (best effort — kun lokale kjøringer)

Agent-memoryen ligger på eierens maskin
(`~/.claude/projects/-Users-jdl-Dokumenter-GitHub-golf-app/memory/`) og finnes
IKKE i sky-kloner. **Dokumentert SKIP-utfall (#1115):** finnes ikke katalogen,
noter «steg 3 hoppet over (cloud — memory er lokal)» i heartbeaten og gå
videre — det er forventet, ikke en feil. Memory-drift dekkes da av interaktive
økter og consolidate-memory-skillet; funn derfra mates inn i claims-manifestet
som alt annet.

Når katalogen finnes (lokal kjøring): grep for «out of date», «stale»,
«utdatert», «drift». Hvert treff som peker på et repo-dokument → verifiser og
ta fiksen med i docs-PR-en. Memory-filene selv røres ikke av loopen.

## Steg 4 — Lever

1. Én docs-PR («docs: dok-avstemmeren <dato>») med alle fakta-fikser + regenerert
   seksjon. Bevis-kommando i hver commit-body.
2. Issues for: skjema-avvik prod↔staging, regel-avvik (eierbeslutning),
   uverifiserbare claims. Alltid med milestone (9 = Backlog hvis ingen passer).
3. Ingen funn → én linje («alt avstemt») — det er suksess.
4. **Heartbeat (ALLTID):** avslutt hver kjøring med én kommentar på det pinnede
   Loop-drift-issuet **#1110**: `📋 Dok-avstemmeren <dato>: <utfall>` (docs-PR
   åpnet / alt avstemt / fikk ikke verifisert). Morgenbriefen bruker den som
   liveness-signal.
