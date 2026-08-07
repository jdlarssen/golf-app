# Spec: Irish greensome-variant-copy i cup-oppsettet (#1451)

## Problem

Kode-verifiseringen av PR #1442 (splittet cup-dag, #1441) fant at designdokets D6/F5 ikke ble levert: Irish greensome-varianten er usynlig i appen — null treff på «irish»/«irsk» i begge locales og all UI-kode. Arrangøren må forklare mekanikken muntlig ute på banen. Ren copy-mangel: appen fører kun lagballen, så scoringen er identisk med vanlig greensome — ingen ny game_mode.

## Research Findings

In-repo-scouting (ingen ekstern biblioteksflate):

- Steg 4-bunteditoren for splittet cup-dag (`GenerateMatchesWizard.tsx`, `data-testid="cup-wizard-step4-bundle"`, ~linje 1227) har en `SectionHeading` + regenerer-knapp, deretter flight-listen der `GreensomeCard` repeteres per flight. En helper plassert ÉN gang mellom heading-raden og flight-listen treffer alle flighter uten repetisjon.
- Steg 3-preset-beskrivelsen (`cup.presets.splittet-cup-dag.description`, messages/no.json ~4529) er en stram én-linjes verdiprop — mekanikk-forklaring der ville sprengt formen.
- Stemme-referanse for greensome-copy finnes: `formatGuide.content.greensome_matchplay.summary` («To mot to — begge slår ut, dere velger det beste utslaget …»).

## Prior Decisions

- **#1441/D6 (designdok):** varianten skal synliggjøres i copy der greensome inngår i cup-oppsettet — mandatet for denne oppgaven.
- **Issuets «og/eller» (steg 3/steg 4)** delegerer plasseringen til byggeren — ikke et produktvalg som krever pause.

## Design

Én ny i18n-nøkkel `cup.generate.irishGreensomeHint` rendret som helper-avsnitt (muted, samme stil som `lineupHint`) i steg-4-bunteditoren, rett under heading-raden og FØR flight-listen — én gang, ikke per kort. Innhold: greensomen ute kan spilles som irish greensome (begge slår ut, bytt ball på andreslaget, velg én ball, deretter annenhver), og appen fører bare lagballen, så scoringen er lik vanlig greensome.

Utkast (humanizer-sjekkes før commit):
- no: «Vil dere spille greensomen som irish? Begge slår ut, dere bytter ball på andreslaget, velger så én ball og spiller annenhver gang derfra. Appen fører bare lagballen, så scoringen er lik vanlig greensome.»
- en: "Playing the greensome as Irish? Both tee off, you swap balls for the second shot, then pick one ball and alternate from there. The app only tracks the team ball, so scoring is the same as regular greensome."

Steg-3-preset-beskrivelsen røres IKKE (stram form; steg 4 er der greensome-matchene faktisk settes opp).

## Edge Cases & Guardrails

- Kun splittet-cup-dag-bunteditoren viser hinten — «tilpasset»-presetens greensome-select og andre presets røres ikke (hinten handler om cup-dagens ute-greensome, ikke greensome generelt).
- Copy-endring per test-disiplinen: INGEN nye tester; eksisterende `GenerateMatchesWizard.test.tsx` skal forbli grønn urørt (den asserter ikke norsk copy).
- Ingen endring i scoring, game_mode, DB eller server-actions.

## Key Decisions

- **Plassering: steg 4, én gang over flight-listen** — treffer arrangøren idet greensome-matchene konfigureres, uten per-flight-støy.
- **Commit-type: `fix`** (patch + Feilrettinger-linje) — manglende leveranse fra #1441-designet, ikke ny funksjon.

**Claude's Discretion:** endelig ordlyd (utkastet over er utgangspunkt; humanizer før commit).

## Success Criteria

- [ ] `cup.generate.irishGreensomeHint` finnes i `messages/no.json` og `messages/en.json`, og ordet «irish» forekommer i begge (issue-kravet om null-treff er snudd).
- [ ] Hinten rendres i steg-4-bunteditoren (`cup-wizard-step4-bundle`), én gang, over flight-listen — verifiseres ved kodelesing + staging.
- [ ] `GenerateMatchesWizard.test.tsx` grønn uten endringer.
- [ ] Patch-bump + én Feilrettinger-linje i CHANGELOG.
- [ ] Staging-verifisering: splittet-cup-dag-wizard drevet til steg 4, hint synlig (struktur-orakel på testid/element, ikke norsk tekst).

## Gates

- [ ] `npx vitest run "app/[locale]/admin/cup/[id]/generer/GenerateMatchesWizard.test.tsx"` grønn
- [ ] `npm run build` grønn
- [ ] `npm run lint` grønn

## Files Likely Touched

- `app/[locale]/admin/cup/[id]/generer/GenerateMatchesWizard.tsx` — hint-avsnitt i buntens steg 4
- `messages/no.json`, `messages/en.json` — `cup.generate.irishGreensomeHint`
- `package.json`, `package-lock.json`, `CHANGELOG.md` — patch + linje

## Out of Scope

- Ingen ny game_mode / scoring-endring (irish er identisk ført).
- Ingen copy i formatGuide (den dekker greensome generelt; egen sak hvis ønsket).
- Steg-3-preset-beskrivelsen står.
