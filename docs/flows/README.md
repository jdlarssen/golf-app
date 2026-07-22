<!--
  Nedbrutte brukerflyt-diagrammer for Tørny. Hver flyt finnes i to versjoner:
    <n>-<navn>.svg/.png          = slik flyten er i dag (med ⚠ forbedringspunkter)
    <n>-<navn>-fremtid.svg/.png  = slik flyten blir etter planlagte endringer (NY-merker)
  .svg = skarp/zoom · .png = rask visning. Oversikts-kartet: docs/user-flows.svg.
  Gjennomgått flyt-for-flyt 2026-05-31, hver grunnet i faktisk kode. Forbedringer sporet som issues #355–#377.
-->

# Brukerflyt-diagrammer — de suksess-kritiske flytene

Fem kjerne-flyter appen står og faller på, pluss liga (flyt 6, ny). Hver er tegnet steg-for-steg (les ovenfra og ned), i **to versjoner**: slik den er i dag, og slik den blir etter de planlagte endringene (liga finnes kun som fremtids-flyt — den var ikke der før). Oversikten over alt: [`../user-flows.svg`](../user-flows.svg). Full tekst-referanse: [`../user-flows.md`](../user-flows.md).

| # | Flyt | Hvem | I dag | Fremtid |
|---|---|---|---|---|
| 1 | **Bli bruker** | Ny spiller | [PNG](01-bli-bruker.png) · [SVG](01-bli-bruker.svg) | [PNG](01-bli-bruker-fremtid.png) · [SVG](01-bli-bruker-fremtid.svg) |
| 2 | **Bli med i et spill** | Spiller | [PNG](02-bli-med-i-spill.png) · [SVG](02-bli-med-i-spill.svg) | [PNG](02-bli-med-i-spill-fremtid.png) · [SVG](02-bli-med-i-spill-fremtid.svg) |
| 3 | **Spille en runde** | Spiller | [PNG](03-spille-en-runde.png) · [SVG](03-spille-en-runde.svg) | [PNG](03-spille-en-runde-fremtid.png) · [SVG](03-spille-en-runde-fremtid.svg) |
| 4 | **Opprett spill** | Arrangør | [PNG](04-opprett-spill.png) · [SVG](04-opprett-spill.svg) | [PNG](04-opprett-spill-fremtid.png) · [SVG](04-opprett-spill-fremtid.svg) |
| 5 | **Kjør og avslutt spill** | Arrangør | [PNG](05-kjor-og-avslutt-spill.png) · [SVG](05-kjor-og-avslutt-spill.svg) | [PNG](05-kjor-og-avslutt-spill-fremtid.png) · [SVG](05-kjor-og-avslutt-spill-fremtid.svg) |
| 6 | **Liga** | Arrangør + spiller | — *(ny flyt)* | [PNG](06-liga-fremtid.png) · [SVG](06-liga-fremtid.svg) |

## Hvordan de henger sammen

```
Arrangør:  [4 Opprett] ───────────────► [5 Kjør & avslutt]
                 │ inviterer                    ▲ leverer/godkjenner
                 ▼                               │
Spiller:   [1 Bli bruker] ─► [2 Bli med] ─► [3 Spille en runde]
```

## Forbedringer per flyt (sporet som GitHub-issues)

- **Flyt 1 — Bli bruker:** #364 (aktiver selvregistrering), #365 (ekstra vern), #356 (land rett i spillet), #361 (vennlige feil), #366 (bruker-baner), #1042 ✓ (prøvespill før konto — /demo, test uten innlogging).
- **Flyt 2 — Bli med:** #357 (vedvarende «Finn turneringer»), #367 (tydelig påmeldingsvalg = synlighet), #368 (invite_only-blindvei), #362 (lag-klarhet), #369 ✓ (venner + åpen-for-venner — bygget).
- **Flyt 3 — Spille en runde:** #360 (peer-godkjenning kan ikke låse seg). #358 (live leaderboard) + #359 (lagret-merke) var **allerede løst** — lukket etter kode-verifisering.
- **Flyt 4 — Opprett spill:** #373 (antall før format), #374 (best ball uten 8-lås), #371 (peer-godkjenning av som default), #367 (tydelig påmelding), #372 (copy-bug env-var). Parkert større: #22 (alle kan opprette), #366 (bruker-baner). #370 lukket (beholder «kun invitasjon» som default).
- **Flyt 5 — Kjør og avslutt:** #375 (avslutt-likevel — aldri permanent låst), #376 (auto-varsel når spilleren er ferdig + admin-purring), #377 (avslutnings-varsel via samme in-app-først-logikk, ingen egen avslutningsmail).
- **Flyt 6 — Liga:** #453 ✓ (bygget) — ny sesong-konkurranse over flere runder. Epic [#452](https://github.com/jdlarssen/golf-app/issues/452). Fase 1: frittstående slagspill netto. Fase 2: brutto + sesong-modeller (beste-N, poeng). Fase 3: klubb-liga (#480) + medlemmer melder seg på selv. Flere modi senere. Kun fremtids-diagram (flyten fantes ikke før).

## Tegn-forklaring
- **Grønt** = spiller-handling · **Champagne** = arrangør-handling · **Mørkegrønn** = start/felles.
- **⚠ #NNN** (dagens-diagram) = forbedringspunkt · **NY #NNN** (fremtids-diagram) = planlagt endring.
- **✓** = fungerer alt i dag.

## Metode
Hver flyt ble grunnet i faktisk kode før konklusjon. Det avdekket at auditen overdrev på flyt 3 (to av tre «funn» var alt løst), og at flere «mangler» egentlig var skrudd-av-funksjoner (selvregistrering) eller historiske låser (best ball = 8). Lærdom: verifiser mot koden før du bygger.

## Oppdatere diagrammene
SVG-ene er kilden. Etter endring, regenerer PNG-ene fra repo-rota:

```bash
node docs/flows/regen-png.mjs
```

Scriptet leser hver SVGs `viewBox` og rendrer med Playwright chromium ved bredde
2000, med høyden bestemt av aspektforholdet — så diagrammene blir aspekt-riktige.
Den gamle macOS-oppskriften rendret en fast 2000×2000-boks som beskar bredere-
enn-høye diagrammer og ikke kjørte på Linux (jf. #1260).

Matcher ikke miljøets pre-installerte chromium den pinnede Playwright-versjonen
(«Executable doesn't exist», jf. #1183), pek på binæren direkte:

```bash
PW_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-<ver>/chrome-linux/chrome node docs/flows/regen-png.mjs
```
