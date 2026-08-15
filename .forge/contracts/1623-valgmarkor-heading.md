# Kontrakt — #1623: valg-markøren og PR-malens heading er i utakt

Kilde: kontrakt-smedens kommentar på [#1623](https://github.com/jdlarssen/golf-app/issues/1623).
PR: [#1654](https://github.com/jdlarssen/golf-app/pull/1654). Klasse: teknisk. Produktvalg: nei.

## Problem

`CHOICE_MARKER` (`lib/loops/autoMerge.ts`) krevde at markdown-headingen STARTET med
«produktvalg» eller «alternativ a–e». Mal-teksten i CLAUDE.md §PR-presentasjon foreskrev
seksjonen «Alternativer (produktvalg)» — som ikke matcher. To hjem for samme regel, i
utakt (AGENTS.md-felle 4). Konsekvens: PR #1620 var et ekte produktvalg, brukte
mal-headingen, og ble auto-merget av kortet før eieren fikk velge.

## Drift-sjekk mot HEAD (utført før bygging)

Alle kontraktens påstander verifisert på `abb171d9`, ingen drift:

| Påstand | Status |
|---|---|
| `CHOICE_MARKER` med smal regex på `autoMerge.ts:60` | ✅ bekreftet ordrett |
| Regel-kommentar `:57–59` | ✅ |
| `hasChoiceMarker`-tabell fra `autoMerge.test.ts:63` (11 rader) | ✅ |
| CLAUDE.md maskin-markør-setning `:181–184` | ✅ |
| `docs/loops/discord-pr-kort.md:88–91` | ✅ |
| `docs/loops/morgenbriefen.md:36` | ✅ |

## Success Criteria

- [x] **1.** `hasChoiceMarker('## Alternativer (produktvalg)')` → `true`, som rad i
      `it.each`-tabellen.
      **Evidens:** `lib/loops/autoMerge.test.ts` — raden er lagt inn med #1620-kommentar.
      Rød→grønn bevist: med den gamle regexen feiler den på `× ## Alternativer
      (produktvalg) → true`.
- [x] **2.** Eksisterende true-cases forblir true; prosa-casen forblir false; en heading
      uten ordet «produktvalg» (`## Alternativer vurdert`) forblir false som eksplisitt
      case.
      **Evidens:** alle 11 opprinnelige rader står uendret i diffen; `npx vitest run
      lib/loops` → 197/197 passed. Rød-kjøringen med gammel regex viser at nøyaktig 3
      rader (de nye true-radene) avhenger av utvidelsen — ingen eksisterende rad flippet.
- [x] **3.** CLAUDE.md-malteksten og maskin-markør-setningen er konsistente;
      `discord-pr-kort.md:88` oppdatert.
      **Evidens:** begge omskrevet til «heading som enten inneholder ordet «produktvalg»
      … eller starter med `## Alternativ A`–`E`». `morgenbriefen.md` gjentok markøren som
      en tredje, kortere variant — den peker nå til kort-doccen framfor å beskrive
      regelen på nytt, så det finnes ett sted å endre neste gang.
- [x] **4.** `npx vitest run lib/loops` grønn.
      **Evidens:** `Test Files 4 passed (4) / Tests 197 passed (197)`.

## Gates

- [x] `tsc --noEmit` → exit 0
- [x] `lint` → 0 errors (55 pre-eksisterende warnings i urørte filer)
- [x] `npx vitest run lib/loops` → 197/197
- [x] Ingen staging-verifisering (teknisk, ingen bruker-synlig flate) — per kontrakten
- [x] `[no-changelog]` i commit-body, ingen `.changes/`-notat — intern tooling

## Selv-verifisering av egen PR-body

Fordi denne PR-en endrer nettopp markøren, ble PR-body-en kjørt mot den NYE regexen før
PR-en ble opprettet: `hasChoiceMarker(body)` → `false`, ingen treff. Riktig — PR-en
inneholder ikke noe produktvalg og skal auto-merges.

## Runde 1 — evaluator: ACCEPT, med herding etterpå (commit `a713371c`)

Evaluatoren ga ACCEPT på alle fire kriterier og alle porter, men fant to ting som
endret bildet:

**Feilen var 4× større enn kontrakten antok.** Evaluatoren hentet de faktiske PR-tekstene
og kjørte begge regexene over dem: `## Alternativer (produktvalg)` sto i **#1610, #1612,
#1616 OG #1620** — alle merget 2026-08-14, alle usynlige for den gamle markøren. Fire
tapte eier-valg, ikke ett. Kontroller: #1641/#1645 (`## Produktvalg`) true begge veier;
#1652 og denne PR-ens egen #1654 false begge veier.

**Tre defekter på selve regex-linja, alle rettet i `a713371c`:**

- **F1 (medium):** `\b` etter «produktvalg» sperret bestemt form («## Produktvalget»),
  mens doc-teksten i DENNE PR-en lover «en heading som INNEHOLDER ordet». Samme
  drift-mekanisme som #1623 selv — ville sendt en ny doc/kode-drift ut i samme PR som
  fjerner én. Ordgrensen fjernet.
- **F3 (low):** `\s` krysser linjeskift, så `##\nEt produktvalg` ble lest som heading.
  `[ \t]` i stedet.
- **F2 (low-medium):** kvadratisk backtracking — 3049 ms på «#» + 65 536 mellomrom.
  Første hypotese (bytte `\s+` mot `[ \t]+`) var FEIL: målt 3167 ms, altså uendret.
  Årsaken er backtracking inn i selve mellomrom-løpet. Løst med atomisk gruppering
  (`(?=([ \t]+))\1`): 0,12 ms. Låst med en tidstest.

**Ikke rettet — filet som egne issues:**

- **F4 (medium):** markøren leses kun fra `pr.body`, men CLAUDE.md og nattkjoreren.md
  sier valget kan stå i en kommentar. Samme utfall som #1623 på en annen akse.
  → [#1656](https://github.com/jdlarssen/golf-app/issues/1656)
- **Aldri-lista:** `lib/loops/**` mangler, så en PR kan auto-merge endringer i sin egen
  merge-port. → [#1655](https://github.com/jdlarssen/golf-app/issues/1655)

**F5/F6 (info):** to-grens-asymmetrien er dokumentert og forsvarlig; memory-filene utenfor
repoet beskrev fortsatt den gamle smale regelen — oppdatert og de to duplikatene slått
sammen til én.

## Avvik fra kontrakten

Kontraktens fil-liste holdt (`autoMerge.ts`, `autoMerge.test.ts`, `CLAUDE.md`,
`discord-pr-kort.md`, `morgenbriefen.md`).

**Ett bevisst avvik:** kontrakten slo fast at bøyninger («## Produktvalget») var «samme
begrensning som i dag, bevisst uendret». Det ble skrevet før doc-teksten i denne PR-en
lovet at enhver heading som inneholder ordet teller. Å beholde begge ville sendt ut en ny
doc/kode-drift i nettopp den PR-en som fjerner én — så begrensningen er fjernet i stedet.
Retningen er uansett fail-closed: en ekstra menneske-merge, aldri en tapt beslutning.

Fire tabellrader lagt til der kriteriene navngir to. De to ekstra (emoji-prefiks,
fail-closed-negasjonen) er ikke gold-plating: begge er eksplisitte oppførsels-påstander i
kontraktens «Edge Cases & Guardrails», og negasjons-raden hindrer at noen «fikser» den
bevisste fail-closed-oppførselen senere.

## Funn utenfor scope

`lib/loops/**` står ikke på `NEVER_AUTO_MERGE_GLOBS`, som ellers dekker
enforcement-flater (`.github/**`, `.githooks/**`, `.claude/**`). En PR som endrer
auto-merge-porten kan derfor auto-merge seg selv — som denne. Filet separat, ikke rørt
her (kontraktens Out of Scope: «Endringer i decide-/post-scriptene eller aldri-lista»).
