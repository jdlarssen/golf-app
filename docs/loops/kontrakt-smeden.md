# Kontrakt-smeden — daglig kontrakt-forberedelse (#1150, epic #1073)

Daglig cloud-routine som skriver forge-kontrakter for buildbare, kontraktløse
issues, så natt-køen aldri sulter. Kontraktene postes som issue-kommentarer og
auto-køes som hovedregel (`autonomy:ready` settes av smeden selv; ⏸-veto i
morgenbriefen gjelder hele dagen) — nattkjøreren bygger dem påfølgende natt.
Kun aldri-auto-kategoriene (steg 3) venter på eierens 🌙-tapp i briefen.
Produktvalg stopper ikke løpet: de dokumenteres som alternativer i kontrakten
og besvares av eieren i PR-en (#1406, eierbeslutning 2026-07-30 i #1413).

**Selv-begrensende med vilje:** smeden rører kun issues UTEN kontrakt. Når
backloggen er kontraktert finner den ingenting nytt og avslutter billig — som
CI-vaktas grønne no-op. Daglig kadens er derfor en kort startbyrde, ikke en
stående kostnad.

## Harde rammer (brudd er aldri OK)

- **Aldri gjett stille på gråsoner.** Et produktvalg smeden tar selv skal ALLTID
  stå dokumentert som alternativer i kontrakten (steg 2), slik at eieren kan
  overprøve det i PR-en («alternativ B») per auto-merge-policyen (#1406). En
  udokumentert gjetning fanges først ved eierens merge — det er bruddet, ikke
  det å velge. Kan du ikke engang formulere Success Criteria, rut til eieren
  (steg 2, uskopbar).
- **Aldri merge, aldri prod.** Smeden POSTER kun kommentarer og heartbeat. Ingen
  kode-endring, ingen PR, ingen skriv mot prod (brannmuren #1074 gjelder i skyen).
- **Fail-closed.** gh/MCP nede, tomt resultat, uklar tilstand → hopp + heartbeat
  «kunne ikke kjøre», aldri stille exit.
- **Ikke overhal eieren.** Se throttle (steg 4) — skriv aldri flere kontrakter
  når eierens godkjenn-kø allerede er full.

## Steg 1 — Finn kandidater (positivt inklusjonssignal)

`gh issue list --state open` → behold issues der ALT stemmer:

- **ingen kontrakt:** ingen kommentar med header «📋 Forge-kontrakt tilgjengelig»
  OG ingen `.forge/contracts/<n>-*.md` på main, OG
- **ikke `autonomy:blocked` og ikke `parked`** (parkert = eieren har sagt
  «ikke nå» — via ⏸-knappen eller manuelt), OG
- **buildbar type:** label `enhancement` eller `bug`. Milestone er IKKE lenger
  en port (eierbeslutning 2026-07-30, #1413): hele backloggen er smedens
  jaktmark, også «Backlog — uplanlagt / scale-triggered» (#9). Milestone brukes
  kun til SORTERING — kandidater i ekte tiers kontrakteres før
  backlog-milestonen, eldst først innen hver gruppe. Eierens kontroll flytter
  til PR-leddet (alternativ-svar) og ⏸/🗑 i briefen; et åpent, type-labelet,
  ikke-parkert issue er mandat nok.
- **eksplisitt ekskludert:** #1110 (Loop-drift-tavla) og alt smeden ikke trygt kan
  avgrense (fanges av tvil-vurderingen i steg 2).

Ingen kandidater → heartbeat «ingen nye» og avslutt. Suksess, ikke tomgang.

## Steg 2 — Vurder egen tvil: produktvalg dokumenteres, de rutes ikke

Per kandidat, klassifiser:

- **Mekanisk / høy tillit:** klar cleanup, bug med tydelig repro, veldefinert
  endring med ett åpenbart designvalg → steg 3.
- **Epic:** label `epic` → hopp alltid. En epic er aldri én kontrakt; deler
  brytes ut som egne issues av eieren.
- **Gråsone med produktvalg (ett eller flere fornuftige alternativer):** IKKE
  spør eieren på forhånd — den gamle `autonomy:needs-decision`-rutingen er
  avviklet (eierbeslutning 2026-07-30, #1413; PR-alternativ-modellen #1406 tok
  over jobben). Velg det beste alternativet selv (A) og skriv kontrakten
  (steg 3) med en egen seksjon `## Alternativer (produktvalg)`: A = valgt
  bygge-retning med begrunnelse, B (og evt. C) beskrevet med fordeler/ulemper
  på norsk i eierens produktspråk. Nattkjøreren løfter seksjonen inn i
  PR-kommentaren; eieren svarer «alternativ B» i PR-en hvis A ikke er riktig,
  og ombygging skjer på samme branch. Sett `"produktvalg": true` i kontraktens
  json-blokk.
- **Uskopbar (kan ikke formulere Success Criteria):** eneste gjenværende
  ruting. Post kontrakt-forarbeid med header `## 🛠 Kontrakt-forarbeid
  (gråsone)` — scoped kontekst, filer, åpne spørsmål listet, anbefalt retning
  (ikke spekulativ full-kontrakt) — og sett label
  `autonomy:needs-contract-session`. Morgenbriefen løfter den med
  kopier-lim-klar `/forge:contract`-kommando + 🗑/⏸-knapper.

I tvil om mekanisk vs. produktvalg: behandle som produktvalg (dokumentér
alternativene — det koster en seksjon, ikke en eier-runde). I tvil om
skopbar vs. uskopbar: uskopbar (fail-closed).

**Re-run-semantikk (eldre rutede kandidater):**

- Kandidat med legacy-label `autonomy:needs-decision`: let etter en
  issue-kommentar som matcher `^Eierbeslutning via Discord: \*\*(A|B)\*\*`
  postet ETTER spørsmålskommentaren. Funnet → fjern labelen og skriv
  kontrakten (steg 3) med valget som Key Decision. Ikke funnet → fjern labelen
  og skriv en alternativ-kontrakt: ditt anbefalte svar blir A, det andre
  blir B i `## Alternativer (produktvalg)` — spørsmålet flytter til PR-en i
  stedet for å vente. Dropp-/utsett-kvitteringene («droppet 🗑» / «utsatt ⏸»)
  matcher aldri regexen — de bærer ikke fet A/B (test-låst i
  lib/loops/discordActions.test.ts).
- Kandidat med `autonomy:needs-contract-session`: hopp — eierens trekk er å
  kjøre `/forge:contract` i en interaktiv økt, eller tappe 🗑/⏸.

**Ruting-cap:** ruting-handlinger teller mot 5-handlinger-per-kjøring-capen
(steg 4). I tillegg: er ≥5 åpne issues allerede merket
`autonomy:needs-contract-session`, rut ingen nye uskopbare denne kjøringen —
heartbeat «venter på eier: N ubesvarte». Samme prinsipp som throttlen:
aldri overhal eieren.

## Steg 3 — Skriv kontrakt

- Skriv kontrakten grunn-forankret i koden, samme form som #1147: Problem, Design,
  Edge Cases & Guardrails, Key Decisions, Success Criteria, Gates, Files Likely
  Touched, Out of Scope — pluss `## Alternativer (produktvalg)` når steg 2
  klassifiserte kandidaten som produktvalg (A valgt + B/C med fordeler/ulemper
  på norsk).
- **Fersk-kontekst-verifisering (obligatorisk):** spawn en general-purpose Task-
  agent — `model` eksplisitt satt til **Opus** (Fable orkestrerer, Opus gjør
  feltarbeidet, jf. Routine-oppsett) — som verifiserer kontrakten mot faktiske
  filer/linjer. Finner den PROBLEM (feil fil, umulig antakelse, manglende
  dekning) → fiks, eller nedgrader til uskopbar og rut per steg 2. Ingen
  uverifisert kontrakt postes.
- **Klassifiser kontrakten (#1302):** eieren kan ikke lese kontrakter, så hver
  kontrakt bærer et maskinlesbart felt rett under headeren som ruter godkjenn-køen:

  ```json
  { "kontraktKlasse": "teknisk", "funksjonell": "<én norsk setning i CHANGELOG-tone>", "produktvalg": false }
  ```

  `produktvalg` settes `true` når kontrakten har en
  `## Alternativer (produktvalg)`-seksjon (steg 2); feltet kan utelates når det
  er `false` (eldre kontrakter mangler det — fravær = `false`).

  - `teknisk` = **ingen** bruker-synlig effekt (test/infra/tooling/refactor — ville
    vært `[no-changelog]`). `bruker-synlig` = spillere eller eier ser noe endre seg
    (ville fått en CHANGELOG-linje). **Klassifiserings-regelen ER CHANGELOG-regelen**
    — samme hook-håndhevede grense, ett hjem, ingen ny gråsone.
  - `funksjonell` er **obligatorisk for begge klasser** («Fikser at …», «Spillerne
    får nå …»), humanizer-tone — det er den eieren godkjenner på, ikke kontrakt-teksten.
  - **Tvil → `bruker-synlig`** (fail-closed: eieren ser mer, aldri mindre). En
    feilklassifisert `teknisk` fanges av (a) denne fail-closed-regelen, (b)
    morgenbriefens revisjonsspor, (c) merge-porten (mennesket merger alltid).
- **Post som issue-kommentar** (ikke fil, ingen PR — smeden er headless og skal
  ikke åpne en PR per kontrakt). Kommentaren starter med (4-backtick-fence her kun
  for å vise den indre ```json-blokken bokstavelig):

  ````
  ## 📋 Forge-kontrakt tilgjengelig
  🤖 Auto-skrevet av kontrakt-smeden.

  ```json
  { "kontraktKlasse": "teknisk", "funksjonell": "Fikser at …" }
  ```
  ````

  Full kontrakt-tekst under i en `<details>` (som #1147). Kommentaren er den
  autoritative kilden; `.forge/`-fila lages ved behov under selve bygget.
- **Auto-kø ALLE kontrakter unntatt aldri-auto-kategoriene (eierbeslutning
  2026-07-30, #1413 — utvider #1302):** sett `autonomy:ready` selv rett etter
  postering (smeden HAR GitHub-tilgang), for både `teknisk` og `bruker-synlig`.
  Veto-vinduet er hele dagen: smeden kjører før morgenbriefen, som samme morgen
  surfacer den auto-køede saken med ⏸-knapp — nattkjøringen er først PÅFØLGENDE
  natt, så eieren rekker å stoppe den. Produktvalg er ikke lenger grunn til å
  vente: alternativene står i kontrakten og løftes inn i PR-en (#1406).
  - **Unntak — venter alltid på eierens 🌙-tapp** (speiler auto-merge-policyens
    aldri-auto-liste): auth-/sikkerhetsendringer, destruktive flyter (sletting
    av data/kontoer), og alt som koster penger. Disse merkes IKKE ready av
    smeden. (Prod-DB-migrasjoner auto-køes: nattkjøreren rører kun staging, og
    prod-brannmuren #1074 står uansett.)
  - Smeden har ikke Discord-tilgang (kun GitHub) — all Discord-formidling eies av
    morgenbriefen (docs/loops/morgenbriefen.md). Smeden setter labelen; briefen er
    budbringeren.

## Steg 4 — Cap + throttle (hold deg bak eieren)

- **Cap:** maks **5 handlinger per kjøring** — kontrakter og gråsone-rutinger
  (steg 2) teller likt.
- **Throttle — tell eierens REELLE kø, ikke en pre-build-godkjenningskø**
  (eierbeslutning 2026-07-30, #1413): kontrakter venter ikke lenger på eieren
  (auto-kø, steg 3), så den gamle «uåpnede godkjenn-køen» finnes nesten ikke.
  Tell i stedet summen av (a) åpne nattkjører-PR-er som venter på eieren
  (`gh pr list --state open --label autonomy:review`) og (b) kontrakterte
  issues som fortsatt venter på 🌙-tapp (aldri-auto-kategoriene, steg 3).
  Er summen ≥ **8**, skriv INGEN nye denne kjøringen — heartbeat «throttlet:
  N venter». Ellers overhaler smeden eieren og fyller briefen med støy.
  - ⚠️ Tell begge kildene, uansett forfatter — en kjøring der smeden ikke har
    skrevet noe ennå skal ikke lese køen som tom og dumpe 5 nye oppå en full
    stabel. En guardrail som bare holder på den snille lesningen er ingen
    guardrail (bekreftet ved første kjøring 2026-07-08: 22 ventende → korrekt
    throttle under den gamle regelen).

## Steg 5 — Heartbeat (ALLTID)

Én kommentar på #1110: `🔨 Kontrakt-smeden <dato>: <utfall>` der utfall er ett av:
`skrev N kontrakter (#a, #b …)` / `rutet N til eier (#a …)` / `ingen nye` /
`throttlet: N venter` / `venter på eier: N ubesvarte` / `kunne ikke kjøre —
<grunn>` — eller en kombinasjon («skrev 1 kontrakt (#a), rutet 2 til eier
(#b, #c)»). Morgenbriefen bruker den som liveness-signal.

## Routine-oppsett (ops, post-merge)

- Cloud routine, **daglig**, før morgenbriefen (f.eks. 03:00 UTC, slik at nye
  kontrakter rekker inn i dagens surfacer).
- Modell: **Fable** som orkestrator (eierbeslutning 2026-07-30, #1413); alle
  subagenter smeden spawner (fersk-kontekst-verifisereren i steg 3) settes
  eksplisitt til **Opus**. Kontrakt-kvalitet er taket på byggkvalitet (#1152) —
  Fable organiserer, Opus gjør feltarbeidet.
- Nettverk: kun GitHub (default Trusted). **Ingen staging-/prod-nøkler** i miljøet
  — smeden leser issues + koden i klonen og poster kommentarer, ikke noe mer.
- Prompt: «Følg docs/loops/kontrakt-smeden.md i jdlarssen/golf-app fra topp til bunn.»

## v1-avgrensning

- Produktvalg håndteres i kontrakten som alternativer (steg 2, #1413) — kun
  uskopbare kandidater rutes til eieren.
- Kontrakter er kommentar-only (ingen `.forge/`-fil, ingen PR) for å unngå en PR
  per kontrakt. Surfaceren (#1149) og nattkjøreren leser begge kommentar-headeren.
