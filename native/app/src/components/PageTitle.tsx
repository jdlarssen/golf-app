// #2256: den store sidetittelen fra designlerretet — «Profil», «Venner» og
// «Varsler og tema» i Fraunces øverst i innholdet, med en undertekst og en
// knapp til høyre når siden har det.
//
// Toppen over (tilbake-pila og det lille sperrede ordet) er navigatorens
// header (`kickerHeader`, fra #2255). Tittelen står i innholdet, som i
// designet, og ruller med siden.
//
// `size` (#2385): scorekortets artboard har en mindre tittel (26 pt) og
// undertekst (12 pt) enn profil-rommene, i flukt med tekstkolonnen (20 pt fra
// kanten, uten de 4 pt profilen har inn). «Varsler» har 28 pt (Profil v2).
// Samme komponent, tre størrelser.
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FONTS, useTheme } from '../theme';

export function PageTitle({
  title,
  subtitle,
  right,
  subtitleTestID,
  size = 'large',
}: {
  title: string;
  subtitle?: string;
  /** Knappen til høyre for tittelen, som «Rediger» i profilen. */
  right?: ReactNode;
  subtitleTestID?: string;
  /**
   * `large`: 30/13 pt (venner, billetten). `settings`: 28/13 pt («Varsler»,
   * Profil v2). `medium`: 26/12 pt (scorekortet).
   */
  size?: 'large' | 'settings' | 'medium';
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.block, size === 'medium' && styles.blockMedium]}>
      <View style={styles.row}>
        <Text
          accessibilityRole="header"
          style={[
            styles.title,
            size === 'medium' && styles.titleMedium,
            size === 'settings' && styles.titleSettings,
            { color: colors.text },
          ]}
        >
          {title}
        </Text>
        {right}
      </View>
      {subtitle ? (
        <Text
          style={[styles.subtitle, size === 'medium' && styles.subtitleMedium, { color: colors.muted }]}
          testID={subtitleTestID}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: 4 },
  blockMedium: { paddingHorizontal: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  // Samme snitt og størrelse som tittelen på startbilletten (#2255).
  title: { flexShrink: 1, fontSize: 30, lineHeight: 35, fontFamily: FONTS.serifDisplay },
  subtitle: { fontSize: 13, lineHeight: 18, fontFamily: FONTS.sans, marginTop: 2 },
  titleMedium: { fontSize: 26, lineHeight: 31 },
  subtitleMedium: { fontSize: 12, lineHeight: 16 },
  titleSettings: { fontSize: 28, lineHeight: 34 },
});
