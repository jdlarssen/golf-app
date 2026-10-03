# CI-vakta — fix-protokoll (#1075, epic #1073)

Protokollen den timelige CI-vakt-routinen følger. Kan også kjøres manuelt i en
vanlig sesjon («kjør CI-vakta»). Målet: ingen rød check skal vente på at et
menneske oppdager den — og ingen rød kjøring skal dø stille.

## Harde rammer (fra epic #1073 — brudd er aldri OK)

- **ALDRI merge.** Leveransen er commits på `claude/`-brancher, PR-er og norske
  kommentarer — eieren merger.
- **Aldri prod.** Prod-brannmuren (#1074) gjelder også i sky-kloner (hooks
  følger repoet). Routine-miljøet skal kun ha staging-nøkler.
- **Fail-closed.** «Fikk ikke verifisert» rapporteres eksplisitt — aldri stille
  exit.

## 1. Oppdag

Sjekk i denne rekkefølgen, og samle ALLE funn før fiksing:

1. Åpne `CI-vakt:`-varsel-issues: `gh issue list --state open --search "CI-vakt in:title"`
2. Røde checks på åpne PR-er: `gh pr list --state open --json number` → `gh pr checks <n>`
3. Røde kjøringer av Main verify, Schema drift, Migration ledger og Ukeslipp-release: `gh run list --workflow main-verify.yml --limit 5` (og tilsvarende for schema-drift.yml, migration-ledger.yml og ukeslipp-release.yml)
4. Manglende PR-kjøringer: åpen PR der `gh pr checks <n> --json name,workflow,event` mangler jobbene `verify` og `e2e` (fra `CI`, eller `CI (docs no-op)` for rene dokument-PR-er) og `scan` (fra `Secret scan`) for gjeldende head → se §1b. Med REST (GitHub MCP): `GET /repos/{owner}/{repo}/actions/runs?head_sha=<headRefOid>`, der hver kjøring har `name` (workflow-navnet) og `event`. Vanlig `gh pr checks <n>` viser bare jobbnavnene (`verify`, `e2e`, `scan`), ikke workflow-navnene.

Ingen funn → én logglinje («alt grønt») og ferdig. Det er suksess, ikke tomgang.

**Kjent, uendret `CI-vakt:`-issue (allerede eskalert, root cause under
interaktiv oppfølging):** ikke post en ny kommentar bare fordi runden fant
det samme mønsteret som forrige gang. Sammenlign mot forrige kommentar FØR du
skriver noe nytt — kommentér kun når noe faktisk er nytt: en ny forekomst av
mønsteret, en CI-kjøring med et annet utfall enn sist, eller at root cause er
bekreftet/avkreftet. Uendret tilstand rapporteres kun i rutinens egen logg
(synlig via claude.ai/code/routines), aldri som en ny issue-kommentar — jf.
linjen over. Timelige «ingen nye forekomster»-kommentarer på samme issue er
selve feilen #1711 dokumenterte (56/86 duplikater på #1582/#1572 på åtte
dager); ikke gjenta mønsteret.

## 1b. Manglende PR-kjøringer (#2335)

En PR som mangler `pull_request`-kjøringer, har nesten alltid mergekonflikt
eller en base som ikke er `main`. Begge står i GitHubs dokumentasjon
(https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request):
«Workflows will not run on `pull_request` activity if the pull request has a
merge conflict.» og «You can use the `branches` or `branches-ignore` filter to
configure your workflow to only run on pull requests that target specific
branches.» `ci.yml`, `secret-scan.yml`, `migrations-gate.yml` og
`ci-docs-noop.yml` har `pull_request: branches: [main]`. #2335 og #1582 var
dette, ikke en tilfeldig event-svikt hos GitHub.

**Steg 1, les tilstanden:**
`gh pr view <n> --json mergeable,mergeStateStatus,baseRefName,headRefName,headRefOid`

Med REST-feltene betyr `mergeable` = `false` eller `mergeable_state` = `dirty`
konflikt, og `mergeable` = `null` eller `mergeable_state` = `unknown` betyr
vent. `null` betyr aldri «ingen konflikt». Base er `base.ref`, grenen er
`head.ref` og head-SHA er `head.sha`.

**Steg 2, velg handling.** Les tabellen ovenfra. Første rad som passer,
gjelder. Base-raden står først: GitHub regner `mergeable` mot PR-ens egen base,
så en stablet PR med konflikt mot basen sin er `CONFLICTING`, og konfliktveien
(ny gren fra `origin/main`) ville mistet commitene fra base-PR-en.

| Tilstand | Handling |
|---|---|
| `baseRefName` er ikke `main` | Ikke dispatch. Stablet PR er med vilje ikke gatet før base er `main`. Gjelder også når den har konflikt mot basen sin. |
| `mergeable` = `CONFLICTING` eller `mergeStateStatus` = `DIRTY` | Ikke dispatch. Konfliktveien (under). |
| `mergeable` = `UNKNOWN` | Ikke dispatch. GitHub regner fortsatt. Sjekk igjen neste runde. |
| `MERGEABLE`, base `main`, ingen kjøring for `headRefOid` | Dispatch `ci.yml` og `secret-scan.yml` (og `migrations-gate.yml` hvis PR-en rører `supabase/migrations/**`, `supabase/tests/**`, `supabase/config.toml` eller `.github/workflows/migrations-gate.yml`) med `gh workflow run <fil> --ref <headRefName>`. Med REST: `POST /repos/{owner}/{repo}/actions/workflows/<fil>/dispatches` med body `{"ref": "<headRefName>"}`, svar 204. |

- Etter et base-bytte (stablet PR får base `main`) leser vakta `mergeable` på
  nytt. Base-byttet er aktiviteten `edited`, og den starter ingen kjøring av
  seg selv: «By default, a workflow only runs when a `pull_request` event's
  activity type is `opened`, `synchronize`, or `reopened`.» Med rebase-merge
  blir PR-en ofte `CONFLICTING` (#2388), og da gjelder konfliktraden.
- `gh workflow run --ref <gren>` kjører på grenens tips i det øyeblikket, ikke
  på `headRefOid`. Har grenen fått nye pushes siden steg 1 (#2320 fikk pushes
  mens vakta så på den), dispatcher ikke vakta. Den sjekker igjen neste runde.
- Hver dispatch av `ci.yml` koster mer enn en vanlig PR-kjøring:
  lifecycle-steget i `e2e`-jobben (`npm run e2e:lifecycle`) kjører bare ved
  `workflow_dispatch` (`if: ${{ github.event_name == 'workflow_dispatch' }}`,
  `continue-on-error: true`) og holder `e2e-staging`-køen lenger. Verste målte
  kjøring er 6m51s, mot PR-p95 5m18s (kommentaren over `timeout-minutes` i
  `e2e`-jobben i `ci.yml`). Andre PR-er venter i køen så lenge.
- Ren dokument-PR: `ci-docs-noop.yml` har ingen `workflow_dispatch`. Eneste CI
  vakta kan dispatche er da hele `ci.yml`, med full verify, e2e mot delt
  staging og lifecycle-steget over. Det gir riktige sjekker, men koster
  minutter og holder køen for andre PR-er.
- En dispatchet `secret-scan.yml` skanner hele historikken, og feiler den,
  åpner den issuet «CI-vakt: secret-scan rød» (det skjer på alle kjøringer som
  ikke er `pull_request`). En rød dispatchet skanning kan være en
  historikkfelle og ikke PR-en: #2470 kom slik fra fingeravtrykk-fella i
  #2308, etter dispatch på konflikt-PR-en #2468 (kjøring 36983743918). Les
  funnet før du gir PR-en skylda.

**Steg 3, konfliktveien.** GitHub kjører ingenting før konflikten er løst, og
en dispatch på grenen tester ikke det som skal merges. En bakgrunnsøkt kan ikke
force-pushe (bash-guard krever godkjenning ingen kan gi der), og en
merge-commit fra main hjelper ikke med rebase-merge. Løsningen er
#2262-mønsteret: ny gren fra nyeste `origin/main`, `git cherry-pick` av
PR-ens commits, løs konflikten, ny PR som skriver «Erstatter #N» i body, lukk
den gamle. Les `mergeable` igjen når den nye PR-en er åpnet: #2369 fikk selv
konflikt da #2367 ble merget, og måtte erstattes av #2370. Presedens: #2368 →
#2369 → #2370, #2468 → #2469 og #2377 → #2378.

- **Hvem gjør konfliktveien:** økta som eier grenen. Vakta gjør det ikke selv
  og force-pusher aldri. Den skriver én norsk kommentar på PR-en med
  konflikten og oppskriften over, én gang per head-SHA. Da lager ikke vakta og
  eier-økta hver sin erstatnings-PR når begge jobber på grenen samtidig
  (#2320).
- **Rapportering:** funnet står i rundens rapport (rutineloggen) som «PR #N:
  konflikt, ingen dispatch» eller «PR #N: stablet, ingen dispatch». Ingen nytt
  `CI-vakt:`-issue, for det er ikke en CI-feil. Regelen i §1 mot gjentatte
  kommentarer gjelder: samme PR og samme head-SHA gir ingen ny kommentar.

## 2. Reproduser FØR fiks (obligatorisk)

- Kjør den feilende gaten i klonen: `npm ci` → `npm run typecheck` /
  `npm test` / `npm run lint` / `bash tests/hooks/guard.test.sh` (den som var rød).
- For PR-checks: sjekk ut PR-branchen først (`gh pr checkout <n>`).
- **Stafettbytte i Discord PR-kortet er IKKE rødt og IKKE flake (#2095).** En
  `cancelled` `post-card`-kjøring er et planlagt bytte når (a) en `Discord PR-kort`-
  kjøring med event `workflow_run` ble opprettet innen ~30 s før kanselleringen,
  eller (b) PR-en har `discord:merge-kort`-labelen med tidsstempel etter
  kanselleringen. Da: ingen issue, ingen kommentar, ingen re-dispatch. Relékjøringer
  listes under main sin SHA, ikke PR-ens. Spor dem med metoden i
  `docs/loops/discord-pr-kort.md` §«Spore en kort-kjøring». (Etter #2095 gir
  ready-kjøringen fra seg selv mens ci.yml kjører, så dette skal bli sjeldent.)
- **Rød som blir grønn ved re-kjøring uten endring = flake-kandidat.** Fil eget
  issue (label `bug`, milestone 9, tittel «Flake-kandidat: <test>») og IKKE
  regn funnet som løst. Dette er dataene som evt. rettferdiggjør en flake-jeger
  senere (#1073 forkastet den inntil videre).
- Klarer du ikke reprodusere og det heller ikke er flake (f.eks. miljøfeil i
  Actions): kommenter funnet med logglinjene og la varsel-issuet stå åpent.

## 3. Fiks — med tak og vern

- Maks **3 iterasjoner** per funn (én iterasjon = endring + gate-kjøring).
- Hver commit har `Refs #<varsel-issue eller PR-issue>` i body.
- **Endring av test-assertions krever begrunnelse i commit-body** («assertionen
  var feil fordi …»). Uten begrunnelse er trekket forbudt — anta heller at
  koden er feil og testen har rett.
- Aldri `--no-verify`, aldri force-push (bash-guard håndhever).

## 4. Lever

- **Rød main-verify:** fix på ny `claude/ci-vakt-<kort-slug>`-branch → PR mot
  main med `Refs #<varsel-issue>` (ikke `Closes` — issuet lukkes når main
  faktisk er grønn igjen). Norsk PR-kommentar: hva var rødt, årsak, hva ble gjort.
- **Rød PR-check på `claude/`-branch:** commit rett på PR-ens branch + norsk
  kommentar på PR-en.
- **Rød PR-check på annen branch:** aldri push til andres brancher — kommenter
  PR-en med diagnose og diff-forslag.
- **Manglende PR-kjøringer:** se §1b. Dispatch bare når PR-en er `MERGEABLE` og
  har base `main`.
- **Grønt etter fiks:** lukk tilhørende `CI-vakt:`-varsel-issue med én
  setnings-kommentar (hva som var årsaken).

## 5. Eskalér ved ikke-konvergens

Etter 3 iterasjoner uten grønt: **aldri kast delarbeid, aldri stille exit.**

- Push delarbeidet som draft-PR.
- Norsk kommentar på varsel-issuet med: de faktiske logglinjene (kort utdrag),
  hva som ble prøvd per iterasjon, og ÉN konkret hypotese formulert slik at
  eieren kan svare A/B uten å lese kode.

## 6. Schema-drift rød (v1 — kun eskalering)

Varsel-issuet fra workflowen er leveransen i v1. Forklar på norsk i issuet hva
drift betyr (skjemaet og `lib/database.types.ts` er ute av sync — noen har
endret databasen utenom migrasjonsflyten, eller en migrasjon mangler
regenererte typer). **Auto-fiks (regenerer typer → PR) er fase 2** og krever
`SUPABASE_ACCESS_TOKEN` i routine-miljøet — en eier-handling.

**To mål, ett per hendelse (#1532)** — les alltid hvilket mål kjøringen brukte
(står i jobbens notice og i feilmeldingen) før du diagnostiserer:

- **PR** (endrer `supabase/migrations/**`) → sammenlignes mot **staging**.
  Migrasjoner går staging-først, så en PR som er migrert på staging og har typer
  regenerert fra staging skal være grønn selv om prod ikke er påført ennå.
  Fiks ved rødt: `npx supabase gen types typescript --project-id
  snwmueecmfqqdurxedxv --schema public > lib/database.types.ts` og commit.
- **Cron (nattlig)** → sammenlignes mot **prod**. Dette er avstemmingen mot
  virkeligheten og skal aldri flyttes til staging. Fiks ved rødt: sjekk FØRST
  om en merget migrasjon venter på prod-påføring (samme situasjon som §6b —
  migrasjons-porten har da typisk sitt eget issue). I så fall er dette §6b:
  **ikke** regenerer typene fra prod — det stripper staging-kolonnene koden på
  main kompilerer mot og knekker `tsc`. Fiks = prod-påføring i en økt med eier,
  så blir cron-drift grønn av seg selv. Kun når ingen migrasjon venter (noen
  har endret prod utenom migrasjonsflyten): `npm run gen:types` (leser prod)
  og commit.
- **Manuell kjøring** (workflow_dispatch) → `target`-input, `prod` som default.
  Bruk `staging` for å bevise staging-grenen fra en PR-branch.

⚠️ Felle: staging er delt. Andre økter kan ha migrasjoner liggende på staging
som ikke er i din PR — da blir PR-drift rød av fremmed diff. Rødt er ærlig nok
(typene ER ute av sync med staging), men fiksen er ikke din PR: regenerer typene
fra staging når staging er riktig, eller rydd bort den fremmede migrasjonen på
staging. Nevn funnet på PR-en så det ikke ser ut som din endring.

⚠️ Kjent felle: schema-drift-jobben skipper GRØNT hvis `SUPABASE_ACCESS_TOKEN`
ikke er satt i repo-secrets. Grønn drift-kjøring beviser altså ikke sync med
mindre steget faktisk kjørte — sjekk kjøringsloggen ved tvil.

## 6b. Migrasjons-porten rød (merget men ikke påført prod)

Workflow `migration-ledger.yml` (daglig 03:40 UTC + dispatch) leser prods
`supabase_migrations.schema_migrations` read-only og sammenligner mot
`supabase/migrations/` (#1410). Tre utfall, alle med eget dedupet issue:

- **«Prod-vakt: migrasjoner merget men ikke påført prod»** (label `prod-vakt`)
  lister filene som mangler. Dette er et ekte prod-hull: koden er ute, regelen
  den hviler på er ikke i basen — funksjonen feiler stille. **Fiks = påføring i
  en økt med eier** (prod-brannmuren #1074; MCP `apply_migration` med filnavnet
  uten `NNNN_` som navn, staging først). Sky-kjøringer skal IKKE prøve å påføre
  — kommenter på issuet med hvilken PR som innførte fila og hva som er
  konsekvensen i appen, og la det stå åpent som handoff. Porten lukker issuet
  selv ved neste grønne kjøring.
- Fila BLE påført, men under et annet navn eller utenom hovedboka (SQL Editor):
  verifiser funksjonelt i prod (policy/constraint/funksjon finnes), og legg
  linja i `docs/loops/migration-ledger-baseline.txt` via PR med dato + hva som
  ble sjekket. Aldri baseline uten verifisering — da har porten et blindpunkt.
- **«Migrasjons-porten: fikk ikke lest hovedboka i prod»** / «CI-vakt:
  migrasjons-porten rød»: selve lesingen røk (token, API, skript). Behandles
  som funn — uten lesing er tilstanden usynlig igjen. Reproduser med
  `LEDGER_FILE=<json>`-kroken lokalt (se skriptets hode) før fiks.

Matching er navn uten nummerprefiks; hovedboka begynner ved 0010 (0001–0009
gikk via SQL Editor og sjekkes ikke). `::warning` om hovedbok-rader uten fil på
main betyr SQL påført prod utenom repoet — dok-skjema-jobben eier den driften.

## 7. Prod-vakt-issues (runtime-signaler fra prod)

Åpne issues med label `prod-vakt` (filet av prod-vakt-workflowen, se
docs/loops/prod-vakta.md) er del av oppdagelsen i steg 1. Håndtering:

- Les tellingene/advisory-nøklene i issuet. **Detaljer som krever
  Supabase-tilgang** (loggutdrag, spørringer) kan bare hentes i interaktive
  økter — sky-kjøringer diagnostiserer fra koden alene (grep etter sannsynlige
  feilkilder, les berørte moduler).
- **Bug med klar rotårsak og lite omfang:** fiks direkte (stående
  bug-fullmakt, jf. CLAUDE.md «Direct bug-fix execution») → PR med
  `Refs #<prod-vakt-issue>`. Aldri merge, aldri prod-skriv.
- **Ny advisory som er et bevisst valg, eller ny type postgres-feil som er
  diagnostisert og godtatt (`pg:<SQLSTATE>`):** foreslå baseline-tillegg som PR
  med begrunnelse — aldri stille aksept, aldri rediger baseline uten PR.
- **Uklart, stort, eller trenger loggdetaljer:** norsk kommentar på issuet med
  hva som er sjekket i koden og hva en interaktiv økt må hente — issuet blir
  stående åpent som handoff.

## 8. Discord-ping ved handling (best effort)

Finnes `DISCORD_WEBHOOK_URL` i miljøet: post én kort melding når kjøringen
ÅPNER en fiks-PR («🔧 CI-vakta la fiks-PR #N — <lenke>») eller ESKALERER
(«⚠️ CI-vakta trenger deg på #N — <lenke>»). Ikke ping «alt grønt»-kjøringer
(det er støy — briefen dekker digest). Mangler variabelen: hopp stille over.
(Krever at routinen får et minimalt miljø med kun webhook-variabelen og
`discord.com` i domenelista — ALDRI staging-/prod-nøkler i CI-vaktas miljø.)

## Routine-oppsett (ops, post-merge)

- Cloud routine, timelig (minimumsintervallet), prompt: «Følg
  docs/loops/ci-vakta.md i jdlarssen/golf-app fra topp til bunn.»
- Nettverks-allowlist trenger kun GitHub/npm (default Trusted) i v1.
- Heartbeat: CI-vakta poster IKKE heartbeat på Loop-drift-issuet #1110 i v1
  (24 kommentarer/døgn er støy). Liveness sees på claude.ai/code/routines;
  Morgenbriefen (#1080) flagger i stedet `CI-vakt:`-issues eldre enn 24 t uten
  aktivitet.
