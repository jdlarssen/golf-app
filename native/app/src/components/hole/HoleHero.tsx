// #2252: toppen av hullsiden i appen, motstykket til webbens
// `components/hole/HoleHero.tsx` (#2251).
//
// #2385 la den på designlerretet, identisk:
// - **Vanlig** (`Main`): «HULL» i gull over nummeret på 96 pt i skoggrønt
//   (linje 0,9, tett sperret), «av 18» ved siden av, og «Par 4» med «Indeks 11»
//   under til høyre, nede på linje med foten av nummeret. En tynn strek under.
// - **Sollys** (`Hull-sollys`): «HULL» fet og svart, nummeret på 132 pt i svart
//   (linje 0,85), «Par 4» på 44 pt og «Indeks 11» under, uten «av 18». En
//   svart strek på 3 pt under.
// Avstand til green og hullets lengde står ikke her ennå (eierens svar:
// senere, og ingen lengde). Pokalen og sollys-bryteren står i toppen
// (`Hole.tsx`). Størrelsen på nummeret er temaets (`hole.numberSize`).
import { StyleSheet, Text, View } from 'react-native';
import { FONTS, frauncesLine, useTheme } from '../../theme';

export type HoleHeroProps = {
  holeNumber: number;
  totalHoles: number;
  par: number;
  strokeIndex: number;
  /** Hull-sollys-artboardets variant. */
  sunlight?: boolean;
};

export function HoleHero({ holeNumber, totalHoles, par, strokeIndex, sunlight = false }: HoleHeroProps) {
  const { colors, hole } = useTheme();
  const size = hole.numberSize;
  // Designets tette sperring (−0,02 em, −0,03 i sollys). Den gjør tekstboksen
  // smalere enn glyfen, og iOS klipper ved kanten; like mye luft til høyre og
  // negativ marg gir samme plass i raden uten at «7»-streken kuttes.
  const tracking = size * (sunlight ? 0.03 : 0.02);
  const number = (
    <Text
      style={[
        {
          fontFamily: sunlight ? FONTS.holeNumberSun : FONTS.holeNumber,
          color: sunlight ? colors.text : colors.primary,
          letterSpacing: -tracking,
          paddingRight: tracking,
          marginRight: -tracking,
        },
        frauncesLine(size, size * (sunlight ? 0.85 : 0.9)),
      ]}
      testID="hole-hero-number"
    >
      {holeNumber}
    </Text>
  );
  return (
    <View
      style={[
        styles.row,
        sunlight ? styles.rowSun : styles.rowNormal,
        { borderBottomColor: colors.border, borderBottomWidth: hole.borderW },
      ]}
      testID="hole-hero"
    >
      {sunlight ? (
        <View>
          <Text style={[styles.kickerSun, { color: colors.text }]}>HULL</Text>
          {number}
        </View>
      ) : (
        <View style={styles.numberGroup}>
          <View>
            <Text style={[styles.kicker, { color: colors.accentText }]}>HULL</Text>
            {number}
          </View>
          <Text style={[styles.total, { color: colors.muted }]}>{`av ${totalHoles}`}</Text>
        </View>
      )}
      <View style={styles.parColumn}>
        <Text
          style={[sunlight ? styles.parSun : styles.par, { color: colors.text }]}
          testID="hole-hero-par"
        >
          {`Par ${par}`}
        </Text>
        <Text
          style={[sunlight ? styles.indexSun : styles.index, { color: sunlight ? colors.text : colors.muted }]}
          testID="hole-hero-index"
        >
          {`Indeks ${strokeIndex}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  rowNormal: { paddingTop: 10, paddingHorizontal: 20, paddingBottom: 16 },
  rowSun: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 18 },
  kicker: { fontSize: 10, fontFamily: FONTS.sansSemiBold, letterSpacing: 2 },
  kickerSun: { fontSize: 13, fontFamily: FONTS.sansBold, letterSpacing: 2.08 },
  numberGroup: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  // Designet bruker proporsjonale tall i «av 18» og «Indeks 11».
  total: { fontSize: 13, fontFamily: FONTS.sans, paddingBottom: 8 },
  parColumn: { alignItems: 'flex-end', paddingBottom: 6 },
  par: { ...frauncesLine(30, 30), fontFamily: FONTS.serifDisplay },
  parSun: { ...frauncesLine(44, 44), fontFamily: FONTS.serifScore },
  index: { fontSize: 12, fontFamily: FONTS.sans, marginTop: 4 },
  indexSun: { fontSize: 15, fontFamily: FONTS.sansMedium, marginTop: 8 },
});
