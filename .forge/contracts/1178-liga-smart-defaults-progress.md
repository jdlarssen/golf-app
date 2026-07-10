# Spec: Liga-oppsett — smart defaults for sesong-datoer + lettvekts fremdrift (#1178)

## Problem
UX Peak-prinsippene **smart defaults** + **synlig fremdrift**. `CreateLigaForm` er appens mest uveiledede skjema:
1. **Sesong-datoer starter blanke** — ingen default, admin fyller alt fra null.
2. **Ingen fremdrifts-følelse** — én lang side med flere kort, mens spill- og cup-wizardene har «Steg X av Y».

⚠️ **Liga-flaten har null bruk i prod og er parkert** (`docs/hva-er-nok.md`). Kontrakten er derfor **minimal**: forhåndsutfyll datoene + gi en billig fremdrifts-markering. **Ingen ombygging av skjemaet til en flerstegs-wizard.**

## Research Findings (in-repo, verifisert)
- `app/[locale]/admin/liga/new/CreateLigaForm.tsx:64-65` — `seasonStart`/`seasonEnd` er `useState('')`. Begge er `type="date"`, `required`, kontrollerte (`:150-176`).
- Skjemaet er `'use client'`; parent er en ren server-komponent `admin/liga/new/page.tsx:37` som rendrer `<CreateLigaForm courses players meId />`.
- Andre blanke felt har fornuftige placeholders alt: `best_n_count` («5», `:498`), `penalty_fixed_over_par` («10», `:620`) — **ikke** blanke uten hint. Format/scoring/standings/frequency har ekte defaults, oppretteren er forhåndskrysset (`:61-63`).
- **Bonus:** rundeforhåndsvisningen `roundPreview` (`:77-81`, `generateRounds(seasonStart, seasonEnd, frequency)`) er tom til begge datoer er satt. Prefylte datoer gjør at forhåndsvisningen dukker opp umiddelbart — gratis gevinst.
- Seksjonskortene (6 `<Card>`): overskrifter `grundinfoHeading` (`:119`), `formatHeading` (`:182`), `courseScopeHeading` (`:237`), `setupHeading` (`:361`), `frequencyHeading` (`:630`), `participantsHeading` (`:689`). Kommentarene nummererer dem inkonsistent (1,2,3,3,4,5).
- Oslo-tid: `lib/format/teeOff.ts osloParts(date)` gir `{ year, month(0-idx), day, ... }` TZ-stabilt.

## Prior Decisions
- «Testing = staging» + parkert-liste: liga er dekningshull, men bevisst nedprioritert → hold endringen liten, ingen refaktor.
- **#1144 (net-only-kollaps av scoring-toggle) er et SEPARAT issue → Out of Scope her.**
- #928-hydration-lærdommen gjelder generelt: en dato beregnet fra `new Date()` i en klient-render kan gi SSR(UTC)/klient(lokal) mismatch → beregn defaulten på serveren.

## Design

### 1. Forhåndsutfyll sesong-datoer (server-beregnet default, hydration-trygt)
- Beregn defaultene i server-komponenten `admin/liga/new/page.tsx` (Oslo-dato via `osloParts`) og send som nye props `defaultSeasonStart` / `defaultSeasonEnd` (ISO `YYYY-MM-DD`).
- `CreateLigaForm` initialiserer `useState(defaultSeasonStart)` / `useState(defaultSeasonEnd)` — deterministiske props → SSR og klient rendrer samme `value`, ingen hydration mismatch.
- **Default-regel (norsk golfsesong):** `start = i dag (Oslo)`. `slutt = 30. september i inneværende år hvis dagens Oslo-måned er før september (måned < 8, 0-idx); ellers i dag + 3 måneder`. Admin justerer fritt.
- Ren helper for regelen (foreslått `lib/league/defaultSeason.ts`, Type A / TDD): `defaultSeasonDates(now: Date): { start: string; end: string }`.

### 2. Lettvekts fremdrift (nummererte seksjoner, ikke wizard-ombygging)
- Skjemaet er reelt **én side** — full «Steg X av Y»-wizard ville vært ombygging (parked flate → for dyrt). Billigste som gir fremdriftsfølelse: **nummererte kort-overskrifter** «Del 1 av 6», «Del 2 av 6», … på de seks eksisterende `<Card>`-ene, evt. med en diskret «6 korte deler»-linje øverst.
- Implementeres ved å prefikse hver seksjonsoverskrift med sitt nummer (rydder samtidig den inkonsistente kommentar-nummereringen). Ingen ny state, ingen steg-navigasjon, ingen validerings-gates mellom deler.

## Edge Cases & Guardrails
- Default-slutt må alltid være ≥ start (30. sept > i dag i sesong; +3 mnd ellers) — ellers rammes `season_end < season_start`-guarden (`:79`) og `errors.dates`. Verifiser i Type A-testen.
- Hydration: datoene kommer fra server-props, ikke `new Date()` i render → ingen mismatch. Kort kode-kommentar som siterer #1178/#928.
- Admin kan fortsatt tømme/endre begge felt fritt (kontrollerte inputs uendret).
- Round-preview reagerer nå umiddelbart på defaultene — bekreft at `generateRounds` ikke kaster på et gyldig start/slutt-par (den gjør det ikke; ren funksjon).
- Nummer-prefiksene er ren copy → nb+en; ikke bland inn ny logikk.

## Key Decisions
- **Minimal, parkert flate:** kun default-datoer + nummererte overskrifter. **Ingen** flerstegs-wizard, ingen ny navigasjon.
- **Server-beregnet default** (ikke klient-effekt) — unngår hydration-mismatch, konsistent med #928.
- **ASSUMPTION (autonomt valg, dokumentert):** golfsesong-default = start i dag, slutt 30. sept (i sesong) / +3 mnd (utenfor). Rimelig for norsk sesong (~april–oktober); admin overstyrer. Åpen for eier-justering.

**Claude's Discretion:**
- Eksakt fremdrifts-visning: «Del N av 6» i overskriften vs. en liten teller-linje øverst — velg det som ser ryddigst ut i eksisterende kort-stil.
- Om default-slutt er 30. sept eller 30. okt utenfor terskelen; om «i dag + 3 mnd» rundes til månedsslutt.
- Filplassering for `defaultSeasonDates`.

## Success Criteria
- [ ] Fersk «opprett liga» viser sesong-start = dagens dato og sesong-slutt = en fornuftig sesong-slutt, begge forhåndsutfylt, uten hydration-warning (`npm run build` + staging).
- [ ] Round-preview vises umiddelbart fra defaultene (ingen tom preview før admin rører datoene) for en ikke-`custom` frekvens.
- [ ] Default-slutt er alltid ≥ default-start (ingen `errors.dates` ved uendret submit).
- [ ] De seks seksjonene har synlig, konsistent nummerering («Del 1 av 6» … «Del 6 av 6») som gir fremdriftsfølelse — uten ny steg-navigasjon.
- [ ] `defaultSeasonDates` har Type A-test (i sesong / utenfor sesong / års-grense).

## Gates
- [ ] `npx tsc --noEmit` grønn
- [ ] `npm run lint` grønn
- [ ] `npx vitest run` for berørte co-located tester: `defaultSeason` (ny, Type A) + `CreateLigaForm.test.tsx` forblir grønn (juster kun ved copy-drift, ingen nye render-tester)
- [ ] Ny norsk copy → `humanizer:humanizer`; nb+en next-intl-nøkler (`catalogParity` grønn)
- [ ] Bruker-synlig → `feat`, **minor** bump + CHANGELOG-linje (Funksjoner)
- [ ] Staging-klikkrunde av liga-opprett-flyten FØR merge (parkert flate, men endringen er bruker-synlig)

## Files Likely Touched
- `lib/league/defaultSeason.ts` (+ `.test.ts`) — ren default-dato-helper
- `app/[locale]/admin/liga/new/page.tsx` — beregn + send `defaultSeasonStart`/`defaultSeasonEnd`
- `app/[locale]/admin/liga/new/CreateLigaForm.tsx` — init state fra props; nummererte seksjonsoverskrifter
- `messages/no.json` + `messages/en.json` — evt. nummer-prefiks / «Del N av 6»-nøkler
- `package.json` (+ lock) + `CHANGELOG.md`

## Out of Scope
- **#1144** (net-only-kollaps av scoring-toggle i samme skjema) — eget issue.
- Flerstegs-wizard-ombygging av liga-oppsettet.
- Defaults for `best_n_count` / `penalty_fixed_over_par` (har allerede placeholders).
- Spill-wizard (#1171) og ankereffekt (#1175).
