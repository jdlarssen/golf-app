// #2252: toppen av hullsiden i appen, motstykket til webbens
// `components/hole/HoleHero.tsx` og headerraden over den (#2251).
//
// Headerraden har putte-bryteren til venstre og pokalen til høyre. Pokalen går
// til resultatlista, og sollys-bryteren står rett til venstre for den. Under
// står det store hullnummeret med «av 18», og par og indeks til høyre.
// Størrelsen på nummeret er temaets (`hole.numberSize`), så sollys kan gjøre
// det større uten at komponenten vet om det. Raden brytes når nummeret blir
// for bredt, og da legger par og indeks seg under.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PokalIcon } from '../icons/Icons';
import { FONTS, TAP, useTheme } from '../../theme';

export type HoleHeroProps = {
  holeNumber: number;
  totalHoles: number;
  par: number;
  strokeIndex: number;
  /** Putte-bryteren, når formatet fanger putter. */
  puttsToggle?: ReactNode;
  /** Står til venstre for pokalen: sollys-bryteren. */
  headerAccessory?: ReactNode;
  onLeaderboard: () => void;
};

export function HoleHero({
  holeNumber,
  totalHoles,
  par,
  strokeIndex,
  puttsToggle,
  headerAccessory,
  onLeaderboard,
}: HoleHeroProps) {
  const { colors, hole } = useTheme();
  return (
    <View style={styles.hero} testID="hole-hero">
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>{puttsToggle}</View>
        <View style={styles.headerRight}>
          {headerAccessory}
          <Pressable
            onPress={onLeaderboard}
            style={styles.iconButton}
            testID="hole-leaderboard"
            accessibilityRole="button"
            accessibilityLabel="Vis resultatene"
          >
            <PokalIcon color={colors.text} size={22} />
          </Pressable>
        </View>
      </View>

      <View style={styles.numberRow}>
        <View>
          <Text style={[styles.kicker, { color: colors.muted }]}>HULL</Text>
          <View style={styles.numberGroup}>
            <Text
              style={[
                styles.number,
                { color: colors.text, fontSize: hole.numberSize, lineHeight: hole.numberSize },
              ]}
              testID="hole-hero-number"
            >
              {holeNumber}
            </Text>
            <Text style={[styles.total, { color: colors.muted }]}>{`av ${totalHoles}`}</Text>
          </View>
        </View>
        <View style={styles.parColumn}>
          <Text style={[styles.par, { color: colors.text }]} testID="hole-hero-par">
            {`Par ${par}`}
          </Text>
          <Text style={[styles.index, { color: colors.muted }]} testID="hole-hero-index">
            {`indeks ${strokeIndex}`}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 4 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: TAP,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: {
    width: TAP,
    height: TAP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    columnGap: 12,
    rowGap: 4,
  },
  kicker: { fontSize: 11, fontFamily: FONTS.sansSemiBold, letterSpacing: 2.2 },
  numberGroup: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  number: {
    fontFamily: FONTS.serifScore,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  total: { fontSize: 15, fontFamily: FONTS.sansMedium, fontVariant: ['tabular-nums'] },
  parColumn: { alignItems: 'flex-end', paddingBottom: 2 },
  par: { fontSize: 20, fontFamily: FONTS.serifDisplay, fontVariant: ['tabular-nums'] },
  index: { fontSize: 13, fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
});
