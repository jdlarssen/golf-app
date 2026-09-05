# Statisk ikonpakke (#1278)

Bygges av `generate-icons.mjs` fra de to master-SVG-ene i denne mappen. Kjør på nytt
med:

```
PW_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium node native/assets/generate-icons.mjs
```

(`PW_CHROMIUM_EXECUTABLE_PATH` er valgfri — utelat den for å bruke Playwrights egen
nedlastede browser, f.eks. på en utviklermaskin med `npx playwright install`.)

## Master-kilder

- `icon-master-full-bleed.svg` — forest-bakgrunn helt ut til kanten, uten avrunding
  (butikker/OS runder selv). Brukes til `appstore-1024.png`.
- `icon-master-safe-zone.svg` — kun motivet (T + prikk), transparent bakgrunn,
  skalert 0.7× om senter. Skalert ned for å ligge trygt innenfor BÅDE Androids
  adaptive-safe-zone (~66 % diameter) og maskable-safe-zonen (80 % diameter) — samme
  master dekker begge. Brukes til `android-foreground-432.png`,
  `public/icons/maskable-*.png` (lagt oppå en heldekkende forest-bakgrunn) og
  `ios-splash-logo.png`.

## Output

| Fil | Størrelse | Merknad |
|---|---|---|
| `appstore-1024.png` | 1024×1024 | Ingen alfakanal (IHDR color type 2) — App Store Connect avviser PNG med alfa. |
| `android-foreground-432.png` | 432×432 | Transparent bakgrunn, motiv i safe-zone. |
| `android-background-432.png` | 432×432 | Ensfarget `#1B4332` (samme verdi som `theme_color` i `app/manifest.ts`). |
| `public/icons/maskable-192.png`, `public/icons/maskable-512.png` | 192×192 / 512×512 | Forest-bakgrunn + motiv i safe-zone — konsumert av `app/manifest.ts` (`purpose: maskable`). |
| `ios-splash-logo.png` | 512×512 | Transparent, til #1283s launch-storyboard (komponeres der på `background_color` `#F8F6F0`). |
| `preview-contact-sheet.png` | 1450×360 | Hele settet samlet + en sirkel-maskert (`clip-path: circle(40%)`) forhåndsvisning av `maskable-512` — viser om motivet blir beskåret. |
| `native/app/assets/icon.png` | 1024×1024 | Kopi av `appstore-1024.png`. Expo-appens app-ikon (`app.json` → `icon`). |
| `native/app/assets/splash-icon.png` | 1024×1024 | Kopi av `appstore-1024.png`. Lys splash — flisen, ikke motivet (se under). |
| `native/app/assets/splash-icon-dark.png` | 512×512 | Kopi av `ios-splash-logo.png`. Mørk splash, mot `#14201A`. |
| `native/app/assets/android-icon-foreground.png` | 432×432 | Kopi av `android-foreground-432.png`. |
| `native/app/assets/android-icon-background.png` | 432×432 | Kopi av `android-background-432.png`. |

## Expo-appens assets (#1975)

De fem siste radene skrives av samme kjøring, fra de samme bufferne — de er
altså byte-identiske med masterne, ikke egne renders. `native/app/app.json`
peker på dem, og `native/app/scripts/store-build-proof.sh` sammenligner
`icon.png` med `appstore-1024.png` (sha256) før hver opplasting. Et bygg med
Expo-malens ikon kan derfor ikke bevises grønt.

**Hvorfor lys splash bruker flisen og ikke motivet:** motivets `T` er fylt
`#F8F6F0` — nøyaktig samme farge som den lyse splash-bakgrunnen i `app.json`.
Motivet ville vært usynlig der. Den heldekkende flisen på linen er dessuten
det installerte PWA-er alt viser (`app/manifest.ts`: `background_color`
`#f8f6f0` + forest-ikon), så de to flatene ser like ut.

Mangler: ingen monokrom master finnes, så `monochromeImage` er fjernet fra
`app.json` framfor å peke på Expo-malens grå vinkel. Android er uansett ute av
N8 (#1954).

## Mekaniske vakter

Scriptet leser PNG-enes IHDR-header direkte (byte 16–23 = bredde/høyde, byte 25 =
color type) og feiler høyt (exit 1) hvis noen fil ikke har eksakt oppgitt pikselstørrelse,
eller hvis `appstore-1024.png` har en alfakanal. Ingen av sjekkene er visuelle —
visuell godkjenning av selve designet gjøres av eier i PR-en (`needs-manual-qa`).
