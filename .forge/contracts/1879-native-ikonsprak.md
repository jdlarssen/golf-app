# Spec: Porter Tørnys ikonspråk til appen (#1879)

Eiervalgene er tatt i kontraktøkt 2026-09-01 (samme økt som #1875-kontrakten) —
ingen åpne produktvalg. PR: `Closes #1879`.

**Sekvensering:** bygges ETTER at både N6c (#1856) og #1875-slicen er merget —
alle tre rører `GameHome.tsx` (og #1875 rører `OrganiserSection.tsx`). Denne
kontrakten er nr. 3 i køen på de filene. Rebase på main først.

## Problem

Webben har et håndtegnet ikonspråk (`components/icons/Icons.tsx`: 10
funksjonelle 24×24-linjeikoner, currentColor, stroke 1,5, runde ender — pluss
hero-illustrasjoner for tomme tilstander i samme mappe). Appen har null ikoner:
ingen ikon-avhengighet, kun tekst. Konsekvens: appen og nettsiden føles ikke som
samme produkt, og tette rader (statusord i spillerlister) leses tregere enn
nødvendig.

## Research Findings

- `react-native-svg` er et Expo SDK-bibliotek: `npx expo install
  react-native-svg` pinner SDK 57-kompatibel versjon (verifisert mot
  docs.expo.dev/versions/v57.0.0/sdk/svg, 2026-09-01). Primitivene webben
  bruker (`Line`, `Path`, `Circle`, `Rect`) finnes 1:1.
- Docs-caveat: behold `viewBox` — Android rendrer feil uten.
- `currentColor`-kaskaden fra web skal IKKE gjenskapes: RN-ikonene tar eksplisitt
  `color`-prop (default fra `COLORS`), så tinting er triviell når tema-valget
  (#1866) lander.
- Nativ modul → simulator-verifisering krever ny `expo run:ios`-build (pod
  install). Jest: `jest-expo`-preset — byggeren verifiserer at svg-komponenter
  rendres i test (transformIgnorePatterns/mock ved behov).
- Metro-fella (N6a): `expo install` deklarerer dep-en i `native/app/package.json`;
  `npx expo export` er eneste port som fanger resolusjonsfeil — kjøres som gate.

## Prior Decisions

- **Føringene fra #1879 (eier):** ikon + etikett er hovedregelen; ikon alene kun
  for det universelle settet; ALDRI ikon alene for domenehandlinger (Juster,
  Trekk, Fjern, Lever); statusglyfer i tette rader er OK.
- **Statisk `ui`/`COLORS`** (#1866 utsatt, #1830 additive tokens) — lys variant,
  ingen `useTheme()` på disse flatene ennå.
- **#1875-kontrakten:** «Juster»-knappen er tekst; den får IKKE ikon i denne
  bølgen (domenehandling — kan få blyant + tekst i en senere runde hvis eieren
  vil).

## Design

**Ny ikonmodul** `native/app/src/components/icons/` med RN-porter av webbens
path-data (samme geometri, samme strek: 24×24, stroke 1,5, runde ender, 2px
safe-zone; hero-ikonene i sine web-størrelser). Provenance-kommentar øverst som
peker på web-kilden. Duplisering framfor delt path-modul er et bevisst valg:
ikonene endres ~aldri, og en delt kilde ville krevd web-refaktor (blast radius).
Nye mikro-glyfer (hake, pluss, chevron — finnes ikke i webbens sett) tegnes i
samme strek og legges i samme modul.

**Flater i bølge 1 (alle fire — eiervalg):**

1. **Statusmerker i spillerlister:** `RosterRow` på spill-hjem (Godkjent/Levert
   får hake-glyf; Trukket-form opp til byggeren). Prinsipp (eier-delegert):
   byggeren avgjør glyf+ord vs glyf alene per rad, men ALDRI glyf alene der den
   kan misforstås — hake uten ord kun der tilstanden er entydig.
2. **Hjem: spillkort-/seksjonsankre:** domene-ikon per seksjon — flagg for
   aktive, kalender for planlagte, pokal for ferdige (eksakt mapping mot
   Home-skjermens faktiske seksjoner er byggerens; bruk webbens ikoner der de
   finnes).
3. **Tomme tilstander:** Home-tomtilstanden («Ingen spill ennå») får
   hero-illustrasjon som webbens motstykke; andre tomme tilstander KUN der et
   åpenbart web-motstykke finnes — ingen nytegning for flater webben ikke pynter.
4. **Mikrohandlinger:** pluss-glyf på «Legg til spiller», chevron på
   utvid/lukk-toggles (f.eks. «Lukk listen»). Ikon + eksisterende tekst —
   tekstene fjernes ikke.

**Tilgjengelighet:** dekorative ikoner skjules for skjermleser
(`accessibilityElementsHidden`/`importantForAccessibility="no"` — teksten bærer
meningen). Skulle noe ikon stå alene, kreves `accessibilityLabel`.

**Måtehold:** ikoner legges KUN på flatene over. Knapper og rader som leser
klart i dag får ikke ikon «fordi vi kan» — settet skal ankre, ikke tapetsere.

## Edge Cases & Guardrails

- Behold `viewBox` på alle ikoner (Android-caveat).
- Rad-layout i spillerlistene må tåle glyfen uten å klippe tekst
  (#1842-lærdommen) — glyf og ord på samme grunnlinje, `gap`, ingen faste bredder.
- Tap-targets endres ikke: ikoner i knapper er innhold, ikke nye trykkflater.
- `expo export`-gaten MÅ kjøres (Metro-fella); jest alene beviser ikke
  resolusjonen.
- Worktree-bygg: nativ dep → pod install; kjente Gatekeeper-heng på ferske
  worktrees (memory) — bygg fra bevist worktree ved heng.

## Key Decisions (eier, kontraktøkta 2026-09-01)

- **Alle fire flater i bølge 1** — statusmerker, hjem-ankre, tomme tilstander,
  mikrohandlinger.
- **Statusmerke-form delegert til byggeren** med prinsippet over.
- **Ingen fanerad:** appen er stack-basert og web-navens destinasjoner finnes
  ikke som skjermer — nav-ikonene (Hjem/Konvolutt/Klubbhus/Profil) porteres
  ikke i denne bølgen.

**Claude's Discretion:** eksakt ikon→seksjon-mapping på Hjem; hvilke tomme
tilstander utover Home; per-rad statusform; jest-oppsett for svg; om
Trukket får glyf eller forblir ord.

## Success Criteria

1. `cd native/app && npx tsc --noEmit && npx jest` grønne; eksisterende tester
   oppdatert der rader/knapper fikk glyf (ingen nye render-tester utover det
   endringen selv krever — Type C-regelen).
2. `npx expo export` grønn (Metro-resolusjon av `react-native-svg`).
3. Ikonmodulen finnes med provenance-kommentar; `grep -rn "react-native-svg"
   native/app/src` treffer kun ikonmodulen (én import-flate).
4. Dekorative ikoner er skjult for skjermleser (spot-sjekk i kode); ingen
   domenehandling har fått ikon uten tekst (grep/lesing).
5. Simulator-skjermbilder av Hjem (seksjonsankre + tomtilstand) og spill-hjem
   (statusmerker) i PR-en.
6. VERIFICATION GAP: endelig visuell dom på enhet er eierens tapptest —
   bokføres i PR-en.

## Gates

`cd native/app && npm install && npx tsc --noEmit && npx jest && npx expo export`
etter hver chunk. Ny norsk copy forventes ikke (ikoner, ikke tekst) — endres
likevel en streng: humanizer-tone.

## Files Likely Touched

- `native/app/src/components/icons/` (ny) — RN-ikonmodulen
- `native/app/package.json` (+ lockfil) — `react-native-svg`
- `native/app/src/screens/Home.tsx` — seksjonsankre + tomtilstand
- `native/app/src/screens/GameHome.tsx` — statusmerker i `RosterRow`
- `native/app/src/components/game/OrganiserSection.tsx` — pluss/chevron på
  eksisterende knapper
- Berørte testfiler for de tre

## Out of Scope

- Fanerad / nye skjermer (Innboks, Klubbhuset, Profil) — egen produktbeslutning
  hvis den noen gang kommer.
- Web-endringer (inkl. refaktor av `Icons.tsx` til delt path-modul).
- Mørk modus-tinting (#1866 — `color`-prop gjør den billig senere).
- Ikon på «Juster»/andre domenehandlinger (føring: tekst; evt. ikon + tekst i
  senere runde).
- Scoring-notasjon (webbens `ScoreShape`) — egen tradisjon, ikke del av
  ikonsettet.

## Bokføring for byggeøkta

Commits: `Refs #1879` + `[no-changelog]` (native-presedens). PR: draft-først
(#1516), `Closes #1879`, Fordeler/ulemper-blokk, INGEN produktvalg-heading
(valgene er tatt av eier i kontraktøkta).
