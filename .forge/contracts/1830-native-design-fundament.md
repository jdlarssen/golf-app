# Spec: Native — design-fundament: Fraunces/Inter, mørk modus og delt primitiv-sett (#1830)

Del-issue av epic #1816 (Must i MoSCoW-lista, eierbeslutning 2026-08-30). N3 (#1825) la
paletten i `native/app/src/theme.ts`; dette issuet legger de to manglende brand-bærerne
(fontene og mørk modus) som **fundament** — skjermkonvertering skjer i egen oppfølging.

## Problem

Appen kjører systemfonter og har kun lys palett. Fraunces (hierarki + tall) og Inter (UI)
er brand-bærere på webben; mørk modus («klubbhus-natt») finnes i `app/globals.css` men
ikke i appen. N4 (#1828) bygger leaderboard-skjermer mot `theme.ts` i parallell — jo før
tokens blir tema-bevisste, jo færre skjermer må skrives om.

## Research Findings

- **expo-font SDK 57** (docs.expo.dev/versions/v57.0.0/sdk/font, lest 2026-08-30):
  `useFonts`-hooken returnerer `[loaded, error]`; flash-fri oppstart = par den med
  `expo-splash-screen` (`preventAutoHideAsync()` på modulnivå, `hideAsync()` når
  `loaded || error`). Config-plugin-innbaking finnes, men familienavnet spriker per
  plattform (Android = filnavn, iOS = navnet i fontfila) — runtime-`useFonts` med
  `@expo-google-fonts`-pakkene gir ETT navn per snitt på begge plattformer. Valgt.
- **`app.json` har `"userInterfaceStyle": "light"`** — dette LÅSER appen til lys modus;
  `useColorScheme()` rapporterer aldri `dark` før den byttes til `"automatic"`.
- **Web-tokenkart** (`app/globals.css`): lys :root-blokk (linje 29–35) og mørk
  klubbhus-natt-blokk (linje 171–192 / 273–290). Roller appen trenger nå: bg, surface,
  border, text, muted, primary, onPrimary, accent, danger. Knappe-tekst i mørk modus er
  `dark:text-bg` (#14201a på sage, `components/ui/Button.tsx:17`).
- **Font-vektskala** (`app/globals.css:22–26`): serif display = 500, serif score = 600,
  sans body = 400, sans label = 500, sans strong = 600.
- **RN + expo-font:** hvert vekt-snitt registreres som egen familie
  (`Fraunces_600SemiBold` osv.) — `fontWeight` velger IKKE snitt for custom-fonter
  (Android fake-bolder, iOS faller til nærmeste). Stiler med custom familie dropper
  `fontWeight`; vekt uttrykkes via familienavnet.
- **Native modul-fella** (docs/native/app-spike.md): expo-font er native modul — et
  eksisterende simulatorbygg krasjer ved oppstart til `npx expo prebuild --platform ios
  --no-install` + `pod install` (LANG=en_US.UTF-8) + nytt xcodebuild er kjørt.
  `npx expo export` fanger det IKKE.

## Prior Decisions (N1–N3 + eier-koordinering 2026-08-30, alle står)

- Frittstående app i `native/app/`; web-fredning absolutt (diff kun `native/app/**`,
  `docs/native/**`, `.forge/**`). `chore(native)`-commits med `Refs #1830`, ingen
  `.changes/`-notat (dev-app, ikke bruker-synlig i web-appen).
- **N4-koordinering (eiermelding i økta):** N4-branchen `claude/n4-leaderboards-formatfamilier`
  skriver om `Hole.tsx`, `Scorecard.tsx`, `GameHome.tsx` + ny `Leaderboard.tsx` NÅ.
  Denne PR-en holder seg til `theme.ts`, `App.tsx` (fontlasting), `package.json`,
  `app.json` og evt. nye primitiv-filer. **Ingen konvertering av eksisterende skjermer,
  ikke rør `navigation.tsx`.** Token-endringer er ADDITIVE — ingen renames av
  eksisterende eksporter/nøkler. Liten, tidlig PR; N4 rebaser; PR-body lister nye
  token-eksporter.
- Disiplinregel (epic): skjermer bygges alltid mot tokens/primitivene, aldri hardkodede
  farger/fonter.

## Design

**Avhengigheter** (`npx expo install expo-font expo-splash-screen` + npm-install av
`@expo-google-fonts/fraunces`, `@expo-google-fonts/inter`): seks snitt lastes —
Fraunces 500/600, Inter 400/500/600/700.

**`app.json`:** `userInterfaceStyle` → `"automatic"`. `expo-splash-screen`-plugin med
`backgroundColor` = linen `#F8F6F0` og `dark.backgroundColor` = klubbhus-natt `#14201A`
(+ eksisterende `./assets/splash-icon.png`) — splashen er det synlige mørk modus-beviset
i denne etappen, og hindrer hvit blits i mørk modus.

**`theme.ts` — additivt (eksisterende eksporter `COLORS`, `TAP`, `ui` beholder navn og
nøkler; kun VERDIER i `ui` endres der fonter kommer inn):**

- `export type Scheme = 'light' | 'dark'`
- `export type ThemeColors` — semantiske roller: `bg, surface, border, text, muted,
  primary, onPrimary, accent, danger` (vokser ved behov — ikke forskudds-designsystem).
- `export const PALETTES: Record<Scheme, ThemeColors>` — lys = dagens verdier
  bit-identisk (bg #F8F6F0, surface #FFFFFF, border #E3DFD3, text/primary #1B4332,
  muted #5C6B60, onPrimary #FFFFFF, accent #C9A961, danger #B00020); mørk fra
  globals.css (bg #14201A, surface #1C2A22, border #2F3F34, text #ECE5D2, muted #9A9180,
  primary #7EAA80, onPrimary #14201A, accent #D4B870, danger #D67268).
- `export const FONTS` — `serifDisplay: 'Fraunces_500Medium'`, `serifScore:
  'Fraunces_600SemiBold'`, `sans: 'Inter_400Regular'`, `sansMedium: 'Inter_500Medium'`,
  `sansSemiBold: 'Inter_600SemiBold'`, `sansBold: 'Inter_700Bold'`.
- Per-scheme `ui`-varianter bygges ÉN gang på modulnivå av samme fabrikk
  (`StyleSheet.create` per scheme, identiske nøkler som dagens `ui`);
  `export const ui = <lys varianten>` (uendret navn/nøkler for N4).
- `export function useTheme(): { scheme, colors, ui }` — `useColorScheme()` (null →
  `'light'`) velger palett + ferdigbygd StyleSheet.
- Font-mapping i `ui` (begge schemes): `title` → serifScore (hierarki, 600 — native
  26px trenger score-vekten for å bære), `value` → serifScore, `sectionTitle` →
  sansSemiBold, `body`/`muted`/`error` → sans, `buttonText`/`buttonSecondaryText`/
  `badgeText` → sansSemiBold, `linkText` → sansMedium. `fontWeight` fjernes der
  familie settes (se Research). `num` beholder kun `tabular-nums`.

**`App.tsx`:** `SplashScreen.preventAutoHideAsync()` på modulnivå; `useFonts(...)` med
de seks snittene; splash skjules først når `(loaded || error) && !booting` — ingen
font-hopp OG ingen spinner-blits ved kaldstart. Font-feil → app fortsetter med
systemfonter (aldri heng). Boot-viewet + Login-fallbacken bak splashen henter farger
fra `useTheme()`. `StatusBar` forblir `style="dark"` (mørk tekst) SÅ LENGE skjermene
er ukonverterte og lyse — flippes til `"auto"` i konverterings-oppfølgeren.

**Test (Type A, liten):** `theme.test.ts` — `PALETTES.light` == dagens `COLORS`-verdier
rolle-for-rolle, mørk palett komplett (ingen rolle deler verdi med lys der web skiller),
`ui`-nøkkelsett identisk mellom schemes og med dagens nøkler. Render-hook-test av
`useTheme` (mocket `useColorScheme`: null/'light'/'dark'). INGEN nye render-tester av
skjermer (Type C-regelen).

**Edge-tabell (T1 §4):**

| Input-klasse | Forventet |
|---|---|
| `useColorScheme()` → null | lys palett (fallback) |
| scheme flipper i kjørende app | komponenter med `useTheme` re-rendrer (hook-kontrakt) |
| font-lasting feiler | splash skjules likevel, systemfonter, ingen heng |
| kaldstart før fonter lastet | splash står — intet tekst-render med fallback-font |
| jest-miljø | jest-expo mocker expo-font/useColorScheme — eksisterende suiter grønne uten nye stubs |
| ukonvertert skjerm i mørk modus | forblir lys (bokført transitional gap → oppfølgings-issue) |
| lokale `fontWeight: '700'`-overrides oppå ui-stiler m/ custom familie | transitional: kan rendre regular på iOS — gjelder skjermer N4 uansett skriver om; fikses i konverteringen |
| `expo run`-bygg uten ny prebuild | krasj ved oppstart — prebuild + pod install + xcodebuild FØR simulatorbevis |

**Recompute-vs-reuse (T1 §5):** N/A — ingen derivert beregning; tokens er statiske verdier.

## Key Decisions

- **Runtime `useFonts` + splash-hold, ikke config-plugin-innbaking** — ett familienavn
  per snitt på begge plattformer; docs-mønsteret for flash-fri oppstart. Revurderes hvis
  kaldstart-lastetid blir merkbar (TTF-ene bundles lokalt, forventet ~0).
- **Additive tokens, ingen renames** — eier-koordinering mot N4. `COLORS` består som i
  dag (lys, brand-navn); semantikken bor i `PALETTES`/`useTheme`. Evt. sanering av
  dobbeltheten bokføres i konverterings-oppfølgeren.
- **Ingen skjerm-/navigasjonskonvertering her** — eierbestilling. Mørk modus bevises på
  mekanisme-nivå (splash-variant, useTheme-test, boot uten krasj i mørk appearance);
  full visuell mørk modus kommer med konverterings-issuet.
- **`title` → Fraunces 600 (ikke web-displays 500)** — native-titlene var 700 bold;
  500 på 26px mobil leser for lett. Skjønnsrom bokført her.

**Claude's Discretion:** eksakt fabrikk-mekanikk i theme.ts, testfil-detaljer,
splash-plugin-feltene, rekkefølge på commits.

## Success Criteria

- [x] 1. **Fontene lever:** simulator-skjermbilde viser Fraunces på titler/tall
  (`ui.title`/`ui.value`) og Inter på brødtekst/knapper på ekte skjermer (Hjem/Login);
  kaldstart viser ALDRI systemfont-blits (splash står til fontene er klare — verifisert
  ved relaunch).
  - *Evidens (2026-08-30 21:49–21:50, simulator 820CA940, Release-bygg):* Hjem viser
    Fraunces-serif på spilltitler («TEST-Cup-…», «Byneset North 3. juli») og Inter på
    banelinje/badges/«PÅGÅR NÅ»; GameHome viser Fraunces-tittel + Inter-brødtekst og
    «Scorekort»-knapp (Inter SemiBold). Kaldstart-burst i lys modus: frame 4 = splash
    (linen, ingen tekst) → frame 5–8 = ferdig fontet Hjem, ingen mellomframe med
    systemfont. *Avvik:* Login ikke fotografert — utlogging ville ødelagt simulatorens
    innloggede e2e-sesjon (rigg-asset for N-etappene); Hjem+GameHome dekker beviset.
    Bundelen inneholder nøyaktig de 6 TTF-ene (find i TrnyDev.app → 6 treff).
- [x] 2. **Token-splitt additivt:** `theme.ts` eksporterer `Scheme`, `ThemeColors`,
  `PALETTES` (lys bit-identisk med dagens verdier; mørk = klubbhus-natt fra
  globals.css), `FONTS` og `useTheme()`; eksisterende eksporter `COLORS`/`TAP`/`ui`
  uendret i navn og nøkkelsett (`git diff` viser ingen fjernede eksporter/nøkler).
  - *Evidens:* `theme.test.ts` (7 tester grønne, TDD rød→grønn i økta) låser lys
    palett == COLORS-verdiene rolle for rolle, mørk komplett + distinkt, nøkkelsett-
    paritet lys/mørk og `ui` === lys-varianten. Diff i `ui`-stiler er kun
    fontFamily inn / fontWeight ut; COLORS/TAP uendret.
- [x] 3. **Mørk modus-mekanismen:** `app.json` har `userInterfaceStyle: "automatic"` +
  splash-plugin med mørk variant; simulator i dark appearance booter uten krasj og viser
  mørk splash; jest-testen beviser at `useTheme` gir mørk palett ved `'dark'` og lys ved
  `null`.
  - *Evidens (21:49–21:50):* `simctl ui … appearance dark` + kaldstart → skjermbilde av
    mørk splash (klubbhus-natt-bakgrunn + ikon) og deretter Hjem uten krasj (lys som
    bokført — konvertering er #1833). Prebuild-colorsettet: ANY = (248,246,240) =
    #F8F6F0, dark = (20,32,26) = #14201A — eksakt kontraktverdiene.
    `resolveScheme`-testene dekker `'dark'`/`'light'`/`null`/`undefined`/`'unspecified'`
    (RN 0.86-unionen inkluderer 'unspecified' — fanget av tsc i økta).
- [x] 4. **Gates grønne** (alle syv): app-jest, app-tsc, `npx expo export --platform
  ios`, rot-typecheck, `npx vitest run lib/sync lib/scoring`, rot-build, `npx eslint
  native/app`. *Evidens: Gates-seksjonen under, alle kjørt 2026-08-30 21:35–21:50.*
- [x] 5. **Web-fredning + koordinering:** diff kun `native/app/**`, `docs/native/**`,
  `.forge/**`; `navigation.tsx` og skjermfilene har NULL diff; PR-body lister de nye
  token-eksportene for N4; oppfølgings-issue for skjerm-/navigasjonskonvertering
  opprettet før merge.
  - *Evidens (21:52–22:05):* `git diff origin/main --name-only` = 10 filer, 0 utenfor de
    tre sonene; skjermer/navigasjon/SyncLab 0 diff; `git diff origin/main -- lib/` = 0
    linjer. Oppfølgings-issue #1833 opprettet (milestone Native app). PR #1834 opprettet
    (draft-først) med token-eksport-tabellen for N4 i body-en; evaluator-observasjonen
    getSession-catch fikset i PR-en (runde-fila).

## Gates

- [x] `npx jest` i `native/app/` grønt — 12 suiter / 92 tester, exit 0 (21:45)
- [x] `npx tsc --noEmit` i `native/app/` grønt — exit 0 (21:45)
- [x] `npx expo export --platform ios` grønt (`dist/` slettet) — exit 0, hbc 2.8MB, nøyaktig 6 TTF-assets (21:44)
- [x] `npm run typecheck` (rot) grønt — exit 0 (21:47)
- [x] `npx vitest run lib/sync lib/scoring` grønt — 1303/1303, exit 0 m/ pipefail (21:47)
- [x] `npm run build` (rot) grønt — exit 0 (21:48)
- [x] `npx eslint native/app` grønt — exit 0 (21:47)

## Files Likely Touched

- `native/app/src/theme.ts` — token-splitt, FONTS, useTheme, per-scheme ui
- `native/app/src/theme.test.ts` — ny
- `native/app/App.tsx` — useFonts + splash-hold, useTheme på boot-viewet
- `native/app/app.json` — userInterfaceStyle automatic + splash-plugin m/ mørk variant
- `native/app/package.json` (+lock) — expo-font, expo-splash-screen, @expo-google-fonts/*
- `docs/native/app-spike.md` — kort #1830-seksjon (fonter/mørk modus/nye tokens)
- `.forge/contracts/1830-native-design-fundament.md` — denne

## Out of Scope

- Konvertering av eksisterende skjermer (`Login`, `Home`, `GameHome`, `Hole`,
  `Scorecard`, `Approve`, `SyncLab`) og `navigation.tsx` til `useTheme` — egen
  oppfølgings-issue (opprettes før merge); N4-friksjon er grunnen.
- `StatusBar`-flip til `"auto"`, navigasjons-header-tema, react-navigation
  container-theme — samme oppfølger.
- Nye primitiv-typer utover dagens `ui`-sett (liste-rad m.m.) — vokser ved behov i N4+.
- Config-plugin-innbaking av fonter, Android-verifisering (N8-paritet), web-endringer.
