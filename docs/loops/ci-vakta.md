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
3. Røde kjøringer av Main verify og Schema drift: `gh run list --workflow main-verify.yml --limit 5` (og tilsvarende for schema-drift.yml)

Ingen funn → én logglinje («alt grønt») og ferdig. Det er suksess, ikke tomgang.

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
drift betyr (prod-skjemaet og `lib/database.types.ts` er ute av sync — noen har
endret databasen utenom migrasjonsflyten, eller en migrasjon mangler
regenererte typer). **Auto-fiks (regenerer typer → PR) er fase 2** og krever
`SUPABASE_ACCESS_TOKEN` i routine-miljøet — en eier-handling.

⚠️ Kjent felle: schema-drift-jobben skipper GRØNT hvis `SUPABASE_ACCESS_TOKEN`
ikke er satt i repo-secrets. Grønn drift-kjøring beviser altså ikke sync med
mindre steget faktisk kjørte — sjekk kjøringsloggen ved tvil.

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
