# Kontrakt-smeden — daglig kontrakt-forberedelse (#1150, epic #1073)

Daglig cloud-routine som skriver forge-kontrakter for buildbare, kontraktløse
issues, så natt-køen aldri sulter. Kontraktene postes som issue-kommentarer;
surfaceren (#1149) løfter dem inn i morgenbriefen som ett-tapp godkjenn-kandidater,
og nattkjøreren bygger dem når eieren har merket dem `autonomy:ready`.

**Selv-begrensende med vilje:** smeden rører kun issues UTEN kontrakt. Når
backloggen er kontraktert finner den ingenting nytt og avslutter billig — som
CI-vaktas grønne no-op. Daglig kadens er derfor en kort startbyrde, ikke en
stående kostnad.

## Harde rammer (brudd er aldri OK)

- **Aldri gjett på gråsoner.** Er et valg uklart, skriv IKKE en kontrakt på
  gjetning — rut til eieren per steg 2 (#1151). En kontrakt bygd på en gjetning
  fanges først ved eierens merge.
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
- **positivt buildbar-signal:** label `enhancement` eller `bug`, OG en milestone
  som IKKE er «Backlog — uplanlagt / scale-triggered» (#9). Eierens handling — å
  milestone-e et issue inn i en ekte tier — ER signalet «dette er reelt arbeid».
  Uten det: hopp (smeden skal ikke flyt-forankre; det er eierbeslutning, jf. #318).
- **eksplisitt ekskludert:** #1110 (Loop-drift-tavla) og alt smeden ikke trygt kan
  avgrense (fanges av tvil-vurderingen i steg 2).

Ingen kandidater → heartbeat «ingen nye» og avslutt. Suksess, ikke tomgang.

## Steg 2 — Vurder egen tvil og rut gråsoner («spør, ikke anta» på agenten selv)

Per kandidat, klassifiser:

- **Mekanisk / høy tillit:** klar cleanup, bug med tydelig repro, veldefinert
  endring med ett åpenbart designvalg → steg 3.
- **Epic:** label `epic` → hopp alltid. En epic er aldri én kontrakt; deler
  brytes ut som egne issues av eieren.
- **Gråsone med NØYAKTIG ETT binært valg:** post en kommentar på issuet med
  header `## 🅰️🅱️ Eierbeslutning trengs` — A og B forklart + din anbefaling
  + hvorfor — og sett label `autonomy:needs-decision`. Morgenbriefen løfter
  den med A/B/🗑/⏸-knapper (docs/loops/morgenbriefen.md).
- **Gråsone med flere valg / uklart omfang:** IKKE drypp-mat enkeltspørsmål.
  Post kontrakt-forarbeid med header `## 🛠 Kontrakt-forarbeid (gråsone)` —
  scoped kontekst, filer, åpne spørsmål listet, anbefalt retning (ikke
  spekulativ full-kontrakt) — og sett label `autonomy:needs-contract-session`.
  Morgenbriefen løfter den med kopier-lim-klar `/forge:contract`-kommando +
  🗑/⏸-knapper.

I tvil om mekanisk vs. gråsone: behandle som gråsone. I tvil om ett vs. flere
valg: behandle som flere (fail-closed begge veier).

**Re-run-semantikk (kjøringer etter ruting):**

- Kandidat med `autonomy:needs-decision`: let etter en issue-kommentar som
  matcher `^Eierbeslutning via Discord: \*\*(A|B)\*\*` postet ETTER din
  spørsmålskommentar. Funnet → fjern labelen og skriv kontrakten (steg 3) med
  valget som Key Decision. Ikke funnet → hopp (å vente er ikke en ny handling).
  Dropp-/utsett-kvitteringene («droppet 🗑» / «utsatt ⏸») matcher aldri
  regexen — de bærer ikke fet A/B (test-låst i lib/loops/discordActions.test.ts).
- Kandidat med `autonomy:needs-contract-session`: hopp — eierens trekk er å
  kjøre `/forge:contract` i en interaktiv økt, eller tappe 🗑/⏸.
- **Dedupe:** label til stede = allerede rutet. Aldri re-post spørsmålet.

**Ruting-cap:** ruting-handlinger teller mot 5-handlinger-per-kjøring-capen
(steg 4). I tillegg: er ≥5 åpne issues allerede merket `autonomy:needs-decision`
eller `autonomy:needs-contract-session`, rut ingen nye denne kjøringen —
heartbeat «venter på eier: N ubesvarte». Samme prinsipp som kontrakt-throttlen:
aldri overhal eieren.

## Steg 3 — Skriv kontrakt (kun høy tillit)

- Skriv kontrakten grunn-forankret i koden, samme form som #1147: Problem, Design,
  Edge Cases & Guardrails, Key Decisions, Success Criteria, Gates, Files Likely
  Touched, Out of Scope.
- **Fersk-kontekst-verifisering (obligatorisk):** spawn en general-purpose Task-
  agent som verifiserer kontrakten mot faktiske filer/linjer. Finner den PROBLEM
  (feil fil, umulig antakelse, manglende dekning) → fiks, eller nedgrader til
  gråsone og hopp. Ingen uverifisert kontrakt postes.
- **Post som issue-kommentar** (ikke fil, ingen PR — smeden er headless og skal
  ikke åpne en PR per kontrakt). Kommentaren starter med:

  ```
  ## 📋 Forge-kontrakt tilgjengelig
  🤖 Auto-skrevet av kontrakt-smeden — LES før du køer.
  ```

  Full kontrakt-tekst under i en `<details>` (som #1147). Kommentaren er den
  autoritative kilden; `.forge/`-fila lages ved behov under selve bygget.

## Steg 4 — Cap + throttle (hold deg bak eieren)

- **Cap:** maks **5 handlinger per kjøring** — kontrakter og gråsone-rutinger
  (steg 2) teller likt.
- **Throttle:** tell **alle** åpne issues med forge-kontrakt — uansett forfatter,
  #1147-batchen og smedens egne 🤖-kontrakter teller likt — som verken er
  `autonomy:ready` eller `autonomy:blocked`. Det er eierens totale uåpnede
  godkjenn-kø. Er den ≥ **8**, skriv INGEN nye denne kjøringen — heartbeat
  «throttlet: N venter på godkjenning». Ellers overhaler smeden eieren og fyller
  briefen med støy.
  - ⚠️ **Ikke** tell kun smedens egne 🤖-kontrakter: på en kjøring der smeden ikke
    har skrevet noe ennå ville tallet vært 0, throttlen sluppet gjennom, og smeden
    dumpet 5 nye oppå en allerede full stabel — nettopp firehosen throttlen finnes
    for å stoppe. En guardrail som bare holder på den snille lesningen er ingen
    guardrail (bekreftet ved første kjøring 2026-07-08: 22 ventende → korrekt throttle).

## Steg 5 — Heartbeat (ALLTID)

Én kommentar på #1110: `🔨 Kontrakt-smeden <dato>: <utfall>` der utfall er ett av:
`skrev N kontrakter (#a, #b …)` / `rutet N til eier (#a …)` / `ingen nye` /
`throttlet: N venter` / `venter på eier: N ubesvarte` / `kunne ikke kjøre —
<grunn>` — eller en kombinasjon («skrev 1 kontrakt (#a), rutet 2 til eier
(#b, #c)»). Morgenbriefen bruker den som liveness-signal.

## Routine-oppsett (ops, post-merge)

- Cloud routine, **daglig**, før morgenbriefen (f.eks. 03:00 UTC, slik at nye
  kontrakter rekker inn i dagens surfacer).
- Modell: **Opus** — kontrakt-kvalitet er taket på byggkvalitet (#1152).
- Nettverk: kun GitHub (default Trusted). **Ingen staging-/prod-nøkler** i miljøet
  — smeden leser issues + koden i klonen og poster kommentarer, ikke noe mer.
- Prompt: «Følg docs/loops/kontrakt-smeden.md i jdlarssen/golf-app fra topp til bunn.»

## v1-avgrensning

- Kun mekaniske høy-tillit-kontrakter skrives selv; gråsoner rutes til eieren
  per steg 2 (#1151).
- Kontrakter er kommentar-only (ingen `.forge/`-fil, ingen PR) for å unngå en PR
  per kontrakt. Surfaceren (#1149) og nattkjøreren leser begge kommentar-headeren.
