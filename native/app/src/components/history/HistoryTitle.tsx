// #2265: tittelen øverst i Rundedagboka og statistikken, som designlerretet
// (`Historikk-forslag`): Fraunces 30/500 med undertittelen i Inter 13 og 2 pt
// luft, blokka 6 pt under toppen og 20 pt fra kanten.
//
// Ikke `PageTitle`: den har faste linjehøyder (35/18) målt mot andre
// artboard. Her står linjene i nettleserens `normal`, som designet: Fraunces
// 30 har samme høyde i begge (37 pt), og Inter 13 får nettleserens 16 pt
// (`interLine`).
import { StyleSheet, Text, View } from 'react-native';
import { FONTS, interLine, useTheme } from '../../theme';

export function HistoryTitle({
  title,
  subtitle,
  subtitleTestID,
}: {
  title: string;
  /** `' '` holder plassen mens tallet lastes. */
  subtitle?: string;
  subtitleTestID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.block}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.muted }]} testID={subtitleTestID}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingTop: 6, paddingHorizontal: 20 },
  title: { fontSize: 30, fontFamily: FONTS.serifDisplay },
  subtitle: { ...interLine(13, 16), fontFamily: FONTS.sans, marginTop: 2 },
});
