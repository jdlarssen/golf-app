# Fraunces-snitt for hullnummeret (#2385)

Designet tegner det store hullnummeret med Fraunces sin optiske størrelse lik
skriftstørrelsen (nettleserens `font-optical-sizing: auto`). Pakkesnittene fra
`@expo-google-fonts/fraunces` er tegnet for små størrelser (opsz 9), så «7» blir
flat og lav i kontrast. Disse to er laget av den variable Fraunces fra
google/fonts (`ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf`, OFL, se
`Fraunces-OFL.txt`), med bare sifrene 0–9:

- `FrauncesHole96.ttf`: opsz 96, wght 600, SOFT 0, WONK 1 (vanlig, 96 pt)
- `FrauncesHole132.ttf`: opsz 132, wght 600, SOFT 0, WONK 1 (sollys, 132 pt)

Laget med fontTools:

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

for opsz in (96, 132):
    inst = instantiateVariableFont(
        TTFont('Fraunces[SOFT,WONK,opsz,wght].ttf'),
        {'opsz': opsz, 'wght': 600, 'SOFT': 0, 'WONK': 1},
        inplace=False,
    )
    # Egne navn (FrauncesHole{opsz}, PostScript FrauncesHole{opsz}-SemiBold),
    # så iOS ikke blander dem med pakkens Fraunces SemiBold.
    ...
    opts = subset.Options(); opts.name_IDs = ['*']
    sub = subset.Subsetter(options=opts)
    sub.populate(text='0123456789')
    sub.subset(inst)
    inst.save(f'FrauncesHole{opsz}.ttf')
```
