# Runde-historikk — 1260-flyt-png-aspekt (#1260)

Per docs/forge-workflow.md → Konvergensregler (#1077). Én linje per evaluate-runde;
finding-signaturer er normalisert `fil + kriterium`.

| Runde | Verdikt | Finding-signaturer |
|---|---|---|
| 1 | ACCEPT | *(ingen — build-intern visuell selvsjekk fanget viewport-defekt før første commit)* |

**Runde 1-notat:** Første implementasjon satte viewport `{width: 2000, height}` og
`deviceScaleFactor: 1`. Aspekt-orakelet (Success Criterion 1) passerte — PNG-dimensjonene
var korrekte — men den obligatoriske visuelle soft-confirmen (Criterion 4) avdekket at
SVG-ene har eksplisitt `width/height` lik viewBox og dermed rendret i intrinsic-størrelse
i øvre venstre hjørne med hvit luft rundt. Rettet i samme build-runde: viewport = intrinsic
størrelse + `deviceScaleFactor = 2000/vbWidth`, slik at diagrammet fyller rammen. Re-rendret,
oracle fortsatt grønt, visuell re-confirm på 06 + 02 bekreftet full-frame uten beskjæring.
Ingen commit ble laget på den defekte varianten — dette var én build-iterasjon, ikke en
evaluate-runde med rapportert finding. Kryss-modell-gaten (Steg 4.5) kjøres som uavhengig
skeptisk gjennomsyn før levering.
