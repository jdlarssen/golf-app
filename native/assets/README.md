# Merket fra én kilde (#1278, #1975, #1985)

Alle rasterkopier av Tørny-merket bygges av `generate-icons.mjs` fra de tre
master-SVG-ene i denne mappen: App Store-ikonet, Android-lagene, splash, Expo-appens
assets, nettets PWA-ikoner (`/icon`, `/icon0`, `/apple-icon`), ikonene i
Google Play-skallet (`native/android/`) og ordmerket i e-postheaderen. Ingen andre
filer tegner merket. Kjør på nytt med:

```
PW_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium node native/assets/generate-icons.mjs
```

(`PW_CHROMIUM_EXECUTABLE_PATH` er valgfri — utelat den for å bruke Playwrights egen
nedlastede browser, f.eks. på en utviklermaskin med `npx playwright install`.)

Vil du se et kandidatmerke uten å røre noe som shippes, legg de tre masterne i en
egen mappe og kjør `node native/assets/generate-icons.mjs --preview <mappe>`. Da
skrives bare `<mappe>/contact-sheet.png`.

## Master-kilder

- `icon-master-full-bleed.svg` — flisen (forest-gradient) helt ut til kanten, uten
  avrunding (butikker/OS runder selv). Bakgrunnen er merket `data-layer="tile"`;
  alene er den Android-bakgrunnslaget og bakgrunnen i maskable-ikonene. Brukes til
  `appstore-1024.png`, nettets PWA-ikoner og Play-skallets launcher-, butikk-,
  splash- og varselikoner.
- `icon-master-safe-zone.svg` — kun motivet (T + ball), transparent bakgrunn,
  skalert 0.7× om senter. Skalert ned for å ligge trygt innenfor BÅDE Androids
  adaptive-safe-zone (~66 % diameter) og maskable-safe-zonen (80 % diameter) — samme
  master dekker begge. Brukes til `android-foreground-432.png`,
  `public/icons/maskable-*.png` og Play-skallets `ic_maskable` (lagt oppå flisen),
  og `ios-splash-logo.png`.
- `wordmark-master.svg` — ordmerket «Tørny» med ballen på T-en, til flater som ikke
  kan sette Fraunces selv (i dag e-postheaderen). `width`/`height` er visningsstørrelsen
  i mailen; generatoren rendrer den i 2×.

T-en er satt i Fraunces 500. Masterne låser optisk størrelse med
`font-variation-settings` (ikon: 48, ordmerke: 32), så generatoren laster
variabel-fonten med `opsz`-aksen. Den feiler høyt hvis Fraunces ikke lastet —
masterne nevner `Georgia, serif` som reserve, og en blokkert fontforespørsel ville
ellers gitt et ikon i feil skrift uten at noe merket det.

## Output

| Fil | Størrelse | Merknad |
|---|---|---|
| `appstore-1024.png` | 1024×1024 | Ingen alfakanal (IHDR color type 2) — App Store Connect avviser PNG med alfa. |
| `android-foreground-432.png` | 432×432 | Transparent bakgrunn, motiv i safe-zone. |
| `android-background-432.png` | 432×432 | Flisen alene (gradient `#1B4332` → `#14201A`). |
| `public/icons/maskable-192.png`, `public/icons/maskable-512.png` | 192×192 / 512×512 | Flisen + motiv i safe-zone — konsumert av `app/manifest.ts` (`purpose: maskable`) og av Play-skallets `maskableIconUrl`. |
| `public/icons/icon-192.png`, `icon-512.png`, `apple-icon-180.png` | 192 / 512 / 180 | Full-bleed, ingen alfakanal. Serveres på `/icon`, `/icon0` og `/apple-icon` via `rewrites()` i `next.config.ts`, så installerte PWA-er, `public/sw.js` og Play-skallet beholder URL-ene sine. |
| `ios-splash-logo.png` | 512×512 | Transparent motiv, mørk splash. |
| `native/android/store_icon.png` | 512×512 | Play-skallets butikkikon. |
| `native/android/app/src/main/res/mipmap-*/ic_launcher.png` | 48–192 | Full-bleed. |
| `native/android/app/src/main/res/mipmap-*/ic_maskable.png` | 82–328 | Flisen + motiv, som `maskable-512.png`. |
| `native/android/app/src/main/res/drawable-*/splash.png` | 300–1200 | Full-bleed. |
| `native/android/app/src/main/res/drawable-*/ic_notification_icon.png` | 24–96 | Full-bleed (samme som Bubblewrap bakte inn fra `/icon0`). |
| `public/brand/wordmark-mail@2x.png` | 2× `wordmark-master.svg` | Ordmerket på mailkortets hvite bakgrunn, ingen alfakanal — forest-tekst på transparent PNG forsvinner når Gmail/Outlook mørklegger kortet. `lib/mail/wordmark.ts` peker hit. |
| `preview-contact-sheet.png` | 1480×900 | Hele settet samlet: ikonet i 1024/180/60/40/29 px på lys og mørk hjemskjerm, sirkel-maskert maskable og adaptive-ikon (viser om motivet blir beskåret), begge splash-ene og ordmerket i sm/lg/e-post. |
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

## Play-skallet (#1985)

Bubblewrap bakte ikonene inn fra `/icon0` og `maskable-512.png` da skallet ble
laget. Generatoren skriver dem nå direkte, i nøyaktig de samme størrelsene. Bruk
ikke `bubblewrap update` til ikonene: den henter `iconUrl` fra prod, som serverer
det gamle merket fram til en deploy. `twa-manifest.json` røres ikke. Et nytt ikon
når Google Play først med neste AAB (`docs/native/android-twa.md`).

## Mekaniske vakter

Scriptet leser PNG-enes IHDR-header direkte (byte 16–23 = bredde/høyde, byte 25 =
color type) og feiler høyt (exit 1) hvis noen fil ikke har eksakt oppgitt
pikselstørrelse, hvis en heldekkende fil (App Store-ikonet, PWA-ikonene,
e-postordmerket) har en alfakanal, eller hvis Fraunces ikke lastet. Ingen av
sjekkene er visuelle — visuell godkjenning av selve designet gjøres av eier i PR-en.
