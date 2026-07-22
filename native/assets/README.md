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

## Mekaniske vakter

Scriptet leser PNG-enes IHDR-header direkte (byte 16–23 = bredde/høyde, byte 25 =
color type) og feiler høyt (exit 1) hvis noen fil ikke har eksakt oppgitt pikselstørrelse,
eller hvis `appstore-1024.png` har en alfakanal. Ingen av sjekkene er visuelle —
visuell godkjenning av selve designet gjøres av eier i PR-en (`needs-manual-qa`).
