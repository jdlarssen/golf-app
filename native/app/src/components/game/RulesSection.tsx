// #2255: «Regler» nederst på spillets side — hvordan spillformen virker.
//
// Appen hadde ingen formatforklaring. Teksten er webbens (`formatGuideCopy.ts`),
// og nøkkelen velges med den delte `resolveFormatContentKey`, så stableford for
// par får 4BBB-teksten som på nettsiden. Flisa «Regler» på billetten ruller hit;
// `headingRef` er det skjermleseren flytter fokus til etter rullingen.
import type { ComponentRef, Ref } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { resolveFormatContentKey } from '../../../../../lib/games/formatLabel';
import { expectedTeamSize } from '../../../../../lib/games/teamScope';
import { MODE_LABELS, type GameMode } from '../../../../../lib/scoring/modes/types';
import { formatGuideFor } from '../../lib/formatGuideCopy';
import { rulesHeading } from '../../lib/ticketCopy';
import { useTheme } from '../../theme';

export function RulesSection({
  gameMode,
  modeConfig,
  headingRef,
  onLayout,
}: {
  gameMode: string;
  modeConfig: unknown;
  headingRef?: Ref<ComponentRef<typeof Text>>;
  /** Seksjonens plass i rullevisningen, til flisa «Regler». */
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { colors, ui } = useTheme();
  if (!Object.hasOwn(MODE_LABELS, gameMode)) return null;
  const mode = gameMode as GameMode;
  const guide = formatGuideFor(
    resolveFormatContentKey(mode, expectedTeamSize(modeConfig as { team_size?: number } | null)),
  );
  if (!guide) return null;

  return (
    <View onLayout={onLayout} style={styles.section} testID="rules-section">
      <Text
        ref={headingRef}
        accessibilityRole="header"
        style={ui.sectionTitle}
        testID="rules-heading"
      >
        {rulesHeading(MODE_LABELS[mode])}
      </Text>
      <View style={ui.card}>
        <Text style={ui.body}>{guide.summary}</Text>
        {guide.points.map((point) => (
          <View key={point} style={styles.point}>
            <View
              style={[styles.dot, { backgroundColor: colors.primary }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={[ui.body, styles.pointText]}>{point}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 9 },
  pointText: { flex: 1 },
});
