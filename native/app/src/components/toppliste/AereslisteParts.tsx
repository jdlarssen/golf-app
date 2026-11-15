// #2894 PR 2: delene Æreslista er bygget av (designlerretet, `Deling-med-alle-2`, gruppe
// 12): skogkortet med det nyeste slaget, ett kort per år og skjelettet. Radene i årskortene
// er de samme som i kortet «Sjeldne slag» (`MomentRow`); skogflaten, flatene i
// skjelettet og meldingskortene er Topplista sine (`TopplisteParts`).
import { StyleSheet, Text, View } from 'react-native';
import type { AereslisteHeroModel, AereslisteYearModel } from '../../lib/aeresliste';
import { FONTS, fraunces, interLine, useTheme, withAlpha } from '../../theme';
import { MomentRow } from './TopplisteMoments';
import { Bone, CREAM, GOLD, GOLD_NUMBER } from './TopplisteParts';

function forestShadow(scheme: 'light' | 'dark'): string {
  return scheme === 'dark' ? '0 10px 24px rgba(0,0,0,0.4)' : '0 10px 24px rgba(26,46,31,0.16)';
}

/** Skogkortet øverst: «Nyeste hole-in-one», navnet, hull og bane med dato, og merket i en gullring. */
export function AereslisteHero({ hero }: { hero: AereslisteHeroModel }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={hero.spoken}
      style={[styles.hero, { backgroundColor: colors.surfaceStrong, boxShadow: forestShadow(scheme) }]}
      testID="aeresliste-hero"
    >
      <View style={styles.flex} importantForAccessibility="no-hide-descendants">
        <Text numberOfLines={1} style={styles.heroLabel}>
          {hero.label}
        </Text>
        <Text numberOfLines={1} style={[styles.heroName, { color: colors.onStrongWarm }]}>
          {hero.name}
        </Text>
        <Text numberOfLines={1} style={[styles.heroLine, { color: withAlpha(CREAM, 0.85) }]}>
          {hero.line}
        </Text>
      </View>
      <View style={styles.heroRing} importantForAccessibility="no-hide-descendants">
        <Text style={styles.heroMark}>{hero.mark}</Text>
      </View>
    </View>
  );
}

/** Ett år: årstallet med tellingen til høyre, og radene i et kort. */
export function AereslisteYear({ year }: { year: AereslisteYearModel }) {
  const { colors } = useTheme();
  return (
    <View testID={`aeresliste-year-${year.year}`}>
      <View style={styles.yearHead}>
        <Text accessibilityRole="header" style={[styles.year, { color: colors.text }]}>
          {year.year}
        </Text>
        <Text numberOfLines={1} style={[styles.yearCount, { color: colors.muted }]} testID={`aeresliste-count-${year.year}`}>
          {year.count}
        </Text>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {year.rows.map((row, index) => (
          <MomentRow
            key={`${row.shot}-${row.name}-${row.date}-${index}`}
            row={row}
            last={index === year.rows.length - 1}
            testID={`aeresliste-row-${year.year}-${index}`}
          />
        ))}
      </View>
    </View>
  );
}

const SKELETON_YEARS = [
  [120, 98, 132],
  [120, 98],
] as const;

/** Siden mens lista hentes: skogkortet og to år som flater, skjult for skjermleseren. */
export function AereslisteSkeleton() {
  const { colors, scheme } = useTheme();
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden testID="aeresliste-skeleton">
      <View style={[styles.hero, { backgroundColor: colors.surfaceStrong, boxShadow: forestShadow(scheme) }]}>
        <View style={styles.flex}>
          <View style={styles.boneLine15}>
            <Bone width={94} height={10} tone="forest" />
          </View>
          <View style={styles.boneLine30}>
            <Bone width={122} height={17} tone="forest" />
          </View>
          <View style={styles.boneLine18}>
            <Bone width={142} height={10} tone="forest" />
          </View>
        </View>
        <Bone width={56} height={56} tone="forest" />
      </View>
      {SKELETON_YEARS.map((rows, yearIndex) => (
        <View key={yearIndex}>
          <View style={styles.yearHead}>
            <View style={styles.boneLine25}>
              <Bone width={50} height={15} radius={6} />
            </View>
          </View>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {rows.map((nameWidth, index) => (
              <View
                key={index}
                style={[
                  styles.boneRow,
                  index < rows.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.divider } : null,
                ]}
              >
                <Bone width={40} height={40} />
                <View style={styles.boneText}>
                  <Bone width={nameWidth - (index % 2) * 20} height={11} />
                  <Bone width={142} height={9} />
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flexGrow: 1, flexShrink: 1, minWidth: 0 },

  // Som lederkortet på Topplista: radius 20 og skygge, merket i en gullring på 56.
  hero: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroLabel: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold, color: GOLD },
  heroName: fraunces(600, 24, 30),
  heroLine: { ...interLine(13, 16), marginTop: 2, fontVariant: ['tabular-nums'] },
  heroRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: GOLD,
    backgroundColor: withAlpha(CREAM, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroMark: { ...fraunces(600, 26), color: GOLD_NUMBER, fontVariant: ['tabular-nums'] },

  // Årstallet står 20 inn, som tittelen; kortet 16 fra kanten, som kortene på Topplista.
  yearHead: {
    marginTop: 24,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  year: { ...fraunces(600, 20, 25), fontVariant: ['tabular-nums'] },
  yearCount: { ...interLine(13, 16), marginLeft: 'auto', flexShrink: 1, fontVariant: ['tabular-nums'] },
  card: { marginHorizontal: 16, marginTop: 10, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },

  boneRow: { minHeight: 60, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  boneText: { gap: 10 },
  boneLine15: { height: 15, justifyContent: 'center' },
  boneLine18: { height: 18, justifyContent: 'center' },
  boneLine25: { height: 25, justifyContent: 'center' },
  boneLine30: { height: 30, justifyContent: 'center' },
});
