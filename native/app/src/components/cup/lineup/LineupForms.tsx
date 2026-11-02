// #2752: arrangørens to kort i uttaket: planlagt antall kamper og «Åpne en økt». Nettets
// `PlannedMatchCountForm` og `OpenSessionForm`. Reglene er serverens. Her regnes bare det
// skjermen viser før du trykker, med samme funksjoner.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AppCupLineupView } from '../../../../../../lib/cup/appCupLineupView';
import { sessionMatchCount, type CupSessionFormat } from '../../../../../../lib/cup/cupTemplates';
import { derivePointsToWin } from '../../../../../../lib/cup/pointsToWin';
import { cupPoints } from '../../../lib/cupCopy';
import { FORMAT_LABELS } from '../../../lib/cupGenerateCopy';
import { LINEUP_TEXT } from '../../../lib/cupLineupCopy';
import { formatMessage } from '../../../lib/kavalkadeCopy';
import { FONTS, fraunces, interLine, useTheme } from '../../../theme';
import { Chips, Field } from '../../create/primitives';
import { Stepper } from '../GenerateRoster';

const FORMATS: readonly CupSessionFormat[] = [
  'foursomes_matchplay',
  'fourball_matchplay',
  'singles_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'gruesome_matchplay',
];

export function PlannedCountCard({
  view,
  busy,
  error,
  onSave,
}: {
  view: AppCupLineupView;
  busy: boolean;
  error: string | null;
  onSave: (value: string) => void;
}) {
  const { colors, ui } = useTheme();
  // Gulvet serveren håndhever: kampene som finnes + plassene i åpne økter, aldri under 2.
  const floor = Math.max(2, view.matchCount + view.pendingSlotCount);
  const [value, setValue] = useState(view.plannedMatchCount === null ? '' : String(view.plannedMatchCount));
  const parsed = Number(value);
  const preview = value.trim() !== '' && Number.isInteger(parsed) && parsed >= floor ? parsed : null;
  const disabled = busy || value.trim() === '';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="cup-lineup-planned">
      <Text style={[styles.heading, { color: colors.text }]}>{LINEUP_TEXT.plannedHeading}</Text>
      <Text style={ui.muted}>{LINEUP_TEXT.plannedHelper}</Text>
      <Field label={LINEUP_TEXT.plannedLabel}>
        <TextInput
          style={ui.input}
          value={value}
          onChangeText={setValue}
          keyboardType="number-pad"
          testID="cup-lineup-planned-input"
        />
      </Field>
      {preview !== null ? (
        <Text style={ui.muted} testID="cup-lineup-planned-target">
          {formatMessage(LINEUP_TEXT.plannedTarget, { count: preview, points: cupPoints(derivePointsToWin(preview)) })}
        </Text>
      ) : null}
      {view.pointsToWin !== null ? (
        <Text style={ui.muted} testID="cup-lineup-planned-current">
          {formatMessage(LINEUP_TEXT.plannedCurrent, { points: cupPoints(view.pointsToWin) })}
        </Text>
      ) : null}
      {error ? <FormError message={error} testID="cup-lineup-planned-error" /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        style={[ui.button, disabled && styles.dimmed]}
        onPress={() => onSave(value.trim())}
        testID="cup-lineup-planned-save"
      >
        <Text style={ui.buttonText}>{LINEUP_TEXT.plannedSave}</Text>
      </Pressable>
    </View>
  );
}

export function OpenSessionCard({
  view,
  busy,
  needsPlanned,
  error,
  onOpen,
}: {
  view: AppCupLineupView;
  busy: boolean;
  /** Planlagt antall mangler: økta kan ikke åpnes ennå (#1902). */
  needsPlanned: boolean;
  error: string | null;
  onOpen: (format: CupSessionFormat, slotCount: number) => void;
}) {
  const { colors, ui } = useTheme();
  const [format, setFormat] = useState<CupSessionFormat>('foursomes_matchplay');
  // Den minste stallen bestemmer, som i veiviseren.
  const teamSize = Math.min(view.squads.team1.length, view.squads.team2.length);
  const derived = sessionMatchCount(format, teamSize);
  const [count, setCount] = useState(derived);
  const effective = Math.min(Math.max(1, count), Math.max(1, derived));
  const disabled = busy || derived < 1 || needsPlanned;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="cup-lineup-open-card">
      <Text style={[styles.heading, { color: colors.text }]}>{LINEUP_TEXT.openHeading}</Text>
      <Text style={ui.muted}>{LINEUP_TEXT.openHelper}</Text>
      <Field label={LINEUP_TEXT.formatLabel}>
        <Chips
          value={format}
          onChange={(next: CupSessionFormat) => {
            setFormat(next);
            setCount(sessionMatchCount(next, teamSize));
          }}
          options={FORMATS.map((option) => ({
            value: option,
            label: FORMAT_LABELS[option],
            testID: `cup-lineup-format-${option}`,
          }))}
        />
      </Field>
      <View style={styles.countRow}>
        <Text style={[styles.countLabel, { color: colors.text }]}>{LINEUP_TEXT.slotCountLabel}</Text>
        <Stepper
          label={LINEUP_TEXT.decrease}
          sign="−"
          disabled={effective <= 1}
          onPress={() => setCount(Math.max(1, effective - 1))}
          testID="cup-lineup-slot-minus"
        />
        <Text style={[styles.countValue, { color: colors.text }]} testID="cup-lineup-slot-count">
          {effective}
        </Text>
        <Stepper
          label={LINEUP_TEXT.increase}
          sign="+"
          disabled={effective >= derived}
          onPress={() => setCount(Math.min(derived, effective + 1))}
          testID="cup-lineup-slot-plus"
        />
      </View>
      {error ? <FormError message={error} testID="cup-lineup-open-error" /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        style={[ui.button, disabled && styles.dimmed]}
        onPress={() => onOpen(format, effective)}
        testID="cup-lineup-open"
      >
        <Text style={ui.buttonText}>{LINEUP_TEXT.openButton}</Text>
      </Pressable>
      {needsPlanned ? (
        <Text style={ui.muted} testID="cup-lineup-needs-planned">
          {LINEUP_TEXT.needsPlanned}
        </Text>
      ) : null}
      {derived < 1 ? (
        <Text style={ui.muted} testID="cup-lineup-squad-too-small">
          {LINEUP_TEXT.squadTooSmall}
        </Text>
      ) : null}
    </View>
  );
}

function FormError({ message, testID }: { message: string; testID: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.error, { color: colors.danger }]} testID={testID}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8, marginTop: 10 },
  heading: { ...fraunces(500, 18, 24) },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countLabel: { flex: 1, minWidth: 0, ...interLine(14, 18), fontFamily: FONTS.sansMedium },
  countValue: { ...fraunces(500, 18, 24), minWidth: 28, textAlign: 'center' },
  dimmed: { opacity: 0.45 },
  error: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
});
