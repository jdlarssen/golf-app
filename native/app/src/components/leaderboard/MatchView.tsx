// Native N4 (#1828): duell-visningen for hele matchplay-familien.
//
// Singles, fourball og alternate shot deler nøyaktig denne flaten: to sider, en
// løpende stilling, og en stripe som viser hvem som tok hvilket hull. Derfor én
// komponent og tre små oversettelser i skjermen, ikke tre nesten like kort.
//
// Ingen plassering og ingen pall — matchplay-familien har det ikke på web
// heller (`isMatchplayFamily`, types.ts:113). En duell har en vinner, ikke en
// rangering.
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MatchplayHoleResult, MatchplayMatchResult } from '../../../../../lib/scoring/modes/types';
import {
  matchStanding,
  matchStandingLine,
  matchStrip,
  type StripOutcome,
} from '../../lib/leaderboardModel';
import { COLORS, ui } from '../../theme';

export interface MatchSideInfo {
  sideNumber: 1 | 2;
  /** Én spiller i singles, to i fourball/alternate shot. */
  userIds: readonly string[];
}

export function MatchView({
  side1,
  side2,
  holes,
  holesUp,
  holesPlayed,
  result,
  nameOf,
}: {
  side1: MatchSideInfo;
  side2: MatchSideInfo;
  holes: readonly { holeNumber: number; result: MatchplayHoleResult }[];
  holesUp: number;
  holesPlayed: number;
  result: MatchplayMatchResult | null;
  nameOf: (userId: string) => string;
}) {
  const side1Name = side1.userIds.map(nameOf).join(' & ');
  const side2Name = side2.userIds.map(nameOf).join(' & ');
  const standing = matchStanding({ holesUp, result });
  const line = matchStandingLine({ standing, holesPlayed, side1Name, side2Name });
  const strip = matchStrip(holes);

  return (
    <View testID="match-view">
      <View style={ui.card}>
        <View style={styles.sideRow}>
          <Text
            style={[ui.body, standing.leader === 'side1' ? styles.leading : null]}
            testID="match-side1-name"
          >
            {side1Name}
          </Text>
          <Text style={ui.muted}>mot</Text>
          <Text
            style={[ui.body, styles.sideRight, standing.leader === 'side2' ? styles.leading : null]}
            testID="match-side2-name"
          >
            {side2Name}
          </Text>
        </View>
        <Text style={[ui.value, ui.num]} testID="match-standing">
          {standing.label}
        </Text>
        <Text style={ui.muted} testID="match-standing-line">
          {line}
        </Text>
      </View>

      <Text style={ui.sectionTitle}>Hull for hull</Text>
      {strip.length === 0 ? (
        <Text style={ui.muted} testID="match-strip-empty">
          Stripen fylles etter hvert som hullene blir avgjort.
        </Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="match-strip">
          <View style={styles.strip}>
            {strip.map((cell) => (
              <View
                key={cell.holeNumber}
                style={[styles.cell, cellStyle(cell.outcome)]}
                testID={`match-strip-${cell.holeNumber}`}
              >
                <Text style={[ui.num, styles.cellHole]}>{cell.holeNumber}</Text>
                <Text style={[ui.num, styles.cellOutcome]}>{cell.outcome}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
      <Text style={ui.muted}>
        W = {side1Name} tok hullet · L = {side2Name} tok hullet · T = delt
      </Text>
    </View>
  );
}

function cellStyle(outcome: StripOutcome) {
  if (outcome === 'W') return styles.cellWin;
  if (outcome === 'L') return styles.cellLoss;
  return styles.cellTied;
}

const styles = StyleSheet.create({
  sideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sideRight: { textAlign: 'right' },
  leading: { fontWeight: '700' },
  strip: { flexDirection: 'row', gap: 6, paddingVertical: 8 },
  cell: {
    minWidth: 40,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cellWin: { backgroundColor: COLORS.gold },
  cellLoss: { backgroundColor: COLORS.card },
  cellTied: { backgroundColor: COLORS.linen },
  cellHole: { fontSize: 11, color: COLORS.muted },
  cellOutcome: { fontSize: 15, fontWeight: '700', color: COLORS.forest },
});
