// Native N4 (#1828): duell-visningen for hele matchplay-familien.
//
// Singles, fourball og alternate shot deler nøyaktig denne flaten: to sider, en
// løpende stilling, og en stripe som viser hvem som tok hvilket hull. Derfor én
// komponent og tre små oversettelser i skjermen, ikke tre nesten like kort.
//
// Ingen plassering og ingen pall — matchplay-familien har det ikke på web
// heller (`isMatchplayFamily`, types.ts:113). En duell har en vinner, ikke en
// rangering.
import { StyleSheet, Text, View } from 'react-native';
import type { MatchplayHoleResult, MatchplayMatchResult } from '../../../../../lib/scoring/modes/types';
import {
  matchStanding,
  matchStandingLine,
  matchStrip,
  type StripCell,
  type StripOutcome,
} from '../../lib/leaderboardModel';
import { FONTS, useTheme, type ThemeColors } from '../../theme';

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
  const { colors, ui } = useTheme();
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
            style={[ui.body, styles.sideName, standing.leader === 'side1' ? styles.leading : null]}
            testID="match-side1-name"
          >
            {side1Name}
          </Text>
          <Text style={[ui.muted, styles.versus]}>mot</Text>
          <Text
            style={[
              ui.body,
              styles.sideName,
              styles.sideRight,
              standing.leader === 'side2' ? styles.leading : null,
            ]}
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
        // Et rutenett, ikke en sidelengs ScrollView (#1990): på en vanlig
        // iPhone fikk nøyaktig åtte ruter plass i bredden, og resten lå utenfor
        // skjermen uten noe hint om at det fantes mer. Ni per rad får plass
        // helt ned til den smaleste iPhonen.
        <View style={styles.strip} testID="match-strip">
          {stripRows(strip).map((row, index) => (
            <View key={index} style={styles.stripRow} testID={`match-strip-row-${index + 1}`}>
              {row.map((cell) => (
                <View
                  key={cell.holeNumber}
                  style={[
                    styles.cell,
                    { borderColor: colors.border, backgroundColor: cellFill(cell.outcome, colors) },
                  ]}
                  testID={`match-strip-${cell.holeNumber}`}
                >
                  <Text style={[ui.num, styles.cellHole, { color: colors.muted }]}>
                    {cell.holeNumber}
                  </Text>
                  <Text
                    style={[
                      ui.num,
                      styles.cellOutcome,
                      { color: cellInk(cell.outcome, colors) },
                    ]}
                  >
                    {cell.outcome}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
      <Text style={ui.muted}>
        W = {side1Name} tok hullet · L = {side2Name} tok hullet · T = delt
      </Text>
    </View>
  );
}

/** Ni ruter per rad, i hull-rekkefølge. Et 9-hullsspill blir én rad. */
const CELLS_PER_ROW = 9;

function stripRows(strip: readonly StripCell[]): StripCell[][] {
  const rows: StripCell[][] = [];
  for (let start = 0; start < strip.length; start += CELLS_PER_ROW) {
    rows.push(strip.slice(start, start + CELLS_PER_ROW));
  }
  return rows;
}

/** Et uspilt hull er bare en ramme på bakgrunnen, som webbens tomme ruter. */
function cellFill(outcome: StripOutcome, colors: ThemeColors): string {
  if (outcome === 'W') return colors.accent;
  if (outcome === 'L') return colors.surface;
  return colors.bg;
}

function cellInk(outcome: StripOutcome, colors: ThemeColors): string {
  // Vunne hull er gull-fylte, og blekket på gull er mørkt i begge palettene.
  if (outcome === 'W') return colors.onAccent;
  if (outcome === '—') return colors.muted;
  return colors.text;
}

const styles = StyleSheet.create({
  sideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  // #1842: without a flex basis the two names kept their intrinsic width, so a
  // long pair label ("Test Spiller & Bjørn Bunkersen") ran past the card and the
  // opponent was clipped on the right. `flex: 1` lets both names shrink and wrap
  // over several lines; no `numberOfLines`, because the whole name must stay
  // readable. Note that flexBasis 0% splits the row 50/50, so «mot» sits mid-row
  // even when one side's name is much shorter — accepted.
  sideName: { flex: 1 },
  // «mot» is the only fixed part of the row: never squeezed out between two long
  // names.
  versus: { flexShrink: 0 },
  sideRight: { textAlign: 'right' },
  // Egen familie, ikke `fontWeight` — expo-font velger snitt på familienavn.
  leading: { fontFamily: FONTS.sansBold },
  strip: { gap: 4, paddingVertical: 8 },
  stripRow: { flexDirection: 'row', gap: 4 },
  // `flex: 1`, ikke en fast bredde: ni ruter deler radens bredde likt på alle
  // skjermer. På iPhone SE (320 pt) blir hver rute ca. 27 pt, nok til «18» og
  // én fet bokstav. Rutene kan ikke trykkes på, så 44 pt-kravet gjelder ikke.
  cell: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  cellHole: { fontSize: 11 },
  cellOutcome: { fontSize: 15, fontFamily: FONTS.sansBold },
});
