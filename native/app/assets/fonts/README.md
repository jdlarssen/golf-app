# Appens Fraunces-snitt (#2385)

Designet tegner Fraunces med optisk størrelse lik skriftstørrelsen
(nettleserens `font-optical-sizing: auto`). Pakkesnittene fra
`@expo-google-fonts/fraunces` er tegnet for én størrelse, og React Native har
ingen `fontVariationSettings`. Derfor har appen ett statisk snitt per vekt og
størrelse den bruker, laget av den variable Fraunces (OFL, se
`Fraunces-OFL.txt`) med `opsz` lik størrelsen, `SOFT` 0 og `WONK` 1:

- `Fraunces400O{størrelse}.ttf`, `Fraunces500O{størrelse}.ttf` og
  `Fraunces600O{størrelse}.ttf`: teksten. Vekt 400 er webbens `font-serif` uten
  vekt (Kavalkaden, #2265).
  Størrelsene står i `fraunces-sizes.json`, som appen også leser
  (`fraunces()` i `src/theme.ts`). Snittene har alle tegnene fonten har (624,
  som pakkens snitt), så et navn aldri mister Fraunces på grunn av en
  diakritisk bokstav.
- `FrauncesHole96.ttf` og `FrauncesHole132.ttf`: hullnummeret, 96 og 132 pt i
  vekt 600, med bare sifrene 0–9.

- `FrauncesItalic500O36.ttf` og `FrauncesItalic500O14.ttf` (#2756): gullordet i
  resultatsetningen på tavla (36) og på resultatkortet (14, som Satoris
  standardsnitt). Kilden er den kursive variable Fraunces fra samme commit.

Kilden er låst til google/fonts `ac502d8e` (fonten sier `Version 1.000`), og
filene lages byte for byte likt med `make_fraunces_fonts.py` og fontTools
4.66.1 (`pip install fonttools==4.66.1`):

```sh
curl -L -o Fraunces-VF.ttf "https://raw.githubusercontent.com/google/fonts/ac502d8eff76ef4d9477cdcc8ef7d0c84fde5372/ofl/fraunces/Fraunces%5BSOFT,WONK,opsz,wght%5D.ttf"
shasum -a 256 Fraunces-VF.ttf   # 177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb
curl -L -o Fraunces-Italic-VF.ttf "https://raw.githubusercontent.com/google/fonts/ac502d8eff76ef4d9477cdcc8ef7d0c84fde5372/ofl/fraunces/Fraunces-Italic%5BSOFT,WONK,opsz,wght%5D.ttf"
shasum -a 256 Fraunces-Italic-VF.ttf   # b24448c43702fac4ee856781d461a0dfba8d8e594b6e8e190234b75fed2c0e01
python3 make_fraunces_fonts.py  # skriver alle snittene
rm Fraunces-VF.ttf Fraunces-Italic-VF.ttf
```

Ny størrelse: legg den i `fraunces-sizes.json`, kjør skriptet, og legg fila
inn i `src/fonts.ts`. `theme.test.ts` feiler hvis de tre ikke stemmer.

Hvert snitt har eget familienavn (`Fraunces500O28`, PostScript
`Fraunces500O28-Medium`), så iOS ikke blander dem med hverandre.
