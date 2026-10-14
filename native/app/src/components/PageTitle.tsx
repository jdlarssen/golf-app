// #2256: den store sidetittelen fra designlerretet — «Venner», «Varsler» og
// scorekortets spillnavn i Fraunces øverst i innholdet, med en undertekst når
// siden har det. Profilen har sin egen tittelrad med «Rediger» (Profil v2).
//
// Toppen over (tilbake-pila og det lille sperrede ordet) er navigatorens
// header (`kickerHeader`, fra #2255). Tittelen står i innholdet, som i
// designet, og ruller med siden.
//
// `size` (#2385): scorekortets artboard har en mindre tittel (26 pt) og
// undertekst (12 pt) enn profil-rommene, i flukt med tekstkolonnen (20 pt fra
// kanten, uten de 4 pt profilen har inn). «Varsler» har 28 pt (Profil v2).
// «Avslutt runden» (#2578) har 28/14 på lista og 30/15 på bekreft-siden, også
// i flukt med tekstkolonnen. Samme komponent, fem størrelser.
import { StyleSheet, Text, View } from 'react-native';
import { FONTS, fraunces, interLine, useTheme } from '../theme';

export function PageTitle({
  title,
  subtitle,
  subtitleTestID,
  size = 'large',
}: {
  title: string;
  subtitle?: string;
  subtitleTestID?: string;
  /**
   * `large`: 30/13 pt («Venner»). `settings`: 28/13 pt («Varsler»,
   * Profil v2). `medium`: 26/12 pt (scorekortet). `endList`: 28/14 pt og
   * `endConfirm`: 30/15 pt («Avslutt runden» og «Avslutt runden?», #2578).
   */
  size?: 'large' | 'settings' | 'medium' | 'endList' | 'endConfirm';
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.block, size !== 'large' && size !== 'settings' && styles.blockMedium]}>
      <View style={styles.row}>
        <Text
          accessibilityRole="header"
          style={[
            styles.title,
            size === 'medium' && styles.titleMedium,
            size === 'settings' && styles.titleSettings,
            size === 'endList' && styles.titleEndList,
            size === 'endConfirm' && styles.titleEndConfirm,
            { color: colors.text },
          ]}
        >
          {title}
        </Text>
      </View>
      {subtitle ? (
        <Text
          style={[
            styles.subtitle,
            size === 'medium' && styles.subtitleMedium,
            size === 'endList' && styles.subtitleEndList,
            size === 'endConfirm' && styles.subtitleEndConfirm,
            { color: colors.muted },
          ]}
          testID={subtitleTestID}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const SUBTITLE = interLine(13, 16, { multiline: true });
const SUBTITLE_MEDIUM = interLine(12, 15, { multiline: true });
// «Avslutt runden» (#2578): 14 pt med `normal` (17) og 2 pt over; bekreft-siden
// har 15 pt med linjehøyde 1,45 og 6 pt over.
const SUBTITLE_END_LIST = interLine(14, 17, { multiline: true });
const SUBTITLE_END_CONFIRM = interLine(15, 21.75, { multiline: true });

const styles = StyleSheet.create({
  block: { paddingHorizontal: 4 },
  blockMedium: { paddingHorizontal: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  // Designet har `line-height: normal`, som nettleseren regner som avrundet
  // ascent pluss avrundet descent: 37 for Fraunces 30, 32 for 26 og 34 for 28.
  title: { ...fraunces(500, 30, 37, { multiline: true }), flexShrink: 1 },
  // Underteksten har nettleserens `normal` for Inter (13 pt: 16, 12 pt: 15) og
  // 2 pt over, som i designet.
  subtitle: { ...SUBTITLE, fontFamily: FONTS.sans, marginTop: 2 + SUBTITLE.marginTop },
  titleMedium: { ...fraunces(500, 26, 32, { multiline: true }) },
  subtitleMedium: { ...SUBTITLE_MEDIUM, marginTop: 2 + SUBTITLE_MEDIUM.marginTop },
  titleSettings: { ...fraunces(500, 28, 34, { multiline: true }) },
  // Tegningen har `line-height: 1.2` her: 33,6 og 36.
  titleEndList: { ...fraunces(500, 28, 33.6, { multiline: true }) },
  titleEndConfirm: { ...fraunces(500, 30, 36, { multiline: true }) },
  subtitleEndList: { ...SUBTITLE_END_LIST, marginTop: 2 + SUBTITLE_END_LIST.marginTop },
  subtitleEndConfirm: { ...SUBTITLE_END_CONFIRM, marginTop: 6 + SUBTITLE_END_CONFIRM.marginTop },
});
