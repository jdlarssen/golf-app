// #2252: scoreskinna nederst på hullsiden i appen, motstykket til webbens
// `components/hole/ScoreRail.tsx` (#2251).
//
// Fem tall (par −1 til par +3) og «Annet», og hver knapp viser resultatet før
// trykket: poeng i stableford-familien, netto ellers, bare navnet i en blind
// runde. Komponenten tegner bare. Hvem som er aktiv og hva et trykk skriver,
// bestemmer `useScoreRail` og hullsiden.
//
// Teksten er webbens (`holes.scoreRail.*` i messages/no.json). Appen har ikke
// i18n ennå, så den står her.
//
// Høyden på knappene og kantene er temaets (`hole.railButton`,
// `hole.borderW`), så sollys kan gjøre dem større uten at skinna vet om det.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StrokeTerm } from '../../../../../lib/scorecard/scoreRail';
import { FONTS, TAP, useTheme } from '../../theme';

/** Hva knappene viser etter navnet på resultatet. */
export type RailDisplay = 'points' | 'netto' | 'plain';

/** Ett tall på skinna, med resultatet regnet ut av kalleren. */
export type RailOption = {
  strokes: number;
  term: StrokeTerm;
  points: number | null;
  netto: number;
};

/** Setet skinna taster for. */
export type RailActiveSeat = {
  seatId: string;
  name: string;
  /** Slagene setet får på hullet, `null` når motoren ikke kunne svare. */
  extraStrokes: number | null;
  score: number | null;
  putts: number | null;
};

export type ScoreRailProps = {
  /** `null` når alle har score: da krymper skinna til én linje. */
  active: RailActiveSeat | null;
  par: number;
  options: RailOption[];
  display: RailDisplay;
  puttsTracking: boolean;
  /** Navnet i «Neste: X →», eller `null` når ingen andre mangler score. */
  skipTo: string | null;
  onPick: (strokes: number) => void;
  onOther: () => void;
  onStep: (delta: 1 | -1) => void;
  onUndo: () => void;
  onSkip: () => void;
  onPutts: (putts: number) => void;
};

const TERM_LABELS: Record<Exclude<StrokeTerm, 'over'>, string> = {
  albatross: 'Albatross',
  eagle: 'Eagle',
  birdie: 'Birdie',
  par: 'Par',
  bogey: 'Bogey',
  doubleBogey: 'Dobbeltbogey',
  tripleBogey: 'Trippelbogey',
};

const ALL_SCORED = 'Alle har score på hullet. Trykk på et navn for å rette.';

/** `scores.putts` har CHECK (0..10) fra migrasjon 0123. */
const MAX_PUTTS = 10;
/** Chipene 0–4 er det vanlige. «5+» åpner en stepper for 5..10. */
const CHIP_VALUES = [0, 1, 2, 3, 4] as const;
const PLUS_THRESHOLD = 5;

function termText(option: RailOption, par: number): string {
  return option.term === 'over' ? `+${option.strokes - par}` : TERM_LABELS[option.term];
}

export function ScoreRail({
  active,
  par,
  options,
  display,
  puttsTracking,
  skipTo,
  onPick,
  onOther,
  onStep,
  onUndo,
  onSkip,
  onPutts,
}: ScoreRailProps) {
  const { colors, hole } = useTheme();

  // Skjermleseren får høre hvor skinna gikk etter hvert trykk, som webbens
  // live-region. Ikke ved første visning: da leser den overskriften selv.
  const announcement = active ? `Neste: ${active.name}` : ALL_SCORED;
  const lastAnnouncement = useRef(announcement);
  useEffect(() => {
    if (lastAnnouncement.current === announcement) return;
    lastAnnouncement.current = announcement;
    AccessibilityInfo.announceForAccessibility(announcement);
  }, [announcement]);

  const section = [
    styles.section,
    { borderTopWidth: hole.borderW, borderTopColor: colors.border, backgroundColor: colors.bg },
  ];

  if (!active) {
    return (
      <View style={section} testID="score-rail">
        <Text style={[styles.allScored, { color: colors.muted }]} testID="score-rail-all-scored">
          {ALL_SCORED}
        </Text>
      </View>
    );
  }

  const detailText = (option: RailOption): string => {
    const term = termText(option, par);
    if (display === 'points' && option.points != null) return `${term} · ${option.points} p`;
    if (display === 'netto') return `${term} · netto ${option.netto}`;
    return term;
  };

  const labelText = (option: RailOption): string => {
    const base = `Sett ${option.strokes} slag for ${active.name}: ${termText(option, par)}`;
    if (display === 'points' && option.points != null) return `${base}, ${option.points} poeng`;
    if (display === 'netto') return `${base}, netto ${option.netto}`;
    return base;
  };

  const buttonFrame = {
    height: hole.railButton,
    borderWidth: hole.borderW,
  };
  const stepFrame = [
    styles.step,
    { borderWidth: hole.borderW, borderColor: colors.border, backgroundColor: colors.surface },
  ];

  return (
    <View style={section} testID="score-rail">
      <View style={styles.header}>
        <Text
          style={[styles.heading, { color: colors.text }]}
          numberOfLines={1}
          accessibilityRole="header"
          testID="score-rail-heading"
        >
          {active.extraStrokes != null && active.extraStrokes > 0
            ? `${active.name} · får ${active.extraStrokes} slag`
            : active.name}
        </Text>
        {skipTo != null ? (
          <Pressable
            onPress={onSkip}
            style={styles.linkButton}
            testID="score-rail-skip"
            accessibilityRole="button"
            accessibilityLabel={`Hopp over, gå til ${skipTo}`}
          >
            <Text style={[styles.linkText, { color: colors.primary }]}>{`Neste: ${skipTo} →`}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.grid}>
        {options.map((option) => {
          const selected = active.score === option.strokes;
          return (
            <Pressable
              key={option.strokes}
              onPress={() => onPick(option.strokes)}
              style={[
                styles.option,
                buttonFrame,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary : colors.surface,
                },
              ]}
              testID={`rail-option-${option.strokes}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={labelText(option)}
            >
              <Text
                style={[styles.optionNumber, { color: selected ? colors.onPrimary : colors.text }]}
              >
                {option.strokes}
              </Text>
              <Text
                style={[styles.optionDetail, { color: selected ? colors.onPrimary : colors.muted }]}
                numberOfLines={1}
                testID={`rail-option-${option.strokes}-detail`}
              >
                {detailText(option)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={onOther}
          style={[
            styles.option,
            buttonFrame,
            { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
          testID="rail-other"
          accessibilityRole="button"
          accessibilityLabel={`Velg en annen score for ${active.name}`}
        >
          <Text style={[styles.otherText, { color: colors.text }]}>Annet</Text>
        </Pressable>
      </View>

      {active.score != null ? (
        <View style={styles.correctRow}>
          <Pressable
            onPress={() => onStep(-1)}
            style={stepFrame}
            testID="rail-step-down"
            accessibilityRole="button"
            accessibilityLabel={`-1 for ${active.name}`}
          >
            <Text style={[styles.stepText, { color: colors.text }]}>−</Text>
          </Pressable>
          <Pressable
            onPress={() => onStep(1)}
            style={stepFrame}
            testID="rail-step-up"
            accessibilityRole="button"
            accessibilityLabel={`+1 for ${active.name}`}
          >
            <Text style={[styles.stepText, { color: colors.text }]}>+</Text>
          </Pressable>
          <Pressable
            onPress={onUndo}
            style={[styles.linkButton, styles.undo]}
            testID="rail-undo"
            accessibilityRole="button"
            accessibilityLabel={`Nullstill scoren for ${active.name}`}
          >
            <Text style={[styles.undoText, { color: colors.muted }]}>Angre</Text>
          </Pressable>
        </View>
      ) : null}

      {puttsTracking ? (
        <View style={styles.puttsRow} testID="rail-putts">
          <Text style={[styles.puttsLabel, { color: colors.muted }]} importantForAccessibility="no">
            PUTTER
          </Text>
          {/* key: «5+»-stepperen skal ikke følge skinna til neste spiller. */}
          <PuttsChips
            key={active.seatId}
            value={active.putts}
            name={active.name}
            onSelect={onPutts}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Putter med ett trykk, som webbens `PuttsChips`: 0–4 som chips, og «5+»
 * åpner en liten stepper for 5..10.
 */
function PuttsChips({
  value,
  name,
  onSelect,
}: {
  value: number | null;
  name: string;
  onSelect: (putts: number) => void;
}) {
  const { colors, hole } = useTheme();
  const [plusOpen, setPlusOpen] = useState(value != null && value >= PLUS_THRESHOLD);
  const showStepper = plusOpen || (value != null && value >= PLUS_THRESHOLD);
  const stepperValue = value != null && value >= PLUS_THRESHOLD ? value : PLUS_THRESHOLD;

  const chip = (selected: boolean) => [
    styles.chip,
    selected
      ? { backgroundColor: colors.primary, borderColor: colors.primary, borderWidth: hole.borderW }
      : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: hole.borderW },
  ];
  const chipText = (selected: boolean) => [
    styles.chipText,
    { color: selected ? colors.onPrimary : colors.text },
  ];

  return (
    <View style={styles.chips}>
      {CHIP_VALUES.map((n) => (
        <Pressable
          key={n}
          onPress={() => {
            setPlusOpen(false);
            onSelect(n);
          }}
          style={chip(value === n)}
          testID={`rail-putts-${n}`}
          accessibilityRole="button"
          accessibilityState={{ selected: value === n }}
          accessibilityLabel={`${n} putter på ${name}`}
        >
          <Text style={chipText(value === n)}>{n}</Text>
        </Pressable>
      ))}
      {!showStepper ? (
        <Pressable
          onPress={() => setPlusOpen(true)}
          style={chip(false)}
          testID="rail-putts-plus"
          accessibilityRole="button"
          accessibilityLabel={`Fem eller flere putter på ${name}`}
        >
          <Text style={chipText(false)}>5+</Text>
        </Pressable>
      ) : (
        <View
          style={[
            styles.chipStepper,
            { borderColor: colors.border, borderWidth: hole.borderW, backgroundColor: colors.surface },
          ]}
        >
          <Pressable
            onPress={() => onSelect(Math.max(PLUS_THRESHOLD, stepperValue - 1))}
            disabled={stepperValue <= PLUS_THRESHOLD}
            style={[styles.chipStep, stepperValue <= PLUS_THRESHOLD && styles.dimmed]}
            testID="rail-putts-minus"
            accessibilityRole="button"
            accessibilityLabel={`Færre putter på ${name}`}
          >
            <Text style={chipText(false)}>−</Text>
          </Pressable>
          <Text style={chipText(false)} accessibilityLabel={`${stepperValue} putter`}>
            {stepperValue}
          </Text>
          <Pressable
            onPress={() => onSelect(Math.min(MAX_PUTTS, stepperValue + 1))}
            disabled={stepperValue >= MAX_PUTTS}
            style={[styles.chipStep, stepperValue >= MAX_PUTTS && styles.dimmed]}
            testID="rail-putts-more"
            accessibilityRole="button"
            accessibilityLabel={`Flere putter på ${name}`}
          >
            <Text style={chipText(false)}>+</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: TAP,
  },
  heading: { flex: 1, minWidth: 0, fontSize: 17, fontFamily: FONTS.serifDisplay },
  linkButton: { minHeight: TAP, minWidth: TAP, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { fontSize: 14, fontFamily: FONTS.sansSemiBold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Tre i bredden: 30 % + vekst fyller raden med to mellomrom på 8.
  option: {
    flexBasis: '30%',
    flexGrow: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  optionNumber: {
    fontSize: 24,
    lineHeight: 26,
    fontFamily: FONTS.serifScore,
    fontVariant: ['tabular-nums'],
  },
  optionDetail: { fontSize: 12, fontFamily: FONTS.sansMedium, fontVariant: ['tabular-nums'] },
  otherText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  correctRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: {
    width: TAP,
    height: TAP,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 20, fontFamily: FONTS.sansSemiBold },
  undo: { marginLeft: 'auto' },
  undoText: { fontSize: 14, fontFamily: FONTS.sansSemiBold, textDecorationLine: 'underline' },
  puttsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  puttsLabel: { fontSize: 11, fontFamily: FONTS.sansSemiBold, letterSpacing: 1.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, flex: 1 },
  chip: {
    minHeight: TAP,
    minWidth: TAP,
    borderRadius: TAP / 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  chipText: { fontSize: 15, fontFamily: FONTS.sansMedium, fontVariant: ['tabular-nums'] },
  chipStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: TAP / 2,
    paddingHorizontal: 2,
  },
  chipStep: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.4 },
  allScored: { fontSize: 14, fontFamily: FONTS.sans, textAlign: 'center', paddingVertical: 8 },
});
