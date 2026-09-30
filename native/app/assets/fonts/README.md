# Appens Fraunces-snitt (#2385)

Designet tegner Fraunces med optisk størrelse lik skriftstørrelsen
(nettleserens `font-optical-sizing: auto`). Pakkesnittene fra
`@expo-google-fonts/fraunces` er tegnet for én størrelse, og React Native har
ingen `fontVariationSettings`. Derfor har appen ett statisk snitt per vekt og
størrelse den bruker, laget av den variable Fraunces (OFL, se
`Fraunces-OFL.txt`) med `opsz` lik størrelsen, `SOFT` 0 og `WONK` 1:

- `Fraunces500O{størrelse}.ttf` og `Fraunces600O{størrelse}.ttf`: teksten.
  Størrelsene står i `fraunces-sizes.json`, som appen også leser
  (`fraunces()` i `src/theme.ts`). Snittene har alle tegnene fonten har (624,
  som pakkens snitt), så et navn aldri mister Fraunces på grunn av en
  diakritisk bokstav.
- `FrauncesHole96.ttf` og `FrauncesHole132.ttf`: hullnummeret, 96 og 132 pt i
  vekt 600, med bare sifrene 0–9.

Kilden er låst til google/fonts `ac502d8e` (fonten sier `Version 1.000`), og
filene lages byte for byte likt med `make_fraunces_fonts.py` (fontTools 4.x):

```sh
curl -L -o Fraunces-VF.ttf "https://raw.githubusercontent.com/google/fonts/ac502d8eff76ef4d9477cdcc8ef7d0c84fde5372/ofl/fraunces/Fraunces%5BSOFT,WONK,opsz,wght%5D.ttf"
shasum -a 256 Fraunces-VF.ttf   # 177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb
python3 make_fraunces_fonts.py  # skriver alle snittene
rm Fraunces-VF.ttf
```

Ny størrelse: legg den i `fraunces-sizes.json`, kjør skriptet, og legg fila
inn i `src/fonts.ts`. `theme.test.ts` feiler hvis de tre ikke stemmer.

Hvert snitt har eget familienavn (`Fraunces500O28`, PostScript
`Fraunces500O28-Medium`), så iOS ikke blander dem med hverandre.
