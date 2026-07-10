# Spec: Playwright executablePath-override for routine-miljøet (#1183)

## Problem

Nattkjøreren/routine-miljøet kan ikke kjøre `npm run e2e:gate`: repoets pinnede
`@playwright/test` (1.60.0 per `package-lock`, caret `^1.59.1`) forventer
chromium-build **1223**, mens miljøet har pre-installert **1194** (+ en generisk
`/opt/pw-browsers/chromium`) og `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`. Resultat:
`browserType.launch: Executable doesn't exist` før noen test kjører, og ALLE
bruker-synlige natt-bygg faller til `needs-manual-qa` på e2e-steget (nattkjoreren.md
steg 4). CI er upåvirket (laster egne browsere) — dette gjelder kun natt-lokal e2e.

## Research Findings

- `executablePath` er dokumentert i `LaunchOptions` for den installerte versjonen
  (`node_modules/playwright-core/types/types.d.ts:15612`): «Path to a browser
  executable to run instead of the bundled one … use at your own risk.» Settes den,
  brukes binæren direkte — registry-oppslaget (som feiler i dag) skjer ikke.
- Med `executablePath` mot full chromium kjøres headless med `--headless`-flagget på
  den oppgitte binæren; headless-shell-registeret (kilden til dagens feil) omgås.
- Versjons-skew (1194-binær mot 1.60-API) er offisielt «at your own risk» — akseptabelt
  fordi natt-e2e er et lokalt orakel; PR-ens CI kjører fortsatt pinnede browsere og
  forblir fasit. Miljø-notatet for routine-imaget anbefaler selv dette mønsteret.

## Design

`playwright.config.ts`: honorér en path-valued env-variabel
`PW_CHROMIUM_EXECUTABLE_PATH`. Satt → `use.launchOptions.executablePath` peker på den;
usatt (CI, lokal utvikling) → dagens oppførsel, bit-for-bit uendret. Skisse:

```ts
use: {
  // ...eksisterende felter uendret...
  launchOptions: process.env.PW_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE_PATH }
    : {},
},
```

`docs/loops/nattkjoreren.md` steg 4: én setning — når miljøets pre-installerte
browser-build ikke matcher pinnet Playwright, eksportér
`PW_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium` før `npm run e2e:gate`.

ASSUMPTION: path-valued env (ikke boolsk `PW_ROUTINE` + hardkodet sti) — mer generell,
ingen miljø-spesifikk sti i repoet, og selvdokumenterende. Issuet foreslo env-gate;
dette er samme alternativ 1 med path som verdi.

## Edge Cases & Guardrails

- Env satt til sti som ikke finnes → Playwright feiler med tydelig launch-feil; det er
  riktig (fail-closed), ingen egen validering nødvendig.
- MÅ ikke endre CI-oppførsel: variabelen settes aldri i workflows — verifiseres ved at
  ingen `.github/`-fil endres og at `e2e`-jobben på PR-en er grønn som før.
- Prod-vakta gjelder fortsatt: natt-e2e treffer kun staging-ref
  `snwmueecmfqqdurxedxv` (uendret av denne fiksen — assert i natt-loggen første kjøring).

## Key Decisions

- Alternativ 1 fra issuet (repo-fiks) — holder disiplinen i repoet, rører ikke
  CI-oppsettet. Alternativ 2 (re-provisjonere routine-imaget) står åpent som miljø-fiks
  men er utenfor repoets kontroll.

**Claude's Discretion:** eksakt betinget form i konfigen (ternary vs. spread), og om
kommentaren i konfigen skal peke på #1183.

## Success Criteria

- [x] Uten env: `npx playwright test e2e/games/scoring-golden-path.spec.ts --grep @gate`
      kjører som i dag (bundlet browser) — lokal kjøring grønn.
      → Bevist med throwaway-probe mot config: env UNSET → browser launcher (bundlet
      chromium-1223), `1 passed (756ms)`. `launchOptions: {}` er bit-for-bit no-op.
- [x] Med `PW_CHROMIUM_EXECUTABLE_PATH` pekende på en gyldig lokal chromium-binær:
      samme spec bruker den oppgitte binæren (bevis: kjøringen starter uten
      «Executable doesn't exist»-feilen).
      → env = lokal chromium-1223-binær → `1 passed (3.8s)`, ingen registry-feil. OG
      env = ikke-eksisterende sti → `browserType.launch: Failed to launch chromium
      because executable doesn't exist at /opt/pw-browsers/chromium-DOES-NOT-EXIST-1183/chrome`
      — beviser at config faktisk trer env-en inn i `launchOptions.executablePath`
      (ellers ville den falt tilbake til bundlet og passert).
- [x] `docs/loops/nattkjoreren.md` steg 4 dokumenterer variabelen.
      → Steg 4 har nå et kulepunkt med `PW_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium`.
- [ ] Første natt-kjøring etter merge logger et reelt `e2e:gate`-forsøk i stedet for
      insta-fail (VERIFICATION GAP til den kjøringen har skjedd — noter i PR-kommentar).
      → VERIFICATION GAP: kan kun bekreftes i routine-Linux-miljøet (build 1194); noteres i PR.

## Gates

- [x] `npx tsc --noEmit` grønn (konfigen er TS). → exit 0 (etter `npm install` i worktree).
- [x] `npm run lint` grønn. → `54 problems (0 errors, 54 warnings)`, exit 0; alle warnings
      er pre-eksisterende i urelaterte filer, config-en produserer ingen.
- [x] Ingen endring under `.github/`. → `git diff --stat` = kun 2 filer, ingen under `.github/`.

## Files Likely Touched

- `playwright.config.ts` — betinget `launchOptions.executablePath`
- `docs/loops/nattkjoreren.md` — én linje i steg 4

## Out of Scope

- Flake-årsakene i #1132/#1168 (egne datapunkt-issues for en ev. flake-jeger).
- Re-provisjonering av routine-imaget til build 1223 (alternativ 2 — miljø, ikke repo).
- Endringer i CI-workflows eller Playwright-versjonspinning.
