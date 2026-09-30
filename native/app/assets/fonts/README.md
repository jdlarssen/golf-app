# Fraunces-snitt for hullnummeret (#2385)

Designet tegner det store hullnummeret med Fraunces sin optiske størrelse lik
skriftstørrelsen (nettleserens `font-optical-sizing: auto`). Pakkesnittene fra
`@expo-google-fonts/fraunces` er tegnet for små størrelser (opsz 9), så «7» blir
flat og bred. Disse to er laget av den variable Fraunces (OFL, se
`Fraunces-OFL.txt`), med bare sifrene 0–9:

- `FrauncesHole96.ttf`: opsz 96, wght 600, SOFT 0, WONK 1 (vanlig, 96 pt)
- `FrauncesHole132.ttf`: opsz 132, wght 600, SOFT 0, WONK 1 (sollys, 132 pt)

Kilden er låst til google/fonts `ac502d8e` (fonten sier `Version 1.000`), og
filene lages byte for byte likt med `make_hole_fonts.py` (fontTools 4.x):

```sh
curl -L -o Fraunces-VF.ttf "https://raw.githubusercontent.com/google/fonts/ac502d8eff76ef4d9477cdcc8ef7d0c84fde5372/ofl/fraunces/Fraunces%5BSOFT,WONK,opsz,wght%5D.ttf"
shasum -a 256 Fraunces-VF.ttf   # 177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb
python3 make_hole_fonts.py      # skriver FrauncesHole96.ttf og FrauncesHole132.ttf
```

Snittene har egne navn (`FrauncesHole96-SemiBold` og `FrauncesHole132-SemiBold`),
så iOS ikke blander dem med pakkens Fraunces SemiBold.
