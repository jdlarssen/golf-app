# Spec: Native — konverter skjermene og navigasjonen til useTheme (mørk modus synlig overalt)

(Kontrakt-smedens kontrakt, postet som issue-kommentar på #1833 2026-08-31. Klasse: bruker-synlig. Produktvalg: nei. Funksjonell: «Appen følger nå mørk modus på alle skjermer — ikke bare på oppstartsbildet.»)

## Problem

#1830 la tokens, fonter og mørk modus-mekanismen ADDITIVT i `native/app/src/theme.ts` (`PALETTES`, `FONTS`, `useTheme()`) uten å røre skjermene, av hensyn til N4-parallellen (#1828). Skjermene er derfor fortsatt låst til lys `ui`/`COLORS`, og mørk modus synes kun på splash + boot-viewet. N4 har landet, så konverteringen kan gjøres nå.

## Design

1. **Skjermene** i `native/app/src/screens/` (`Login`, `Home`, `GameHome`, `Hole`, `Scorecard`, `Approve`, `Leaderboard`) + dev-labben `native/app/src/SyncLab.tsx` konverteres til `useTheme()`: lokale `StyleSheet`-farger → palette-tokens; lokale `fontWeight`-overrides oppå custom-familier → `FONTS`-tokens (expo-font: én familie per snitt, `fontWeight` velger ikke snitt).
2. **Leaderboard-komponentene** i `native/app/src/components/leaderboard/` (`Table`, `MatchView`, `WolfView`, `BingoBangoBongoView`, `PotViews`, `ResultView`, `SideTournamentSection`) samme behandling — OG hull-komponentene i `native/app/src/components/hole/`: `WolfChoiceCard.tsx` og `BingoBangoBongoCard.tsx` importerer `COLORS, TAP, ui` (linje 24/25) og bruker `COLORS.border/linen/gold` — de rendrer inne i Hole, appens viktigste skjerm, og fanges IKKE av hex-grepen (de bruker `COLORS`, ikke hex).
3. **`ui`-hjelperne**: fabrikken `createUi(palette)` finnes allerede i `theme.ts` (linje 185–191) — dagens `ui`-eksport er `createUi(PALETTES.light)`. Konverteringen består i å la konsumentene hente `ui` fra `useTheme()`/paletten i stedet for den statiske lys-eksporten.
4. **`src/navigation.tsx`**: hardkodede hex (linje 56–60: `headerStyle '#F8F6F0'`, `headerTintColor '#1B4332'`, `contentStyle`) → tokens, + react-navigation container-theme bygget fra paletten.
5. **`App.tsx`**: `StatusBar style="dark"` (linje 87) → `"auto"` (holdt bevisst tilbake i #1830 fordi skjermene var lyse).
6. **Saner `COLORS`-eksporten**: når ingen konsumenter er igjen, fold den inn i `PALETTES`/fjern den (dobbelthet bokført i #1830; rename var forbudt kun pga. N4-rebasen, som nå er landet).

## Edge Cases & Guardrails

- **N6a (#1854 / PR #1860)** legger til `CreateGame`-skjermen. Er den merget når dette bygges: konverter den også (grep-porten under avslører den). Ikke merget: ikke rør PR-branchen — porten kjøres på nytt der ved rebase.
  - *Nattkjørerens merknad 2026-09-02:* PR #1860 ER merget (2026-09-01), og `CreateGame.tsx` ligger på main. Det samme gjør `EndGame.tsx` (N6c, #1856). Begge omfattes av grep-porten og skal konverteres.
- Mørk modus skal følge **systeminnstillingen** (mekanismen fra #1830) — ingen egen toggle.
- Statisk `StyleSheet.create` med farger: velg ETT mønster (styles i komponent memoisert på palette, ELLER layout i statisk sheet + farger inline fra tokens) og bruk det konsekvent i alle filene.
- `tabular-nums`/`ui.num`-semantikken og eksisterende `testID`-er skal overleve uendret.

## Key Decisions

- Ett konsekvent mønster for palette-avhengige styles (se over) — byggeren velger og dokumenterer i PR.
- `COLORS` fjernes helt hvis alle konsumenter er konvertert; delvis sanering bokføres eksplisitt.
- `native/app/src/theme.test.ts` låser dagens tilstand (importerer `COLORS` linje 6, asserter `PALETTES.light` mot COLORS-verdiene linje 17–27, `expect(light.ui).toBe(ui)` linje 64/79) — assertions SKRIVES OM (ikke slettes) i samme commit som saneringen, ellers blir jest-porten rød.

## Success Criteria

1. `cd native/app && npx tsc --noEmit` grønn.
2. `cd native/app && npx jest` grønn.
3. Grep-porten håndheves: `grep -rnE "#[0-9A-Fa-f]{6}\b" native/app/src --include="*.ts" --include="*.tsx" | grep -vE "src/theme\.(test\.)?ts"` → 0 treff. (3-tegns-varianten `{3,8}` matcher issue-referanser i kommentarer (`#1832` o.l.) — 172 treff hvorav bare 20 er ekte farger — og er ubrukelig som port; alle reelle fargelitteraler i appen er 6-sifrede.)
4. `StatusBar` står på `"auto"`; navigation-theme leser tokens (ingen hex i `navigation.tsx`).
5. VERIFICATION GAP: visuell lys/mørk-gjennomgang i simulator kan ikke kjøres headless — bokføres i PR-en som eierens tapptest.

## Gates

`cd native/app && npm install && npx tsc --noEmit && npx jest` (`node_modules` finnes ikke i ferske kloner). Rot-repoets gates (vitest/lint) urørt — ingen web-filer endres.

## Files Likely Touched

`native/app/src/theme.ts`, `native/app/src/theme.test.ts`, `native/app/App.tsx`, `native/app/src/navigation.tsx`, `native/app/src/SyncLab.tsx`, `native/app/src/screens/*.tsx`, `native/app/src/components/leaderboard/*.tsx`, `native/app/src/components/hole/*.tsx`.

## Out of Scope

Nye skjermer/features, web-endringer, egen mørk modus-toggle, `CreateGame` hvis PR #1860 ikke er merget ved byggetid.
