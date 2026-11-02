// native/app/src/components/course/HoleGrid.tsx
// #2757: hullene på «Ny bane». Banekortet fra klubben, slik nettets
// `HoleGridEditor` tegner det: ni kolonner, par og indeks.
//
// **Hurtigtasting.** Tallastaturet har ingen «neste»-tast, og 18 felt skal gå
// raskt. Ingen indeks starter på 2–9 og har to siffer, så der flytter fokus med
// én gang. Etter 1 kan det komme et siffer til, så feltet venter (`indexAdvances`).
// Siste felt lukker tastaturet.
//
// Ingen regel bor her: det som er en gyldig indeks, sier de delte funksjonene.
import { useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { coursePar, indexStatusLine } from '../../../../../lib/courses/courseCard';
import { findStrokeIndexGaps, strokeIndexCellState } from '../../../../../lib/courses/coursePayload';
import { canSplitSingleIndices } from '../../../../../lib/courses/nineHoles';
import {
  COURSE_TEXT,
  describeDuplicates,
  describeMissingCount,
  describeMissingList,
  indexCellLabel,
  parCellLabel,
  parTotalLine,
  parTotalNineLine,
} from '../../lib/courseCopy';
import {
  indexAdvances,
  indexValues,
  setHoleCount,
  setHoleIndex,
  setHolePar,
  setSecondRoundIndex,
  splitNineIndices,
  type CourseDraft,
} from '../../lib/courseDraft';
import { FONTS, TAP, fraunces, useTheme } from '../../theme';
import { Chips, Field } from '../create/primitives';

type Round = 1 | 2;
const fieldKey = (round: Round, hole: number) => `${round}-${hole}`;

/** Linja under kortene: hva som mangler, eller hvordan du fyller dem ut. */
function indexLine(values: string[]): { text: string; warning: boolean } | null {
  const { missing, duplicates } = findStrokeIndexGaps(values);
  if (duplicates.length > 0) return { text: describeDuplicates(duplicates), warning: true };
  const line = indexStatusLine(values, missing);
  if (line === null) return null;
  if (line.kind === 'hint') return { text: COURSE_TEXT.holesHint, warning: false };
  return {
    text: line.kind === 'count' ? describeMissingCount(line.count) : describeMissingList(line.numbers),
    warning: true,
  };
}

export function HoleGrid({
  draft,
  onChange,
}: {
  draft: CourseDraft;
  onChange: (next: CourseDraft) => void;
}) {
  const { colors, ui } = useTheme();
  const fields = useRef(new Map<string, TextInput>());
  // «Fordelt …» står under kortet til en indeks endres, som på nettet.
  const [splitDone, setSplitDone] = useState(false);

  const nine = draft.holeCount === 9;
  const values = indexValues(draft);
  const { duplicates } = findStrokeIndexGaps(values);
  const line = indexLine(values);
  const par = coursePar(draft.holes.map((hole) => ({ par_mens: Number(hole.par) })));

  // Rekkefølgen fokus går i: hull for hull, og andre runde etter første.
  const order = [
    ...draft.holes.map((_hole, i) => fieldKey(1, i)),
    ...draft.secondRound.map((_index, i) => fieldKey(2, i)),
  ];

  function focusAfter(key: string) {
    const next = order[order.indexOf(key) + 1];
    if (next === undefined) Keyboard.dismiss();
    else fields.current.get(next)?.focus();
  }

  function typeIndex(round: Round, hole: number, text: string) {
    const value = text.replace(/\D/g, '');
    const previous = round === 1 ? draft.holes[hole]!.index : draft.secondRound[hole]!;
    setSplitDone(false);
    onChange(
      round === 1 ? setHoleIndex(draft, hole, value) : setSecondRoundIndex(draft, hole, value),
    );
    if (indexAdvances(previous, value)) focusAfter(fieldKey(round, hole));
  }

  function indexRow(label: string, round: Round, indices: { hole: number; value: string }[]) {
    return (
      <View style={styles.row}>
        <Text style={[styles.rowLabel, nine && styles.rowLabelNine, { color: colors.muted }]}>{label}</Text>
        {indices.map(({ hole, value }) => {
          const number = hole + 1;
          const state = strokeIndexCellState(value, duplicates);
          const flagged = state !== 'filled';
          return (
            <TextInput
              key={hole}
              ref={(field) => {
                if (field) fields.current.set(fieldKey(round, hole), field);
                else fields.current.delete(fieldKey(round, hole));
              }}
              testID={`course-index-${round}-${number}`}
              accessibilityLabel={indexCellLabel(number, nine ? round : null)}
              style={[
                styles.indexField,
                { color: flagged ? colors.warningText : colors.text },
                flagged
                  ? {
                      borderColor: colors.warning,
                      borderStyle: state === 'duplicate' ? 'solid' : 'dashed',
                    }
                  : { borderColor: 'transparent' },
              ]}
              value={value}
              onChangeText={(text) => typeIndex(round, hole, text)}
              keyboardType="number-pad"
              maxLength={2}
              selectTextOnFocus
              placeholder="?"
              placeholderTextColor={colors.warningText}
              maxFontSizeMultiplier={1.2}
            />
          );
        })}
      </View>
    );
  }

  function card(title: string, from: number, to: number) {
    const holes = draft.holes.slice(from, to);
    return (
      <View style={[ui.card, styles.card]} testID={`course-card-${from + 1}`}>
        <Text style={ui.kicker}>{title}</Text>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, nine && styles.rowLabelNine, { color: colors.muted }]}>
            {COURSE_TEXT.gridHole}
          </Text>
          {holes.map((_hole, i) => (
            <Text key={i} style={[styles.holeNumber, { color: colors.muted }]} maxFontSizeMultiplier={1.2}>
              {from + i + 1}
            </Text>
          ))}
        </View>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, nine && styles.rowLabelNine, { color: colors.muted }]}>
            {COURSE_TEXT.gridPar}
          </Text>
          {holes.map((hole, i) => (
            <Pressable
              key={i}
              testID={`course-par-${from + i + 1}`}
              accessibilityRole="button"
              accessibilityLabel={parCellLabel(from + i + 1, hole.par)}
              style={styles.parCell}
              onPress={() => onChange(setHolePar(draft, from + i))}
            >
              <View style={[styles.parPill, { backgroundColor: colors.surface2 }]}>
                <Text style={[styles.parText, { color: colors.text }]} maxFontSizeMultiplier={1.2}>
                  {hole.par}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
        {indexRow(
          nine ? COURSE_TEXT.gridIndexRound1 : COURSE_TEXT.gridIndex,
          1,
          holes.map((hole, i) => ({ hole: from + i, value: hole.index })),
        )}
        {nine
          ? indexRow(
              COURSE_TEXT.gridIndexRound2,
              2,
              draft.secondRound.map((value, i) => ({ hole: i, value })),
            )
          : null}
      </View>
    );
  }

  const canSplit =
    nine &&
    canSplitSingleIndices(
      draft.holes.map((hole) => hole.index),
      draft.secondRound,
    );

  return (
    <View>
      <Field label={COURSE_TEXT.holeCountLegend}>
        <Chips
          testID="course-hole-count"
          value={draft.holeCount}
          onChange={(holeCount) => {
            setSplitDone(false);
            onChange(setHoleCount(draft, holeCount));
          }}
          options={[
            { value: 18, label: COURSE_TEXT.holeCount18, testID: 'course-holes-18' },
            { value: 9, label: COURSE_TEXT.holeCount9, testID: 'course-holes-9' },
          ]}
        />
      </Field>

      <View style={styles.head}>
        <Text style={[ui.muted, styles.headHint]}>{COURSE_TEXT.parTapHint}</Text>
        <Text style={[styles.parTotal, { color: colors.text }]} testID="course-par-total">
          {nine ? parTotalNineLine(par, par * 2) : parTotalLine(par)}
        </Text>
      </View>

      {nine ? (
        card(COURSE_TEXT.gridFront, 0, 9)
      ) : (
        <>
          {card(COURSE_TEXT.gridFront, 0, 9)}
          {card(COURSE_TEXT.gridBack, 9, 18)}
        </>
      )}

      {line ? (
        <Text
          testID="course-index-line"
          style={[styles.line, line.warning ? { color: colors.warningText, fontFamily: FONTS.sansSemiBold } : ui.muted]}
        >
          {line.text}
        </Text>
      ) : null}

      {nine ? (
        <View>
          <Text style={[ui.muted, styles.line]}>{COURSE_TEXT.nineHint}</Text>
          {canSplit ? (
            <Pressable
              testID="course-split"
              accessibilityRole="button"
              style={[styles.dashed, { borderColor: colors.border }]}
              onPress={() => {
                onChange(splitNineIndices(draft));
                setSplitDone(true);
              }}
            >
              <Text style={ui.muted}>{COURSE_TEXT.splitButton}</Text>
            </Pressable>
          ) : null}
          {splitDone ? (
            <Text style={[ui.body, styles.line]} testID="course-split-done">
              {COURSE_TEXT.splitDone}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
    marginTop: 12,
  },
  headHint: { flex: 1 },
  parTotal: { fontSize: 14, fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
  card: { paddingHorizontal: 8, paddingVertical: 10, gap: 0, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: { width: 40, fontSize: 11, fontFamily: FONTS.sansSemiBold },
  rowLabelNine: { width: 52 },
  holeNumber: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: FONTS.sans,
    fontVariant: ['tabular-nums'],
    paddingVertical: 4,
  },
  parCell: { flex: 1, minHeight: TAP, alignItems: 'center', justifyContent: 'center' },
  parPill: {
    width: 26,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parText: { ...fraunces(600, 15), fontVariant: ['tabular-nums'] },
  // Hele cellen er feltet, så et trykk aldri bommer i luften mellom to felt.
  indexField: {
    flex: 1,
    minWidth: 0,
    minHeight: TAP,
    marginHorizontal: 1,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 1.5,
    borderRadius: 6,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: FONTS.sans,
    fontVariant: ['tabular-nums'],
  },
  line: { marginTop: 8 },
  dashed: {
    minHeight: TAP,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
