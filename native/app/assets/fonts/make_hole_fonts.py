# Lager hullnummerets Fraunces-snitt (#2385). Kjør med fontTools 4.x:
#   curl -L -o Fraunces-VF.ttf https://raw.githubusercontent.com/google/fonts/ac502d8eff76ef4d9477cdcc8ef7d0c84fde5372/ofl/fraunces/Fraunces%5BSOFT,WONK,opsz,wght%5D.ttf
#   shasum -a 256 Fraunces-VF.ttf  # 177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb
#   python3 make_hole_fonts.py
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

SOURCE = TTFont('Fraunces-VF.ttf')

for opsz in (96, 132):
    inst = instantiateVariableFont(
        TTFont('Fraunces-VF.ttf'),
        {'opsz': opsz, 'wght': 600, 'SOFT': 0, 'WONK': 1},
        inplace=False,
    )
    family = f'FrauncesHole{opsz}'
    postscript = f'{family}-SemiBold'
    # Egne navn, så iOS ikke blander dem med pakkens Fraunces SemiBold.
    for rec in inst['name'].names:
        if rec.nameID in (1, 16):
            rec.string = family
        elif rec.nameID == 2:
            rec.string = 'Regular'
        elif rec.nameID == 17:
            rec.string = 'SemiBold'
        elif rec.nameID == 4:
            rec.string = f'{family} SemiBold'
        elif rec.nameID == 6:
            rec.string = postscript
        elif rec.nameID == 3:
            rec.string = f'{postscript};2385'
    opts = subset.Options()
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True
    opts.layout_features = ['*']
    sub = subset.Subsetter(options=opts)
    sub.populate(text='0123456789')
    sub.subset(inst)
    # Kildens tidsstempel, så filene blir like byte for byte hver gang.
    inst.recalcTimestamp = False
    inst['head'].modified = SOURCE['head'].modified
    inst.save(f'{family}.ttf')
