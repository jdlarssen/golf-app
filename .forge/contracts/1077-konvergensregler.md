# Spec: Forge-konvergensregler — målbar fremgang, strategibytte og eskaleringsmal

**Issue:** #1077 (del av epic #1073, bygges som nr. 4)
**Branch:** claude/1077-konvergensregler

## Problem

forge:auto har to autonomi-feilmoduser uten vern i dag: løkka kan spinne på identiske evaluator-avvisninger uten å endre strategi, og den kan gi opp uten å etterlate artefakt. Evalueringssignalene forsvinner dessuten ut av kontekstvinduet mellom runder. Ren protokoll-fiks: dokumentér konvergensregler i forge-arbeidsflyten + sjekk inn eskaleringsmal.

## Design

1. **Ny seksjon «Konvergensregler (#1077)» i `docs/forge-workflow.md`:**
   - **Runde-historikk:** hver forge:auto-kjøring appender én linje per evaluate-runde til `.forge/evaluations/<kontrakt-slug>-runder.md`: runde-nr, verdikt, normaliserte finding-signaturer.
   - **Finding-signatur:** `fil + kriterium` (normalisert, ikke fritekst) — gjør fremgang mekanisk målbar.
   - **No-progress-definisjon:** to påfølgende runder med identisk signatur-sett = ingen fremgang → **tvunget strategibytte**: fresh-context fix-subagent som KUN får evalueringsrapporten som spec (ikke forrige agents kontekst).
   - **Harde tak:** maks 5 evaluate-runder totalt; maks 2 no-progress-runder etter strategibytte.
   - **Ved ikke-konvergens:** ALDRI kast delarbeid, aldri reset, aldri stille exit — push delarbeid som draft-PR + post eskaleringsmalen som issue-kommentar.
2. **`.forge/templates/eskalering.md`:** norsk mal med plassholdere: hva som ble bygget, verdikt per runde (fra runde-historikken), hva som ble prøvd per strategi, og ETT konkret A/B-spørsmål eieren kan besvare uten å lese kode.

## Key Decisions

- Autonomi-kontraktens tunge maskineri (manifest.jsonl + Stop-hook) bevisst utelatt — forge:evaluate i fersk kontekst er motgiften mot bevis-teater (jf. #1073-prioriteringen).
- Protokoll i docs, ikke kode: forge-skillene leser forge-workflow.md; ingen hook-endring.

**Claude's Discretion:** eksakt malformat, runde-fil-format.

## Success Criteria

- [ ] `docs/forge-workflow.md` har Konvergensregler-seksjon som dekker: runde-historikk-fil, finding-signatur, no-progress-definisjon, strategibytte-mekanisme, begge takene, og aldri-stille-exit-regelen (fil-lesing mot denne lista).
- [ ] `.forge/templates/eskalering.md` finnes med alle fire mal-delene inkl. A/B-spørsmålet.
- [ ] Neste forge:auto-kjøring skriver runde-historikk: PENDING FIRST USE (aktiveringskriterium).

## Gates

- [ ] Docs-only-endring: `git diff --stat` viser kun .md-filer; commit-msg-hook (Refs #1077) passerer.

## Files Likely Touched

- `docs/forge-workflow.md` — ny seksjon
- `.forge/templates/eskalering.md` — ny

## Out of Scope

- Endringer i forge-plugin-skillene selv (protokollen håndheves via forge-workflow.md som skillene allerede er pålagt å lese)
- Manifest/Stop-hook (revurderes kun ved beviste falske ferdig-påstander)
