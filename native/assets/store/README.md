# Butikkbildene for 1.2.0 (#2561, E7)

Bildene eieren laster opp i App Store Connect og Play Console. Kravene og tekstene står i
[`docs/native/app-store-metadata.md`](../../../docs/native/app-store-metadata.md) «Skjermbilder» og
[`docs/native/play-store-metadata.md`](../../../docs/native/play-store-metadata.md) «Skjermbilder og
feature-grafikk». Klikkstiene står under «Opplasting» nederst.

| Fil eller mappe | Hvor den lastes opp | Størrelse og format |
|---|---|---|
| `ios-6.9-1320x2868/` | App Store Connect, iPhone 6,9" («iPhone with Dynamic Island (large display)») | 8 bilder, 1320 × 2868, PNG uten alfakanal |
| `ios-6.3-1206x2622/` | App Store Connect, iPhone 6,3" («iPhone with Dynamic Island (medium display)», påkrevd) | 8 bilder, 1206 × 2622, PNG uten alfakanal |
| `android-1080x1920/` | Play Console, telefonskjermbilder | 8 bilder, 1080 × 1920 (9:16), PNG uten alfakanal |
| `play-feature-graphic-1024x500.png` | Play Console, feature-grafikk | 1024 × 500, PNG uten alfakanal |
| [`../../android/store_icon.png`](../../android/store_icon.png) | Play Console, app-ikon | 512 × 512, PNG med alfakanal (laget av `generate-icons.mjs`) |

Bildene lastes opp i rekkefølgen filnavnene har:

| Nr. | Skjerm | Alt-tekst (Play, maks 140 tegn) |
|---|---|---|
| 01 | Hjem | Hjem-siden med runden som pågår, neste start og forrige runde |
| 02 | Hullet | Hull 12 med slagene til flighten og tastaturet for neste spiller |
| 03 | Tavla | Tavla mens turneringen pågår, med alle tolv spillerne |
| 04 | Utslaget | Texas scramble: laget taster scoren og velger hvem sitt utslag de brukte |
| 05 | Runden er ferdig | Runden er ferdig: poeng, birdier, plassering og dagens beste hull |
| 06 | Godkjenning | Tre kort venter: godkjenn kortet til en makker, eller send det tilbake |
| 07 | Resultat | Sluttresultatet med alle tolv spillerne og vinneren øverst |
| 08 | Lagtavla | Lagtavla med seks lag og vinnerlaget øverst |
| Feature-grafikk | Ordmerket og slagordet | Tørny. Fyr opp golfturneringen på et par minutter |

## Slik ble de laget

- **Koden:** `main` på `69a2d2dae`, samme kilde som bygget 1.2.0 (4) i TestFlight. Appen kjørte
  som Debug-bygg med JavaScript fra Metro, i en iPhone 17 Pro Max-simulator (iOS 26.5) og i
  Android-emulatoren `torny_api36` (Pixel 7-profil, API 36) med skjermen satt til 1080 × 1920.
- **Dataene:** en midlertidig probe byttet bare `native/app/src/supabase.ts` mot en lokal fikstur.
  Alt annet i appen var ekte: hjem-lista, spillhentingen, den lokale basen, poengutregningen og
  tavlene. Spillerne er 18 oppdiktede personer med korte fornavn og genererte id-er, så navn i
  smale felt («Lag 1 · Ari, Bo, Una») får plass. Banen (Byneset North: hull, par, indeks og slope
  for herrer) er lest fra staging. Tee-navnet «Gul» og slope og CR for damer er satt i fiksturen.
  Ingenting ble skrevet til staging eller prod, og ingen e-postadresse vises. Proben og fiksturen
  er ikke committet.
- **Tilstandene:** hver skjerm er en ekte apptilstand, sett av den spilleren som har den. Tor er
  midt i runden (Hjem, hullet, tavla, resultatet og lagtavla). Eva er ferdig og har tre kort å
  godkjenne (runden er ferdig, godkjenning). Ari spiller Texas scramble (utslaget). På tavla og
  resultatet trykket proben appens egen «Vis alle 12 spillere». På Android har fiksturen ett
  pågående spill mindre, så Hjem viser ikke «Flere runder i gang», og «Forrige runde» får plass
  på den lavere 9:16-skjermen.
- **Statuslinja:** klokka står på 15:41, i tråd med «God dag» på Hjem. iOS brukte
  `simctl status_bar`, og Android brukte demomodus uten varselikoner.
- **Etterbehandling:** alle bildene er flatet til RGB uten alfakanal. 6,3"-settet er det samme
  som 6,9"-settet, skalert likt i begge retninger (faktor 0,9142) og beskåret 1 px i bredden.
- **Feature-grafikken:** `node native/assets/store/generate-feature-graphic.mjs` lager den på nytt
  fra ordmerke-masteren. Skriptet feiler hvis størrelsen er feil, hvis bildet har alfakanal eller
  hvis Fraunces ikke lastet.

## Opplasting

Eieren laster opp, sammen med orkestratoren. Navnene på feltene sjekker orkestratoren i
konsollen først.

**App Store Connect** (versjon 1.2.0, «Prepare for Submission»): Apps → Tørny → 1.2.0 →
**Previews and Screenshots** → iPhone.

1. En ny versjon arver bildene fra forrige versjon, og grensen er 10 per felt. Slett derfor
   de gamle bildene fra 1.1.0 i hvert iPhone-felt først, også i 6,5"-feltet. Med 6,9"-bildene
   på plass skalerer Apple dem til 6,5" selv.
2. Dra de åtte bildene fra `ios-6.9-1320x2868/` inn i 6,9"-feltet, i rekkefølge 01 til 08.
3. Dra de åtte bildene fra `ios-6.3-1206x2622/` inn i 6,3"-feltet, i samme rekkefølge.
4. Trykk **Save**. Du skal se åtte bilder i hvert felt og ingen melding om feil størrelse.

**Play Console:** Tørny → Grow users → Store presence → **Main store listing** → Graphics.

1. App icon: `native/android/store_icon.png`.
2. Feature graphic: `play-feature-graphic-1024x500.png`.
3. Phone screenshots: de åtte bildene fra `android-1080x1920/`, i rekkefølge 01 til 08.
   Ber konsollen om alt-tekst, bruk tabellen over.
4. Trykk **Save**. Du skal se «Saved», og meldingen om at grafikken mangler er borte.
