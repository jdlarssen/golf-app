# Arkitektur-anker: Ryder Cup fase 4 — match-templating + format-presets

**Type:** Anchor-doc, ikke build-kontrakt. Quality-of-life-laget på toppen av fase 1-3. Full build-kontrakt skrives når fase 4 starter.

**Parent:** [#47](https://github.com/jdlarssen/golf-app/issues/47) (lukket ved fase 1-merge)
**Bygger på:** Fase 1 (krevet) + fase 2 (anbefalt) + fase 3 (optional)

## Retning

I fase 1-3 oppretter admin hver match manuelt fra cup-detalj-siden. For en full Ryder Cup med 8-12 matches blir det mye klikking. Fase 4 leverer **format-presets** og **templating-wizard**:

- Velg preset: «Ryder Cup mini» (4 singles + 2 four-balls + 2 foursomes), «Tørny Cup» (custom), «Solheim Cup-stil» etc.
- Templating-wizard tar lag-roster + preset → genererer match-skjelett (mode + lag-tilordning + match-label)
- Admin justerer pairings (drag-drop eller velg-spillere-per-match) → confirm → matches opprettes batch

## Constraints fase 1 må respektere

- **Cup-create-flow må ha OPTIONAL template-felt** — defer template-logikken til fase 4 ved å la `tournaments.template_id` være nullable (eller helt utelatt). Hvis kolonne legges til, må fase 1 ikke kreve den.
- **Match-creation API må fungere både manuelt og batch** — server-action `createTournamentMatch` skal kunne kalles én-for-én (manuelt, fase 1) eller flere ganger i én transaksjon (templating, fase 4)
- **Cup-detalj-side må kunne re-render etter batch-opprettelse** — eksisterende `revalidateTag('tournament-${id}')` håndterer det, ingen ny mekanikk

## Key unknowns (avgjøres ved build)

- **Preset-lagring:** hardkodet i kode? Egen `tournament_templates`-tabell? JSON-blob på `tournaments`-rad? Anbefalt utgangspunkt: hardkodet (3-5 presets) i `lib/cup/templates.ts`. Egen tabell hvis brukerne vil definere egne presets — fase 5+.
- **Pairing-assistant:** tre strategier å vurdere:
  1. **Manuell** — admin drar spillere til matches
  2. **Random** — randomiser pairings innen lag
  3. **Handicap-balansert** — par sammen høy + lav for utjevning
  
  Anbefalt: alle tre tilgjengelig som radio i templating-wizard. Default manuell.
- **Lag-størrelse-validering:** Ryder Cup mini-preset trenger min 4 spillere per lag (for å fylle 2 four-balls). Wizard må sjekke before generate.
- **Egendefinerte presets:** kan admin lagre sitt eget «Vår-cup format» som preset? Anbefalt: nei i fase 4. Brukere edit-er listen i kode.

## Avhengigheter

- **Fase 1 må være shipped** — selve cup-tabellen og match-FK må eksistere
- **Fase 2 (four-ball) anbefalt** — uten den støtter ikke presetene autentiske Ryder Cup-formater
- **Fase 3 (foursomes) optional** — preset-er som inkluderer foursomes kan ikke leveres uten fase 3, men «4 singles + 2 four-balls»-preset fungerer uten

## Estimat

Mellomstor — ~3-4 dager: preset-bibliotek, templating-wizard-UI, pairing-assistant (manuell + random + handicap-balansert), batch-create-action, tester. Mest UI-arbeid, lite ny scoring.

## Tilstander

Hvis bare fase 1 + fase 4 (uten fase 2/3) shipps: kun «N singles»-preset er meningsfullt. Anbefales å vente med fase 4 til minst fase 2 er på plass.

## Out of scope for fase 4

- Brukerdefinerte presets (med UI for å lagre/edite)
- Multi-cup-templating (lag flere cuper fra én template)
- Statistikk-baserte pairings («Per har slått Knut 3 ganger — par sammen for variasjon»)
- Cross-tournament-spiller-tracker

## Build-kontrakt skrives ved fase 4-start

Lavest arkitektur-risiko — mest UI på toppen av etablert datamodell. Build-kontrakten kan trolig hoppe over scout-runde og gå rett til design-diskusjon.
