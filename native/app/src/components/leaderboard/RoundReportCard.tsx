// #2632: hele historien fra pressetribunen, nederst på den ferdige tavla
// (`Retning-B-sitat-lys` / `-natt`). Teksten vises ordrett, avsnitt for
// avsnitt (webbens `RoundReportCard` gjør det samme), også første setning som
// alt står som sitat i båndet. AI-linja under er ærlig om hvem som skrev den.
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { ROUND_REPORT_APP_TEXT, ROUND_REPORT_TEXT } from '../../lib/boardCopy';
import { FONTS, fraunces, interLine, useTheme } from '../../theme';

/** Avsnittene i teksten (skilt med linjeskift); tomme linjer faller bort. */
export function reportParagraphs(report: string): string[] {
  return report
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function RoundReportCard({
  report,
  onLayout,
  horizontalMargin = 12,
}: {
  report: string;
  /** Skjermen leser kortets y herfra, så lenka under sitatet kan rulle hit. */
  onLayout?: (event: LayoutChangeEvent) => void;
  /** 12 pt under tavla, 16 under lagtavla, og 20 på skjermer uten egen tavle. */
  horizontalMargin?: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          marginHorizontal: horizontalMargin,
        },
      ]}
      onLayout={onLayout}
      testID="round-report"
    >
      <Text style={[styles.heading, { color: colors.text }]} accessibilityRole="header">
        {ROUND_REPORT_TEXT.heading}
      </Text>
      {reportParagraphs(report).map((paragraph, index) => (
        <Text key={index} style={[styles.paragraph, { color: colors.text }]}>
          {paragraph}
        </Text>
      ))}
      <Text style={[styles.aiNote, { color: colors.muted }]}>{ROUND_REPORT_APP_TEXT.aiNote}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 10,
  },
  // 22/500, linjehøyde 1,2.
  heading: { ...fraunces(500, 22, 26.4, { multiline: true }) },
  // Inter 15, linjehøyde 1,6.
  paragraph: { ...interLine(15, 24, { multiline: true }), fontFamily: FONTS.sans },
  // 12 pt, linjehøyde 1,5.
  aiNote: { ...interLine(12, 18, { multiline: true }), fontFamily: FONTS.sans },
});
