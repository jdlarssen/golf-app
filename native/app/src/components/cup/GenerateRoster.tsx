// #2752: steg 1 i «Fordel & generer»: hvert lag og antall matcher per økt. Nettets
// `Step1Roster` og `Step1SessionCounts`. Tallene kommer fra `lib/cup/matchPlan.ts`.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SessionCountRow } from '../../../../../lib/cup/cupTemplates';
import type { TeamAssignment, WizardPlayer } from '../../../../../lib/cup/matchPlan';
import { FORMAT_LABELS, GENERATE_TEXT } from '../../lib/cupGenerateCopy';
import { hcpLine } from '../../lib/cupSetupCopy';
import { formatMessage } from '../../lib/kavalkadeCopy';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../../theme';
import { Chips } from '../create/primitives';

export function GenerateRoster({
  players,
  team1Name,
  team2Name,
  assignments,
  team1Count,
  team2Count,
  onAssign,
}: {
  players: readonly WizardPlayer[];
  team1Name: string;
  team2Name: string;
  assignments: Record<string, TeamAssignment>;
  team1Count: number;
  team2Count: number;
  onAssign: (id: string, value: TeamAssignment) => void;
}) {
  const { colors } = useTheme();
  const uneven = Math.abs(team1Count - team2Count) >= 2 && team1Count > 0 && team2Count > 0;
  return (
    <View testID="cup-generate-roster">
      {players.map((player) => (
        <View
          key={player.id}
          style={[styles.player, { backgroundColor: colors.surface, borderColor: colors.border }]}
          testID={`cup-generate-player-${player.id}`}
        >
          <Text style={[styles.name, { color: colors.text }]}>{player.displayName}</Text>
          <Text style={[styles.small, { color: colors.muted }]}>{hcpLine(player.hcpIndex)}</Text>
          <Chips
            value={assignments[player.id] ?? 'unassigned'}
            onChange={(value: TeamAssignment) => onAssign(player.id, value)}
            options={[
              { value: 'team1', label: team1Name, testID: `cup-generate-assign-${player.id}-team1` },
              { value: 'unassigned', label: '—', testID: `cup-generate-assign-${player.id}-unassigned` },
              { value: 'team2', label: team2Name, testID: `cup-generate-assign-${player.id}-team2` },
            ]}
          />
        </View>
      ))}
      <View style={styles.counts}>
        <TeamCount name={team1Name} count={team1Count} testID="cup-generate-count-team1" />
        <TeamCount name={team2Name} count={team2Count} testID="cup-generate-count-team2" />
      </View>
      {uneven ? (
        <Text style={[styles.warn, { color: colors.warningText }]} testID="cup-generate-uneven">
          {formatMessage(GENERATE_TEXT.unevenTeams, { count1: team1Count, count2: team2Count })}
        </Text>
      ) : null}
    </View>
  );
}

function TeamCount({ name, count, testID }: { name: string; count: number; testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.count, { borderColor: colors.border }]}>
      <Text style={[styles.countName, { color: colors.muted }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.countValue, { color: colors.primary }]} testID={testID}>
        {count}
      </Text>
    </View>
  );
}

export function GenerateSessionCounts({
  rows,
  onAdjust,
}: {
  rows: readonly SessionCountRow[];
  onAdjust: (row: SessionCountRow, delta: 1 | -1) => void;
}) {
  const { colors, ui } = useTheme();
  return (
    <View testID="cup-generate-sessions">
      <Text style={[ui.sectionTitle, styles.heading]}>{GENERATE_TEXT.sessionCountsHeading}</Text>
      <Text style={ui.muted}>{GENERATE_TEXT.sessionCountsHint}</Text>
      {rows.map((row, position) => {
        const format = FORMAT_LABELS[row.format];
        return (
          <View
            key={row.index}
            style={[styles.session, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[styles.sessionName, { color: colors.text }]} numberOfLines={1}>
              {format}
            </Text>
            <Stepper
              label={formatMessage(GENERATE_TEXT.sessionCountMinus, { n: position + 1, format })}
              sign="−"
              disabled={row.effective <= 1}
              onPress={() => onAdjust(row, -1)}
              testID={`cup-generate-session-minus-${row.index}`}
            />
            <Text style={[styles.sessionValue, { color: colors.text }]} testID={`cup-generate-session-count-${row.index}`}>
              {formatMessage(GENERATE_TEXT.sessionCountValue, { count: row.effective, max: row.derived })}
            </Text>
            <Stepper
              label={formatMessage(GENERATE_TEXT.sessionCountPlus, { n: position + 1, format })}
              sign="+"
              disabled={row.effective >= row.derived}
              onPress={() => onAdjust(row, 1)}
              testID={`cup-generate-session-plus-${row.index}`}
            />
          </View>
        );
      })}
    </View>
  );
}

export function Stepper({
  label,
  sign,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  sign: string;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.stepper, { borderColor: colors.border }, disabled && styles.dimmed]}
      testID={testID}
    >
      <Text style={[styles.stepperSign, { color: colors.text }]}>{sign}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  player: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 2, marginTop: 8 },
  name: { ...fraunces(500, 15, 20) },
  small: { ...interLine(12, 16), fontFamily: FONTS.sans },
  counts: { flexDirection: 'row', gap: 10, marginTop: 12 },
  count: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 10, alignItems: 'center', gap: 2 },
  countName: { ...interLine(12, 16), fontFamily: FONTS.sansSemiBold },
  countValue: { ...fraunces(500, 26, 30) },
  warn: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, marginTop: 8 },
  heading: { marginTop: 16 },
  session: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  sessionName: { flex: 1, minWidth: 0, ...interLine(14, 18), fontFamily: FONTS.sansMedium },
  sessionValue: { ...interLine(13, 18), fontFamily: FONTS.sans, minWidth: 52, textAlign: 'center' },
  stepper: {
    width: TAP,
    height: TAP,
    borderRadius: TAP / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperSign: { fontSize: 18, fontFamily: FONTS.sans },
  dimmed: { opacity: 0.4 },
});
