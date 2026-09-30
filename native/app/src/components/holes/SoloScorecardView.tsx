// #2255: «Hull for hull» for solo stableford og solo slagspill — det klassiske
// scorekortet, som på nettsiden.
//
// Ren presentasjon av `SoloScorecard` (`lib/leaderboard/soloScorecard.ts`),
// den samme modellen webbens `SoloStablefordHolesView` og
// `SoloStrokeplayHolesView` tegner. Rekkefølgen er webbens: stillingen, så Ut
// og Inn med deltotalen per ni og ett kort per hull. Det webben uthever i
// champagne (lederen, hullvinneren), får `accentText` her, gull tekst med
// kontrast nok til å leses.
import { StyleSheet, Text, View } from 'react-native';
import type {
  SoloScorecard,
  SoloScorecardHole,
  SoloScorecardNine,
} from '../../../../../lib/leaderboard/soloScorecard';
import { formatSignedPoints } from '../../../../../lib/leaderboard/soloScorecard';
import type { BundlePlayer } from '../../data/gameBundle';
import { HOLES_TEXT, grossChip, holesPlayedChip } from '../../lib/holesCopy';
import { FONTS, useTheme } from '../../theme';
import { ScoreShape } from '../scorecard/ScoreShape';
import { HoleHeader, HolesFooter, HolesTitle, goldEdge, goldWash, holesStyles, nameOf } from './holesShared';

type Metric = 'points' | 'net';

function valueText(value: number | null, metric: Metric): string {
  if (value == null) return '–';
  return metric === 'points' ? formatSignedPoints(value) : String(value);
}

export function SoloScorecardView({
  card,
  metric,
  subtitle,
  players,
  finished,
}: {
  card: SoloScorecard;
  /** Poeng (stableford, flest er best) eller netto (slagspill, lavest er best). */
  metric: Metric;
  subtitle: string;
  players: readonly BundlePlayer[];
  /** Runden er ferdig: bunnteksten sier «Vel spilt!». */
  finished: boolean;
}) {
  const { colors, ui } = useTheme();
  return (
    <View style={holesStyles.page} testID="hole-by-hole">
      <HolesTitle subtitle={subtitle} />

      <View style={ui.card} testID="hole-by-hole-standings">
        <Text style={[holesStyles.kicker, { color: colors.muted }]}>{HOLES_TEXT.standings}</Text>
        {card.standings.map((line) => (
          <View key={line.userId} style={styles.standing} testID={`hole-by-hole-standing-${line.userId}`}>
            <View style={styles.standingName}>
              <Text style={[ui.muted, ui.num, styles.rank]}>{line.rank}</Text>
              <Text
                style={[ui.body, holesStyles.shrink, line.isLeader && holesStyles.medium]}
                numberOfLines={1}
              >
                {nameOf(players, line.userId, HOLES_TEXT.unknownPlayerFull)}
              </Text>
            </View>
            <View style={styles.standingRight}>
              <Text style={[styles.chip, ui.num, { color: colors.muted }]}>
                {metric === 'points'
                  ? holesPlayedChip(line.holesPlayed)
                  : grossChip(line.totalGross ?? 0)}
              </Text>
              <Text
                style={[
                  styles.total,
                  ui.num,
                  { color: line.isLeader ? colors.accentText : colors.text },
                ]}
              >
                {metric === 'points' ? formatSignedPoints(line.total) : String(line.total)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <NineBlock
        heading={HOLES_TEXT.frontHeading}
        sub={HOLES_TEXT.frontSub}
        nine={card.front}
        metric={metric}
        players={players}
        testID="hole-by-hole-front9"
      />
      <NineBlock
        heading={HOLES_TEXT.backHeading}
        sub={HOLES_TEXT.backSub}
        nine={card.back}
        metric={metric}
        players={players}
        testID="hole-by-hole-back9"
      />
      <HolesFooter finished={finished} />
    </View>
  );
}

function NineBlock({
  heading,
  sub,
  nine,
  metric,
  players,
  testID,
}: {
  heading: string;
  sub: string;
  nine: SoloScorecardNine;
  metric: Metric;
  players: readonly BundlePlayer[];
  testID: string;
}) {
  const { colors, ui } = useTheme();
  return (
    <View style={styles.nine} testID={testID}>
      <View style={styles.nineHeader}>
        <Text accessibilityRole="header" style={[styles.nineTitle, { color: colors.text }]}>
          {heading}
        </Text>
        <Text style={[ui.muted, ui.num, holesStyles.small]}>{sub}</Text>
      </View>

      <View style={styles.subtotals} testID={`${testID}-subtotals`}>
        {nine.subtotals.map((s) => (
          <View
            key={s.userId}
            style={[
              styles.subtotal,
              s.isLeader
                ? { borderColor: goldEdge(colors.accent), backgroundColor: goldWash(colors.accent) }
                : { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
            testID={`${testID}-subtotal-${s.userId}`}
          >
            <Text
              style={[holesStyles.small, styles.subtotalName, { color: s.isLeader ? colors.accentText : colors.muted }]}
              numberOfLines={1}
            >
              {nameOf(players, s.userId, HOLES_TEXT.unknownPlayer)}
            </Text>
            <Text style={[styles.subtotalSum, ui.num, { color: s.isLeader ? colors.accentText : colors.muted }]}>
              {s.sum == null ? '–' : metric === 'points' ? formatSignedPoints(s.sum) : String(s.sum)}
            </Text>
          </View>
        ))}
      </View>

      {nine.holes.map((hole) => (
        <HoleCard key={hole.holeNumber} hole={hole} metric={metric} players={players} />
      ))}
    </View>
  );
}

function HoleCard({
  hole,
  metric,
  players,
}: {
  hole: SoloScorecardHole;
  metric: Metric;
  players: readonly BundlePlayer[];
}) {
  const { colors, ui } = useTheme();
  return (
    <View style={ui.card} testID={`hole-by-hole-card-${hole.holeNumber}`}>
      <HoleHeader
        holeNumber={hole.holeNumber}
        par={hole.chipPar}
        strokeIndex={hole.strokeIndex}
        right={
          !hole.scored ? (
            <Text style={[holesStyles.small, { color: colors.muted }]}>{HOLES_TEXT.waiting}</Text>
          ) : null
        }
      />

      {hole.rows.map((row) => (
        <View
          key={row.userId}
          style={[
            holesStyles.row,
            row.isBest
              ? { borderColor: goldEdge(colors.accent), backgroundColor: goldWash(colors.accent) }
              : { borderColor: 'transparent' },
          ]}
          testID={`hole-by-hole-row-${hole.holeNumber}-${row.userId}`}
        >
          <View style={holesStyles.rowName}>
            {row.isBest ? (
              <Text
                style={[holesStyles.star, { color: colors.accent }]}
                accessibilityElementsHidden
                importantForAccessibility="no"
                testID={`hole-by-hole-best-${hole.holeNumber}`}
              >
                ★
              </Text>
            ) : null}
            <Text style={[ui.body, holesStyles.shrink, row.isBest && holesStyles.medium]} numberOfLines={1}>
              {nameOf(players, row.userId, HOLES_TEXT.unknownPlayerFull)}
            </Text>
          </View>
          <View style={holesStyles.rowRight}>
            {row.gross == null ? (
              <Text style={[ui.muted, styles.dash]}>–</Text>
            ) : (
              <ScoreShape strokes={row.gross} par={row.par} size={24} toned />
            )}
            <Text
              style={[
                holesStyles.value,
                ui.num,
                { color: row.isBest ? colors.accentText : colors.text },
              ]}
            >
              {valueText(row.value, metric)}
            </Text>
            {metric === 'points' ? (
              <Text style={[holesStyles.caps, { color: colors.muted }]}>{HOLES_TEXT.pointsUnit}</Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  standing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  standingName: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexShrink: 1 },
  rank: { width: 18 },
  standingRight: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  chip: { fontSize: 12, fontFamily: FONTS.sans },
  total: { fontSize: 20, fontFamily: FONTS.serifScore, minWidth: 28, textAlign: 'right' },
  nine: { gap: 10 },
  nineHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4 },
  nineTitle: { fontSize: 19, fontFamily: FONTS.serifDisplay },
  subtotals: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  subtotal: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  subtotalName: { flexShrink: 1, maxWidth: 120 },
  /** Tallet i pillen er et scoretall, som webbens `score-num`. */
  subtotalSum: { fontSize: 12, fontFamily: FONTS.serifScore },
  dash: { width: 24, textAlign: 'center' },
});
