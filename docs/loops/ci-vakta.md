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
3. Røde kjøringer av Main verify, Schema drift og Migration ledger: `gh run list --workflow main-verify.yml --limit 5` (og tilsvarende for schema-drift.yml og migration-ledger.yml)

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

## 2. Reproduser FØR fiks (obligatorisk)

- Kjør den feilende gaten i klonen: `npm ci` → `npm run typecheck` /
  `npm test` / `npm run lint` / `bash tests/hooks/guard.test.sh` (den som var rød).
- For PR-checks: sjekk ut PR-branchen først (`gh pr checkout <n>`).
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
- **Ny advisory som er et bevisst valg:** foreslå baseline-tillegg som PR med
  begrunnelse — aldri stille aksept, aldri rediger baseline uten PR.
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
