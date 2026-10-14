// #2299: oppsummeringen øverst på scorekortet når alle hullene er ført —
// designlerretets `Etter18-forslag`: et skoggrønt bånd med hilsenen og tallene,
// dagens beste hull og det som svidde, og hvem i flighten som mangler hull.
//
// Kortet tegner bare det `buildRoundDoneModel` svarer (`lib/roundDone.ts`); det
// regner ingenting selv. Knappene står i en fast linje nederst (`RoundDoneBar`),
// som på tegningen: eierens valg B. Skjermen tar linja bort når scorekortets
// egen «Lever scorekort» kommer til syne (`roundDoneBarVisible`).
//
// Formene på hullene er den delte `ScoreShape` (ringene i scoretonen), som på
// scorekortet. Tallet i formen følger antall ringer der, ikke tegningens 16.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  birdieUnit,
  greeting,
  headlineUnit,
  highlightSpoken,
  highlightText,
  missingSpoken,
  missingText,
  numberSpoken,
  placeNumber,
  placeSpoken,
  placeUnit,
  ROUND_DONE_TEXT,
  spoken,
  type RoundDoneFlightRow,
  type RoundDoneModel,
} from '../../lib/roundDone';
import type { RoundHighlight } from '../../../../../lib/scorecard/roundSummary';
import { FONTS, fraunces, interLine, TAP, useTheme, withAlpha } from '../../theme';
import { ScoreShape } from './ScoreShape';

export interface RoundDoneCardProps {
  model: RoundDoneModel;
  /** En medspiller mangler hull: åpne det første. */
  onOpenHole: (holeNumber: number) => void;
}

export function RoundDoneCard({ model, onOpenHole }: RoundDoneCardProps) {
  const { colors } = useTheme();
  const highlights = [
    model.best ? { which: 'best' as const, hole: model.best } : null,
    model.worst ? { which: 'worst' as const, hole: model.worst } : null,
  ].filter((h): h is { which: 'best' | 'worst'; hole: RoundHighlight } => h !== null);

  return (
    <View style={styles.root} testID="round-done-card">
      <Band model={model} />

      {highlights.length > 0 ? (
        <View
          style={[
            styles.card,
            styles.highlights,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          testID="round-done-highlights"
        >
          {highlights.map(({ which, hole }, i) => (
            <HighlightRow
              key={which}
              which={which}
              hole={hole}
              divided={i < highlights.length - 1}
            />
          ))}
        </View>
      ) : null}

      {model.flight ? (
        <>
          <Text style={[styles.flightKicker, { color: colors.muted }]}>
            {ROUND_DONE_TEXT.flightKicker}
          </Text>
          <View
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            testID="round-done-flight"
          >
            {model.flight.map((row, i) => (
              <FlightRow
                key={row.kind === 'missing' ? row.userId : row.kind}
                row={row}
                divided={i < (model.flight?.length ?? 0) - 1}
                onOpenHole={onOpenHole}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

export interface RoundDoneBarProps {
  /** «Se over og lever scorekortet»: ruller ned til scorekortet. */
  onReview: () => void;
  /** «Tilbake til hull 18». */
  onBack: () => void;
}

/**
 * Den faste linja nederst (tegningen: krem flate, strek øverst, 12 pt over,
 * 16 på sidene og 20 under knappene, over hjem-streken), som på
 * godkjenningsskjermen.
 */
export function RoundDoneBar({ onReview, onBack }: RoundDoneBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.bg, borderTopColor: colors.border, paddingBottom: 20 + insets.bottom },
      ]}
      testID="round-done-bar"
    >
      <Pressable
        onPress={onReview}
        accessibilityRole="button"
        style={[styles.review, { backgroundColor: colors.primary }]}
        testID="round-done-review"
      >
        <Text style={[styles.reviewText, { color: colors.onPrimary }]}>{ROUND_DONE_TEXT.review}</Text>
      </Pressable>
      <Pressable onPress={onBack} accessibilityRole="button" style={styles.back} testID="round-done-back">
        <Text style={[styles.backText, { color: colors.primary }]}>{ROUND_DONE_TEXT.back}</Text>
      </Pressable>
    </View>
  );
}

/** Det skoggrønne båndet: kicker, hilsen og to eller tre tall. */
function Band({ model }: { model: RoundDoneModel }) {
  const { colors, ui } = useTheme();
  const ink = colors.onStrongWarm;
  const stroke = withAlpha(ink, 0.25);
  const cells = [
    {
      id: 'round-done-headline',
      value: String(model.headline.value),
      unit: headlineUnit(model.headline.kind),
    },
    { id: 'round-done-birdies', value: String(model.birdies), unit: birdieUnit(model.birdies) },
    ...(model.standing
      ? [
          {
            id: 'round-done-place',
            value: placeNumber(model.standing),
            unit: placeUnit(model.standing),
            label: placeSpoken(model.standing),
          },
        ]
      : []),
  ];

  return (
    <View style={[styles.band, { backgroundColor: colors.surfaceStrong }]}>
      <Text
        style={[styles.bandKicker, { color: withAlpha(ink, 0.8) }]}
        accessibilityLabel={spoken(ROUND_DONE_TEXT.kicker)}
      >
        {ROUND_DONE_TEXT.kicker}
      </Text>
      <Text
        style={[styles.greeting, { color: ink }]}
        accessibilityRole="header"
        testID="round-done-greeting"
      >
        {greeting(model.greetingName)}
      </Text>
      <View style={[styles.numbers, { borderTopColor: stroke }]}>
        {cells.map((cell, i) => (
          <View
            key={cell.id}
            style={[styles.cell, i > 0 && { borderLeftWidth: 1, borderLeftColor: stroke }]}
            accessible
            accessibilityLabel={'label' in cell ? cell.label : numberSpoken(cell.value, cell.unit)}
            testID={cell.id}
          >
            <Text style={[styles.number, ui.num, { color: ink }]}>{cell.value}</Text>
            <Text style={[styles.unit, { color: withAlpha(ink, 0.85) }]}>{cell.unit}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function HighlightRow({
  which,
  hole,
  divided,
}: {
  which: 'best' | 'worst';
  hole: RoundHighlight;
  divided: boolean;
}) {
  const { colors } = useTheme();
  const kicker = which === 'best' ? ROUND_DONE_TEXT.bestKicker : ROUND_DONE_TEXT.worstKicker;
  const text = highlightText(hole, which);
  return (
    <View
      style={[styles.highlightRow, divided && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
      accessible
      accessibilityLabel={highlightSpoken(hole, which)}
      testID={`round-done-${which}`}
    >
      <ScoreShape strokes={hole.strokes} par={hole.par} size={34} toned />
      <View style={styles.highlightText}>
        <Text style={[styles.cardKicker, { color: colors.muted }]}>{kicker}</Text>
        <Text style={[styles.holeText, { color: colors.text }]}>{text}</Text>
      </View>
    </View>
  );
}

function FlightRow({
  row,
  divided,
  onOpenHole,
}: {
  row: RoundDoneFlightRow;
  divided: boolean;
  onOpenHole: (holeNumber: number) => void;
}) {
  const { colors } = useTheme();
  const rowStyle = [
    styles.flightRow,
    divided && { borderBottomWidth: 1, borderBottomColor: colors.divider },
  ];

  if (row.kind === 'missing') {
    return (
      <Pressable
        onPress={() => onOpenHole(row.firstHole)}
        accessibilityRole="button"
        accessibilityLabel={missingSpoken(row)}
        style={[rowStyle, styles.missingRow]}
        testID={`round-done-missing-${row.userId}`}
      >
        <Text
          style={[styles.flightName, styles.missingName, { color: colors.text }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {row.name}
        </Text>
        <Text style={[styles.flightStatus, styles.missingStatus, { color: colors.scoreOver1Fg }]}>
          {missingText(row.holes)}
        </Text>
      </Pressable>
    );
  }

  const done = row.kind === 'complete';
  return (
    <View style={rowStyle} testID={`round-done-${row.kind}`}>
      <Text style={[styles.flightName, { color: colors.text }]}>{row.names}</Text>
      <Text
        style={[styles.flightStatus, { color: colors.formUp }]}
        accessibilityLabel={done ? ROUND_DONE_TEXT.completeSpoken : ROUND_DONE_TEXT.submittedSpoken}
      >
        {done ? ROUND_DONE_TEXT.complete : ROUND_DONE_TEXT.submitted}
      </Text>
    </View>
  );
}

// Designet: Fraunces 500 på 32 med nettleserens `normal` linje, 6 pt under kickeren.
const GREETING = fraunces(500, 32);

const styles = StyleSheet.create({
  // Designet: 24 pt over, 20 på sidene og 22 under.
  band: { paddingTop: 24, paddingHorizontal: 20, paddingBottom: 22 },
  bandKicker: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  greeting: { ...GREETING, marginTop: GREETING.marginTop + 6 },
  // Designet: 18 pt ned til en strek, og 14 pt fra streken til tallene.
  numbers: { flexDirection: 'row', marginTop: 18, borderTopWidth: 1, paddingTop: 14 },
  cell: { flex: 1, minWidth: 0, alignItems: 'center' },
  number: { ...fraunces(600, 34) },
  unit: { ...interLine(12, 15), fontFamily: FONTS.sans },
  // Kortene står 16 pt fra skjermkanten, med kant og radius 16 som i designet.
  card: { marginHorizontal: 16, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  highlights: { marginTop: 16 },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  highlightText: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  cardKicker: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  holeText: { ...interLine(15, 19), fontFamily: FONTS.sansSemiBold },
  // Designet: 18 pt over, 20 på sidene og 8 ned til kortet.
  flightKicker: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  flightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  // Raden er 41 pt i designet; den som kan trykkes, får 44 å treffe på.
  missingRow: { minHeight: TAP },
  // En lang navneliste bryter linja; statusen ved siden av er kort.
  flightName: { ...interLine(14, 17), fontFamily: FONTS.sans, flexShrink: 1 },
  flightStatus: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
  // Mangler noen mange hull, er det statusen som bryter linja. Navnet står helt
  // opp til halve raden; et langt kallenavn får ellipse, så statusen alltid har
  // plass.
  missingName: { flexShrink: 0, maxWidth: '50%' },
  missingStatus: { flexShrink: 1, minWidth: 120, textAlign: 'right' },
  // Luft ned til scorekortet under (med rullas gap blir det 24); tegningen har
  // ingenting der, for linja står over.
  root: { paddingBottom: 16 },
  // Designets linje: strek øverst, 12 pt over, 16 på sidene, 6 mellom knappene.
  bar: { borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 16, gap: 6 },
  review: { height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  reviewText: { fontSize: 16, fontFamily: FONTS.sansSemiBold },
  back: { height: TAP, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 14, fontFamily: FONTS.sansSemiBold },
});
