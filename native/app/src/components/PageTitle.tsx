// #2256: den store sidetittelen fra designlerretet — «Profil», «Venner» og
// «Varsler og tema» i Fraunces øverst i innholdet, med en undertekst og en
// knapp til høyre når siden har det.
//
// Toppen over (tilbake-pila og det lille sperrede ordet) er navigatorens
// header (`kickerHeader` i `components/KickerHeader.tsx`, fra #2255). Tittelen står i
// innholdet, som i designet, og ruller med siden.
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FONTS, useTheme } from '../theme';

export function PageTitle({
  title,
  subtitle,
  right,
  subtitleTestID,
}: {
  title: string;
  subtitle?: string;
  /** Knappen til høyre for tittelen, som «Rediger» i profilen. */
  right?: ReactNode;
  subtitleTestID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>
        {right}
      </View>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.muted }]} testID={subtitleTestID}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  // Samme snitt og størrelse som tittelen på startbilletten (#2255).
  title: { flexShrink: 1, fontSize: 30, lineHeight: 35, fontFamily: FONTS.serifDisplay },
  subtitle: { fontSize: 13, lineHeight: 18, fontFamily: FONTS.sans, marginTop: 2 },
});
