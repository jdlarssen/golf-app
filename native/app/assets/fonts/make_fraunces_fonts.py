# Lager appens Fraunces-snitt (#2385) fra den variable fonten. Kjør med
# fontTools 4.66.1 (`pip install fonttools==4.66.1`), som filene er sjekket med:
#   curl -L -o Fraunces-VF.ttf https://raw.githubusercontent.com/google/fonts/ac502d8eff76ef4d9477cdcc8ef7d0c84fde5372/ofl/fraunces/Fraunces%5BSOFT,WONK,opsz,wght%5D.ttf
#   shasum -a 256 Fraunces-VF.ttf  # 177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb
#   curl -L -o Fraunces-Italic-VF.ttf https://raw.githubusercontent.com/google/fonts/ac502d8eff76ef4d9477cdcc8ef7d0c84fde5372/ofl/fraunces/Fraunces-Italic%5BSOFT,WONK,opsz,wght%5D.ttf
#   shasum -a 256 Fraunces-Italic-VF.ttf  # b24448c43702fac4ee856781d461a0dfba8d8e594b6e8e190234b75fed2c0e01
#   python3 make_fraunces_fonts.py
#
# Nettleseren tegner Fraunces med optisk størrelse lik skriftstørrelsen
# (`font-optical-sizing: auto`). React Native har ingen `fontVariationSettings`,
# så appen får ett statisk snitt per vekt og størrelse den bruker, med
# `opsz` lik størrelsen. Størrelsene står i `fraunces-sizes.json`, som appen
# også leser (`fraunces()` i `src/theme.ts`).
#
# To slags snitt:
#  - Tekst (`Fraunces{vekt}O{størrelse}.ttf`): alle tegnene fonten har, som
#    pakkens snitt, så et navn aldri mister Fraunces på grunn av en diakritisk
#    bokstav.
#  - Hullnummeret (`FrauncesHole96.ttf`, `FrauncesHole132.ttf`): bare sifre,
#    96 og 132 pt i vekt 600.
#  - Kursiv (`FrauncesItalic500O{størrelse}.ttf`, #2756): gullordet i
#    resultatsetningen (36) og på resultatkortet (14, Satoris standardsnitt).
#
# Hvert snitt har eget familienavn, så iOS ikke blander dem. Filene blir like
# byte for byte hver gang (kildens tidsstempel).
import json

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

SOURCE = 'Fraunces-VF.ttf'
SOURCE_ITALIC = 'Fraunces-Italic-VF.ttf'
MODIFIED = TTFont(SOURCE)['head'].modified
STYLE = {400: 'Regular', 500: 'Medium', 600: 'SemiBold'}


def cut(opsz, weight, family, text=None, source=SOURCE):
    inst = instantiateVariableFont(
        TTFont(source),
        {'opsz': opsz, 'wght': weight, 'SOFT': 0, 'WONK': 1},
        inplace=False,
    )
    style = STYLE[weight]
    postscript = f'{family}-{style}'
    for rec in inst['name'].names:
        if rec.nameID in (1, 16):
            rec.string = family
        elif rec.nameID == 2:
            rec.string = 'Regular'
        elif rec.nameID == 17:
            rec.string = style
        elif rec.nameID == 4:
            rec.string = f'{family} {style}'
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
    if text is None:
        sub.populate(unicodes=TTFont(source).getBestCmap().keys())
    else:
        sub.populate(text=text)
    sub.subset(inst)
    inst.recalcTimestamp = False
    inst['head'].modified = MODIFIED
    inst.save(f'{family}.ttf')


for opsz in (96, 132):
    cut(opsz, 600, f'FrauncesHole{opsz}', text='0123456789')

with open('fraunces-sizes.json') as f:
    SIZES = json.load(f)
for weight, sizes in SIZES.items():
    for size in sizes:
        cut(size, int(weight), f'Fraunces{weight}O{size}')

for size in (14, 36):
    cut(size, 500, f'FrauncesItalic500O{size}', source=SOURCE_ITALIC)
