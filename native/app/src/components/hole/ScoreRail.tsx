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
//
// #2385 la skinna på designlerretet, identisk:
// - **Vanlig** (`Main`): et hvitt ark nederst med runde øvre hjørner, skygge og
//   et lite håndtak. Øverst navnet og «Får 1 slag her · netto par = 5». Knappene
//   er 72 pt med tonens flate og farge og uten kant (birdie grønn, par nøytral,
//   bogey amber, dobbel og verre murstein), og før noen score står er par
//   foreslått med skogkant. «Annet» har «8+ eller stryk» under. Nederst putte-
//   valget og «Neste: fornavn →». Putter er noe man slår på («Registrer
//   putter», eierens ord i #2000: putter-delen tok for stor plass når den
//   alltid sto); står det på, er raden designets: «Putter 1 · 2 · 3+».
// - **Sollys** (`Hull-sollys`): bare knappene, 84 pt med svart kant under en
//   svart strek på 3, og bare navnet på resultatet. Par foreslås som svart
//   flate. Ingen overskrift og ingen nederste rad.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StrokeTerm } from '../../../../../lib/scorecard/scoreRail';
import { scoreTone, type ScoreTone } from '../../../../../lib/scoring/scoreTone';
import { scoreToneColor } from '../../lib/scoreToneColor';
import { FONTS, fraunces, TAP, useTheme, type ThemeColors } from '../../theme';
import { withSystemArrows } from '../SystemArrow';

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
  /**
   * Formatet fanger putter og hullet er åpent: da står «Registrer putter»
   * (av) eller putte-chipsene (på) i nederste rad.
   */
  puttsAvailable: boolean;
  /** Fornavnet i «Neste: X →», eller `null` når ingen andre mangler score. */
  skipTo: string | null;
  /** Talltegnet på «Annet» i sollys og underlinja ellers: «8+» og «8+ eller stryk». */
  otherTop: string;
  otherHint: string;
  onPick: (strokes: number) => void;
  onOther: () => void;
  onStep: (delta: 1 | -1) => void;
  onUndo: () => void;
  onSkip: () => void;
  onPutts: (putts: number) => void;
  /** Slår putte-føring på eller av for runden. */
  onPuttsToggle: () => void;
};

/** Flaten bak en tone. */
function toneBg(tone: ScoreTone, colors: ThemeColors): string {
  switch (tone) {
    case 'under':
      return colors.scoreUnderBg;
    case 'over1':
      return colors.scoreOver1Bg;
    case 'over2':
      return colors.scoreOver2Bg;
    default:
      return colors.scoreParBg;
  }
}

const TERM_LABELS: Record<Exclude<StrokeTerm, 'over'>, string> = {
  albatross: 'Albatross',
  eagle: 'Eagle',
  birdie: 'Birdie',
  par: 'Par',
  bogey: 'Bogey',
  doubleBogey: 'Dobbeltbogey',
  tripleBogey: 'Trippelbogey',
};

/**
 * Det knappene viser (designet, #2385): «Dobbel» og «Trippel» får plass i en
 * tredel av skjermen. Skjermleseren får hele ordet (`TERM_LABELS`).
 */
const SHORT_LABELS: Partial<Record<StrokeTerm, string>> = {
  doubleBogey: 'Dobbel',
  tripleBogey: 'Trippel',
};

const ALL_SCORED = 'Alle har score på hullet. Trykk på et navn for å rette.';
/** Ordrett webbens `holes.putts.fieldLabel` (låst i testen). */
export const PUTTS_LABEL = 'Putter';

/** `scores.putts` har CHECK (0..10) fra migrasjon 0123. */
const MAX_PUTTS = 10;
/**
 * Designets chips (#2385): «1», «2» og «3+». «3+» velger 3 og åpner en stepper
 * som går fra 0 til 10, så også en chip-in (0 putter) kan føres.
 */
const CHIP_VALUES = [1, 2] as const;
const PLUS_START = 3;
const MIN_PUTTS = 0;

function termText(option: RailOption, par: number): string {
  return option.term === 'over' ? `+${option.strokes - par}` : TERM_LABELS[option.term];
}

function shortTermText(option: RailOption, par: number): string {
  return SHORT_LABELS[option.term] ?? termText(option, par);
}

/** Linja til høyre for navnet: slagene setet får og hva par blir netto. */
export function railStrokesLine(extraStrokes: number | null, par: number): string | null {
  if (extraStrokes == null || extraStrokes <= 0) return null;
  return `Får ${extraStrokes} slag her · netto par = ${par + extraStrokes}`;
}

export function ScoreRail({
  active,
  par,
  options,
  display,
  puttsTracking,
  puttsAvailable,
  skipTo,
  otherTop,
  otherHint,
  onPick,
  onOther,
  onStep,
  onUndo,
  onSkip,
  onPutts,
  onPuttsToggle,
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

  // Sollys (`selectedFill`): hvite knapper med svart kant under en svart strek.
  const sunlight = hole.selectedFill;
  const section = sunlight
    ? [styles.sectionSun, { borderTopColor: colors.border, backgroundColor: colors.bg }]
    : [styles.sheet, { backgroundColor: colors.surface }];
  // Arket har et lite håndtak øverst, som designet.
  const handle = sunlight ? null : (
    <View style={[styles.handle, { backgroundColor: colors.border }]} />
  );

  if (!active) {
    return (
      <View style={section} testID="score-rail">
        {handle}
        <Text style={[styles.allScored, { color: colors.muted }]} testID="score-rail-all-scored">
          {ALL_SCORED}
        </Text>
      </View>
    );
  }

  const detailText = (option: RailOption): string => {
    const term = shortTermText(option, par);
    if (sunlight) return term;
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

  const stepFrame = [
    styles.step,
    { borderWidth: hole.borderW, borderColor: colors.border, backgroundColor: colors.surface },
  ];
  const strokesLine = railStrokesLine(active.extraStrokes, par);

  return (
    <View style={section} testID="score-rail">
      {handle}
      {sunlight ? null : (
        <View style={styles.header}>
          <Text
            style={[styles.heading, { color: colors.text }]}
            numberOfLines={1}
            accessibilityRole="header"
            testID="score-rail-heading"
          >
            {active.name}
          </Text>
          {strokesLine ? (
            <Text style={[styles.headingNote, { color: colors.muted }]} testID="score-rail-strokes">
              {strokesLine}
            </Text>
          ) : null}
        </View>
      )}

      <View style={[styles.grid, { gap: sunlight ? 10 : 8 }]}>
        {options.map((option) => {
          const selected = active.score === option.strokes;
          // Før noen score står, er par forslaget (designet): skogkant på
          // nøytral flate, eller fylt svart i sollys.
          const suggested = !selected && active.score == null && option.term === 'par';
          const tone = scoreTone(option.strokes, par);
          const fill = selected
            ? colors.primary
            : sunlight
              ? suggested
                ? colors.text
                : colors.bg
              : toneBg(tone, colors);
          const ink = selected
            ? colors.onPrimary
            : suggested && sunlight
              ? colors.bg
              : sunlight || tone === 'par'
                ? colors.text
                : scoreToneColor(tone, colors);
          // Tonede knapper har ingen kant i designet. Valgt eller foreslått par
          // har skogkant på 2; i sollys har alle svart kant, unntatt den fylte.
          const frame = sunlight
            ? { borderWidth: suggested || selected ? 0 : hole.borderW, borderColor: colors.text }
            : selected || suggested
              ? { borderWidth: 2, borderColor: colors.primary }
              : { borderWidth: 0 };
          return (
            <Pressable
              key={option.strokes}
              onPress={() => onPick(option.strokes)}
              style={[styles.option, { height: hole.railButton, backgroundColor: fill }, frame]}
              testID={`rail-option-${option.strokes}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={labelText(option)}
            >
              <Text
                style={[
                  fraunces(600, hole.railNumber, hole.railNumber),
                  { color: ink },
                ]}
              >
                {option.strokes}
              </Text>
              <Text
                style={[
                  styles.optionDetail,
                  {
                    color: ink,
                    fontSize: hole.railLabel,
                    fontFamily: sunlight ? FONTS.sansBold : FONTS.sansSemiBold,
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
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
            {
              height: hole.railButton,
              borderWidth: hole.borderW,
              borderColor: sunlight ? colors.text : colors.border,
              backgroundColor: sunlight ? colors.bg : colors.surface,
            },
          ]}
          testID="rail-other"
          accessibilityRole="button"
          accessibilityLabel={`Velg en annen score for ${active.name}`}
        >
          {sunlight ? (
            <>
              <Text style={[styles.otherTop, { color: colors.text }]}>{otherTop}</Text>
              <Text style={[styles.otherLabelSun, { color: colors.text }]}>Annet</Text>
            </>
          ) : (
            <>
              <Text style={[styles.otherText, { color: colors.text }]}>Annet</Text>
              <Text style={[styles.otherHint, { color: colors.muted }]} testID="rail-other-hint">
                {otherHint}
              </Text>
            </>
          )}
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

      {/* Sollys har ingen nederste rad (Hull-sollys). */}
      {!sunlight && (puttsAvailable || skipTo != null) ? (
        <View style={styles.bottomRow}>
          {puttsTracking ? (
            <View style={styles.puttsRow} testID="rail-putts">
              {/* «Putter» slår føringen av igjen. Chipene har navnet i
                  etiketten sin. */}
              <Pressable
                onPress={onPuttsToggle}
                style={styles.puttsToggle}
                testID="rail-putts-toggle"
                accessibilityRole="switch"
                accessibilityState={{ checked: true }}
                accessibilityLabel="Registrer putter"
              >
                <Text style={[styles.puttsLabel, { color: colors.muted }]}>{PUTTS_LABEL}</Text>
              </Pressable>
              {/* key: «5+»-stepperen skal ikke følge skinna til neste spiller. */}
              <PuttsChips
                key={active.seatId}
                value={active.putts}
                name={active.name}
                onSelect={onPutts}
              />
            </View>
          ) : puttsAvailable ? (
            <Pressable
              onPress={onPuttsToggle}
              style={styles.linkButton}
              testID="rail-putts-toggle"
              accessibilityRole="switch"
              accessibilityState={{ checked: false }}
              accessibilityLabel="Registrer putter"
            >
              <Text style={[styles.linkText, { color: colors.primary }]}>Registrer putter</Text>
            </Pressable>
          ) : null}
          {skipTo != null ? (
            <Pressable
              onPress={onSkip}
              style={[styles.linkButton, styles.skip]}
              testID="score-rail-skip"
              accessibilityRole="button"
              accessibilityLabel={`Hopp over, gå til ${skipTo}`}
            >
              <Text style={[styles.linkText, { color: colors.primary }]}>{withSystemArrows(`Neste: ${skipTo} →`, '600')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Putter med ett trykk, som designet: «1» og «2» som chips, og «3+» velger 3
 * og åpner en liten stepper for 0..10. Står det 0 eller 3 og mer, står
 * stepperen fremme.
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
  const outsideChips = value != null && (value < CHIP_VALUES[0] || value >= PLUS_START);
  const [plusOpen, setPlusOpen] = useState(outsideChips);
  const showStepper = plusOpen || outsideChips;
  const stepperValue = value ?? PLUS_START;

  // Designets chips: fylt skog når de er valgt, ellers hvite med tynn kant.
  const chip = (selected: boolean) => [
    styles.chip,
    selected
      ? { backgroundColor: colors.primary, borderWidth: 0 }
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
          onPress={() => {
            setPlusOpen(true);
            onSelect(PLUS_START);
          }}
          style={chip(false)}
          testID="rail-putts-plus"
          accessibilityRole="button"
          accessibilityLabel={`Tre eller flere putter på ${name}`}
        >
          <Text style={chipText(false)}>{`${PLUS_START}+`}</Text>
        </Pressable>
      ) : (
        <View
          style={[
            styles.chipStepper,
            { borderColor: colors.border, borderWidth: hole.borderW, backgroundColor: colors.surface },
          ]}
          testID="rail-putts-stepper"
        >
          <Pressable
            onPress={() => onSelect(Math.max(MIN_PUTTS, stepperValue - 1))}
            disabled={stepperValue <= MIN_PUTTS}
            style={[styles.chipStep, stepperValue <= MIN_PUTTS && styles.dimmed]}
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
  // `Main`: arket med runde øvre hjørner, skygge og 10/16/22 luft, 12 mellom.
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 22,
    gap: 12,
    shadowColor: '#1A2E1F',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  // `Hull-sollys`: svart strek på 3 over knappene, 12/12/24 luft.
  sectionSun: {
    borderTopWidth: 3,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 24,
    gap: 10,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  heading: { ...fraunces(500, 20), flexShrink: 1 },
  headingNote: { fontSize: 12, fontFamily: FONTS.sans },
  linkButton: { minHeight: TAP, justifyContent: 'center' },
  linkText: { fontSize: 12, fontFamily: FONTS.sansSemiBold },
  bottomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 8,
  },
  skip: { marginLeft: 'auto', alignItems: 'flex-end' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // Tre i bredden: 30 % + vekst fyller raden med to mellomrom.
  option: {
    flexBasis: '30%',
    flexGrow: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  optionDetail: {},
  otherText: { ...fraunces(500, 22, 22) },
  otherHint: { fontSize: 11, fontFamily: FONTS.sans },
  otherTop: { ...fraunces(600, 28, 28) },
  otherLabelSun: { fontSize: 13, fontFamily: FONTS.sansBold },
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
  puttsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  puttsToggle: { minHeight: TAP, justifyContent: 'center' },
  puttsLabel: { fontSize: 12, fontFamily: FONTS.sans },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, flexShrink: 1 },
  chip: {
    height: TAP,
    minWidth: TAP,
    borderRadius: TAP / 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  chipText: { fontSize: 14, fontFamily: FONTS.sansSemiBold },
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
