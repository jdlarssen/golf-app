// #2252: én rad i flighten på hullsiden, appens motstykke til webbens
// `components/hole/FlightRow.tsx` (#2251).
//
// Hele raden er én knapp: et trykk gir skinna til denne spilleren (eller
// laget), så scoren kan rettes. Raden skriver aldri selv. Det gjør skinna.
//
// Scoreformen (sirkel under par, firkant over) er tegnet med kanter på vanlige
// flater, ikke SVG: formene er bare ringer og rammer, og `Icons.tsx` er appens
// eneste import-flate for `react-native-svg`. Formen og tonen er delt kode
// (`lib/scoring/scoreShape`, `scoreTone`), fargene er temaets.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  scoreShape,
  type ScoreShape,
} from '../../../../../lib/scoring/scoreShape';
import { scoreTone, type ScoreTone } from '../../../../../lib/scoring/scoreTone';
import { FONTS, useTheme, type ThemeColors } from '../../theme';

/** Webbens `md`-form: 36 px, strek 1,25. */
const SHAPE_SIZE = 36;
const SHAPE_STROKE = 1.25;

export type FlightRowProps = {
  /** Setet: spillerens id, eller kapteinens i lagformatene. */
  seatId: string;
  name: string;
  /** Én eller to bokstaver i sirkelen foran navnet. */
  initial: string;
  /** Slagene raden får på hullet. `null` = motoren kunne ikke svare. */
  extraStrokes: number | null;
  score: number | null;
  par: number;
  /** Skinna taster denne raden nå. */
  active: boolean;
  /** Levert, eller runden er ikke aktiv (#2211). Raden kan ikke velges. */
  locked: boolean;
  submitted: boolean;
  /**
   * Stableford-poengene for scoren som står. `null` skjuler dem: ikke
   * stableford, ingen score ennå, eller en blind runde (#2219).
   */
  points: number | null;
  /** En linje under navnet, som «Anna slår ut» i foursomes. */
  note?: string | null;
  onSelect: (seatId: string) => void;
};

/** Tall i nøstede former trenger mindre plass; to sifre enda mindre. */
function numberFontSize(shape: ScoreShape, n: number): number {
  const twoDigit = n >= 10;
  if (shape === 'quadruple-square') return twoDigit ? 9 : 11;
  if (shape === 'triple-circle' || shape === 'triple-square') return twoDigit ? 11 : 13;
  if (shape === 'double-circle' || shape === 'double-square') return twoDigit ? 13 : 16;
  return twoDigit ? 16 : 20;
}

function strokeColor(tone: ScoreTone, colors: ThemeColors): string {
  switch (tone) {
    case 'under':
      return colors.scoreUnderFg;
    case 'par':
      return colors.scoreParFg;
    case 'over1':
      return colors.scoreOver1Fg;
    case 'over2':
      return colors.scoreOver2Fg;
    default:
      return colors.muted;
  }
}

/** Tallets farge, som på web: under par og dobbel bogey+ skiller seg ut. */
function numberColor(tone: ScoreTone, colors: ThemeColors): string {
  switch (tone) {
    case 'under':
      return colors.scoreUnderFg;
    case 'over2':
      return colors.scoreOver2Fg;
    case 'unset':
      return colors.muted;
    default:
      return colors.text;
  }
}

function ringCount(shape: ScoreShape): { rings: number; round: boolean } {
  switch (shape) {
    case 'circle':
      return { rings: 1, round: true };
    case 'double-circle':
      return { rings: 2, round: true };
    case 'triple-circle':
      return { rings: 3, round: true };
    case 'square':
      return { rings: 1, round: false };
    case 'double-square':
      return { rings: 2, round: false };
    case 'triple-square':
      return { rings: 3, round: false };
    case 'quadruple-square':
      return { rings: 4, round: false };
    default:
      return { rings: 0, round: false };
  }
}

function ScoreShapeView({
  seatId,
  score,
  par,
}: {
  seatId: string;
  score: number | null;
  par: number;
}) {
  const { colors } = useTheme();
  const shape = scoreShape(score, par);
  const tone = scoreTone(score, par);
  const { rings, round } = ringCount(shape);
  const color = strokeColor(tone, colors);
  // Samme avstand mellom ringene som webbens SVG.
  const gap = Math.max(2, SHAPE_STROKE + 0.5);
  return (
    <View style={styles.shape} testID={`flight-row-${seatId}-shape`}>
      {Array.from({ length: rings }, (_, i) => {
        const inset = i * gap;
        const size = SHAPE_SIZE - 2 * inset;
        return (
          <View
            key={i}
            style={[
              styles.ring,
              {
                top: inset,
                left: inset,
                width: size,
                height: size,
                borderColor: color,
                borderRadius: round ? size / 2 : Math.max(2, 4 - i),
              },
            ]}
          />
        );
      })}
      <Text
        style={[
          styles.shapeNumber,
          { fontSize: numberFontSize(shape, score ?? 0), color: numberColor(tone, colors) },
        ]}
        testID={`flight-row-${seatId}-score`}
      >
        {score ?? '—'}
      </Text>
    </View>
  );
}

export function FlightRow({
  seatId,
  name,
  initial,
  extraStrokes,
  score,
  par,
  active,
  locked,
  submitted,
  points,
  note,
  onSelect,
}: FlightRowProps) {
  const { colors, hole } = useTheme();
  return (
    <Pressable
      onPress={() => onSelect(seatId)}
      disabled={locked}
      testID={`flight-row-${seatId}`}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: locked }}
      accessibilityLabel={`${
        score == null ? `${name}: ingen score ennå` : `${name}: ${score} slag`
      }${submitted ? ', levert' : ''}`}
      style={[
        styles.row,
        {
          borderWidth: hole.borderW,
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: active ? colors.primarySoft : colors.surface,
          // Webbens innfelte strek langs venstre kant på aktiv rad.
          borderLeftWidth: active ? hole.activeBarW : hole.borderW,
          borderLeftColor: active ? colors.primary : colors.border,
        },
        locked && styles.locked,
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <Text
          style={[
            styles.avatarText,
            { color: colors.onPrimary, fontSize: initial.length > 1 ? 12 : 14 },
          ]}
        >
          {initial}
        </Text>
      </View>

      <View style={styles.middle}>
        <View style={styles.nameLine}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          {/* Slag-merket er tildelingen, ikke stillingen: det står også i en
              blind runde, som på web (#1447). */}
          {extraStrokes != null && extraStrokes > 0 ? (
            <Text
              style={[styles.badge, { color: colors.primary }]}
              testID={`flight-row-${seatId}-strokes`}
            >
              {`+${extraStrokes} SLAG`}
            </Text>
          ) : null}
          {submitted ? (
            <Text
              style={[styles.badge, { color: colors.muted }]}
              testID={`flight-row-${seatId}-submitted`}
            >
              LEVERT
            </Text>
          ) : null}
        </View>
        {note ? (
          <Text style={[styles.note, { color: colors.muted }]} testID={`flight-row-${seatId}-note`}>
            {note}
          </Text>
        ) : null}
      </View>

      {points != null ? (
        <Text
          style={[styles.points, { color: colors.muted }]}
          testID={`flight-row-${seatId}-points`}
        >
          {`${points} p`}
        </Text>
      ) : null}

      <ScoreShapeView seatId={seatId} score={score} par={par} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: 14,
  },
  // Samme grå som et låst kort (#2211).
  locked: { opacity: 0.6 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: FONTS.serifDisplay },
  middle: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: 8,
  },
  name: { fontSize: 16, fontFamily: FONTS.serifDisplay, flexShrink: 1 },
  badge: { fontSize: 11, fontFamily: FONTS.sansSemiBold, letterSpacing: 1.6 },
  note: { fontSize: 13, fontFamily: FONTS.sans },
  points: {
    fontSize: 12,
    fontFamily: FONTS.sansSemiBold,
    fontVariant: ['tabular-nums'],
  },
  shape: { width: SHAPE_SIZE, height: SHAPE_SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: SHAPE_STROKE },
  shapeNumber: {
    fontFamily: FONTS.serifScore,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
});
