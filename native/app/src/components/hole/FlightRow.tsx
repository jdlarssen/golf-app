// #2252: én rad i flighten på hullsiden, appens motstykke til webbens
// `components/hole/FlightRow.tsx` (#2251).
//
// Hele raden er én knapp: et trykk gir skinna til denne spilleren (eller
// laget), så scoren kan rettes. Raden skriver aldri selv. Det gjør skinna.
//
// Scoreformen (sirkel under par, firkant over) er tegnet med kanter på vanlige
// flater, ikke SVG: formene er bare ringer og rammer, og `Icons.tsx` er appens
// eneste import-flate for `react-native-svg`. Formen og tonen er delt kode
// (`lib/scoring/scoreShape`, `scoreTone`), og tonens farge er den samme som på
// scorekortet (`lib/scoreToneColor.ts`).
//
// #2385 (designlerretet, identisk):
// - **Vanlig** (`Main`): rader på 56 pt med skive (36 pt), navn og en linje
//   under: «Får 1 slag · 3 poeng», «Scratch · 1 poeng», «Får 2 slag · venter»,
//   og «Tast scoren nedenfor» på raden som er på tur. Formen er 40 pt med strek
//   på 2 og tallet i tonens farge, og den regnes av **netto** (eierens svar):
//   Martes 4 med ett slag på par 4 er en birdie-sirkel. Raden på tur er hvit
//   med skogkant på 2 og en stiplet sirkel med «?»; en som venter har «–».
// - **Sollys** (`Hull-sollys`): rader på 64 pt kant til kant med svart strek,
//   fornavnet på 20 pt, poengene («3 p») og scoren som store tall uten form.
//   Raden på tur er en svart flate med hvit tekst («Sigrid · din tur», «?»).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  scoreShape,
  type ScoreShape,
} from '../../../../../lib/scoring/scoreShape';
import { scoreTone } from '../../../../../lib/scoring/scoreTone';
import { scoreToneColor } from '../../lib/scoreToneColor';
import { FONTS, fraunces, interLine, useTheme } from '../../theme';
import { DashedRing } from '../icons/Icons';

/** Designets form: 40 pt med strek på 2, firkanten med hjørner på 6. */
const SHAPE_SIZE = 40;
const SHAPE_STROKE = 2;
const SQUARE_RADIUS = 6;
/** En ring til står 2 pt innenfor den forrige. */
const RING_STEP = SHAPE_STROKE + 2;
/** Tallkolonnen i sollys. */
const SUN_SCORE_WIDTH = 48;

export type FlightRowProps = {
  /** Setet: spillerens id, eller kapteinens i lagformatene. */
  seatId: string;
  /** Navnet i raden: fullt navn, eller fornavnet i sollys. */
  name: string;
  /** Navnet skjermleseren leser, med «(deg)» på din egen rad. */
  a11yName?: string;
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
  /** Hull-sollys-artboardets rad. */
  sunlight?: boolean;
  onSelect: (seatId: string) => void;
};

/** Statuslinja på raden skinna taster for, og på en som ikke har tastet. */
const ACTIVE_STATUS = 'Tast scoren nedenfor';
const WAITING_STATUS = 'venter';
/** Tegnet for en score som ikke er tastet: en kort tankestrek. */
const NO_SCORE = '–';

/**
 * Slagene raden får på hullet, som i designet: «Får 1 slag», eller «Scratch»
 * når den ikke får noen. Ingenting når motoren ikke kan svare, eller når
 * raden gir slag tilbake (plusshandicap), som merket før #2385.
 */
export function strokesLine(extraStrokes: number | null): string | null {
  if (extraStrokes == null || extraStrokes < 0) return null;
  return extraStrokes === 0 ? 'Scratch' : `Får ${extraStrokes} slag`;
}

/** Tall i nøstede former trenger mindre plass; to sifre enda mindre. */
function numberFontSize(shape: ScoreShape, n: number): number {
  const twoDigit = n >= 10;
  if (shape === 'quadruple-square') return twoDigit ? 9 : 11;
  if (shape === 'triple-circle' || shape === 'triple-square') return twoDigit ? 11 : 13;
  if (shape === 'double-circle' || shape === 'double-square') return twoDigit ? 13 : 16;
  return twoDigit ? 16 : 20;
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

/**
 * Formen og tallet på raden. Formen og tonen regnes av netto (brutto minus
 * slagene raden får), men tallet som står, er slagene: det er dem spilleren
 * slo.
 */
function ScoreShapeView({
  seatId,
  score,
  extraStrokes,
  par,
}: {
  seatId: string;
  score: number;
  extraStrokes: number | null;
  par: number;
}) {
  const { colors } = useTheme();
  const net = score - (extraStrokes ?? 0);
  const shape = scoreShape(net, par);
  const tone = scoreTone(net, par);
  const { rings, round } = ringCount(shape);
  const color = scoreToneColor(tone, colors);
  return (
    <View style={styles.shape} testID={`flight-row-${seatId}-shape`}>
      {Array.from({ length: rings }, (_, i) => {
        const inset = i * RING_STEP;
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
                borderRadius: round ? size / 2 : Math.max(2, SQUARE_RADIUS - i * 2),
              },
            ]}
          />
        );
      })}
      <Text
        style={[
          fraunces(600, numberFontSize(shape, score)),
          { color: tone === 'par' ? colors.text : color },
        ]}
        testID={`flight-row-${seatId}-score`}
      >
        {score}
      </Text>
    </View>
  );
}

export function FlightRow({
  seatId,
  name,
  a11yName,
  initial,
  extraStrokes,
  score,
  par,
  active,
  locked,
  submitted,
  points,
  note,
  sunlight = false,
  onSelect,
}: FlightRowProps) {
  const { colors, scheme } = useTheme();
  const spoken = a11yName ?? name;
  // Linja under navnet: slagene raden får, og så poengene eller «venter».
  // Raden som er på tur sier bare hva den venter på.
  const status = score != null ? (points != null ? `${points} poeng` : null) : WAITING_STATUS;
  const subLine = active
    ? [note, ACTIVE_STATUS].filter(Boolean).join(' · ')
    : [note, strokesLine(extraStrokes), status].filter(Boolean).join(' · ');
  // En som ikke har tastet ennå og ikke er på tur, får en blek skive.
  const waiting = !active && score == null;
  const a11yLabel = `${
    score == null ? `${spoken}: ingen score ennå` : `${spoken}: ${score} slag`
  }${submitted ? ', levert' : ''}`;
  const common = {
    onPress: () => onSelect(seatId),
    disabled: locked,
    testID: `flight-row-${seatId}`,
    accessibilityRole: 'button' as const,
    accessibilityState: { selected: active, disabled: locked },
    accessibilityLabel: a11yLabel,
  };

  if (sunlight) {
    const ink = active ? colors.bg : colors.text;
    return (
      <Pressable
        {...common}
        style={[
          styles.rowSun,
          active
            ? [styles.rowSunActive, { backgroundColor: colors.text }]
            : [styles.rowSunRuled, { borderBottomColor: colors.border }],
          locked && styles.locked,
        ]}
      >
        <View style={styles.middle}>
          <Text style={[styles.nameSun, { color: ink }]} numberOfLines={1}>
            {active ? `${name} · din tur` : name}
          </Text>
          {note ? (
            <Text style={[styles.note, { color: ink }]} testID={`flight-row-${seatId}-note`}>
              {note}
            </Text>
          ) : null}
        </View>
        {!active && points != null ? (
          <Text style={[styles.pointsSun, { color: ink }]} testID={`flight-row-${seatId}-points`}>
            {`${points} p`}
          </Text>
        ) : null}
        <Text style={[styles.scoreSun, { color: ink }]} testID={`flight-row-${seatId}-score`}>
          {score ?? (active ? '?' : NO_SCORE)}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      {...common}
      style={[
        styles.row,
        active ? { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.surface } : null,
        locked && styles.locked,
      ]}
    >
      <View
        style={[styles.avatar, { backgroundColor: waiting ? colors.primarySoft : colors.primary }]}
        testID={`flight-row-${seatId}-avatar${waiting ? '-waiting' : ''}`}
      >
        <Text
          style={[
            styles.avatarText,
            {
              // Kremen på skogen i lys drakt; i mørk er skogen salvie.
              color: waiting
                ? colors.primary
                : scheme === 'dark'
                  ? colors.onPrimary
                  : colors.onStrong,
            },
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
          {submitted ? (
            <Text
              style={[styles.badge, { color: colors.muted }]}
              testID={`flight-row-${seatId}-submitted`}
            >
              LEVERT
            </Text>
          ) : null}
        </View>
        {subLine ? (
          <Text
            style={[
              styles.note,
              active
                ? { color: colors.primary, fontFamily: FONTS.sansSemiBold }
                : { color: colors.muted },
            ]}
            testID={`flight-row-${seatId}-note`}
          >
            {subLine}
          </Text>
        ) : null}
      </View>

      {score != null ? (
        <ScoreShapeView seatId={seatId} score={score} extraStrokes={extraStrokes} par={par} />
      ) : active ? (
        <View style={styles.shape} testID={`flight-row-${seatId}-score`}>
          <View style={styles.ringOverlay}>
            <DashedRing color={colors.scoreUnsetFg} kind="score" />
          </View>
          <Text style={[styles.unset, { color: colors.scoreUnsetFg }]}>?</Text>
        </View>
      ) : (
        <View style={styles.shape} testID={`flight-row-${seatId}-score`}>
          <Text style={[styles.unset, { color: colors.scoreUnsetFg }]}>{NO_SCORE}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // `Main`: rader på 56 pt med 8 pt luft rundt. Bare den aktive har ramme.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 56,
    padding: 8,
    borderRadius: 14,
  },
  // `Hull-sollys`: rader på 64 pt kant til kant, og den aktive som svart flate
  // med 4 pt inn fra kantene.
  rowSun: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 64, paddingHorizontal: 20 },
  // Streken under kommer i tillegg til de 64 i designet (CSS teller den utenpå).
  rowSunRuled: { height: 65, borderBottomWidth: 1 },
  rowSunActive: { paddingHorizontal: 16, marginHorizontal: 4, borderRadius: 12 },
  // Samme grå som et låst kort (#2211).
  locked: { opacity: 0.6 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontFamily: FONTS.sansSemiBold },
  middle: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'baseline', columnGap: 8 },
  name: { fontSize: 15, fontFamily: FONTS.sansSemiBold, flexShrink: 1 },
  // Nettleserens `normal` for Inter 20 er 24 (#2385).
  nameSun: { ...interLine(20, 24), fontFamily: FONTS.sansBold },
  badge: { fontSize: 11, fontFamily: FONTS.sansSemiBold, letterSpacing: 1.6 },
  note: { fontSize: 12, fontFamily: FONTS.sans },
  pointsSun: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  scoreSun: {
    ...fraunces(600, 34),
    width: SUN_SCORE_WIDTH,
    textAlign: 'right',
  },
  shape: { width: SHAPE_SIZE, height: SHAPE_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringOverlay: { position: 'absolute', top: 0, left: 0 },
  ring: { position: 'absolute', borderWidth: SHAPE_STROKE },
  unset: { ...fraunces(500, 20) },
});
