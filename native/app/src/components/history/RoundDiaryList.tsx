// #2265: dagboka i Rundedagboka — rundene måned for måned, som designlerretet
// (`Historikk-forslag`) tegner dem.
//
// Over hver måned står navnet i små sperrede versaler («SEPTEMBER»), med
// årstallet når året ikke er det i undertittelen («SEPTEMBER 2025»). Hver
// måned er ett kort med 16 pt hjørner, og mellom radene går den varme
// skillelinja (`divider`, inne i radens 64 pt), ingen etter siste rad.
// Udaterte runder står sist under «UTEN DATO».
import { StyleSheet, Text, View } from 'react-native';
import { HISTORY_TEXT } from '../../lib/historyCopy';
import { diaryMonthLabel } from '../../lib/homeDates';
import type { DiaryMonth } from '../../lib/roundDiary';
import { useTheme } from '../../theme';
import { DiaryRow } from './DiaryRow';

export function RoundDiaryList({
  months,
  currentYear,
  points,
  onOpenRound,
}: {
  months: readonly DiaryMonth[];
  /** Året i undertittelen; månedene i det året står uten årstall. */
  currentYear: number | null;
  /** Poengene per spill, etter hvert som de er regnet. */
  points: ReadonlyMap<string, number | null>;
  onOpenRound: (gameId: string) => void;
}) {
  const { colors, ui } = useTheme();
  return (
    <View testID="round-diary-list">
      {months.map((month) => (
        <View key={month.key} testID={`diary-month-${month.key}`}>
          <Text accessibilityRole="header" style={[ui.kicker, styles.monthLabel]}>
            {month.year != null && month.month != null
              ? diaryMonthLabel(month.year, month.month, currentYear)
              : HISTORY_TEXT.undated}
          </Text>
          <View
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            {month.rounds.map((round, index) => (
              <DiaryRow
                key={round.gameId}
                round={round}
                points={points.get(round.gameId)}
                divider={index < month.rounds.length - 1}
                onPress={() => onOpenRound(round.gameId)}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  monthLabel: { paddingTop: 18, paddingHorizontal: 20, paddingBottom: 8 },
  card: { marginHorizontal: 16, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
});
