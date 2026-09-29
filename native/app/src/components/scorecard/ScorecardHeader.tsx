// #2262: hodet på scorekortet — hvem sitt kort det er, spillnavnet, og linja
// «Byneset · Gul tee (dame) · Stableford · banehandicap 15» fra
// `scorecardHeaderLine`.
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';

export function ScorecardHeader({
  kicker,
  title,
  line,
}: {
  kicker: string;
  title: string;
  line: string;
}) {
  const { ui } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[ui.sectionTitle, styles.kicker]} testID="scorecard-kicker">
        {kicker}
      </Text>
      <Text style={ui.title} accessibilityRole="header">
        {title}
      </Text>
      {line ? (
        <Text style={ui.muted} testID="scorecard-header-line">
          {line}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  kicker: { marginTop: 0 },
});
