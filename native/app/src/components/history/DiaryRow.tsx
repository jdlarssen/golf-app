// #2265: én runde i Rundedagboka, som designlerretet (`Historikk-forslag`)
// tegner den: datoen til venstre (dagen i Fraunces over ukedagen), navnet og
// «Bane · Format · resultat» i midten, og plassen til høyre. Raden er minst
// 64 pt høy og åpner resultatlista.
//
// Skjermleseren leser hele raden som én setning (`diaryRowLabel`), så dato,
// tall og medaljong er skjult hver for seg.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { diaryResult, diaryRowLabel, diarySubline } from '../../lib/roundDiary';
import { formatDiaryDay } from '../../lib/homeDates';
import type { HistoryRound } from '../../lib/roundHistory';
import { FONTS, fraunces, interLine, useTheme } from '../../theme';
import { DiaryMedallion } from './DiaryMedallion';

export function DiaryRow({
  round,
  points,
  divider,
  onPress,
}: {
  round: HistoryRound;
  /** Poengene dine når formatet teller poeng; `undefined` til de er regnet. */
  points: number | null | undefined;
  /**
   * Skillelinja under raden, inne i de 64 punktene (designets
   * `border-bottom`). Ingen under siste rad i måneden.
   */
  divider: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const date = round.date ? new Date(round.date) : null;
  const day = date ? formatDiaryDay(date) : null;
  const result = diaryResult(round.resultSummary);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={diaryRowLabel(round, points)}
      style={[
        styles.row,
        divider ? [styles.divider, { borderBottomColor: colors.divider }] : null,
      ]}
      testID={`diary-row-${round.gameId}`}
    >
      <View style={styles.date}>
        {day ? (
          <>
            <Text style={[styles.day, { color: colors.text }]}>{day.day}</Text>
            <Text style={[styles.weekday, { color: colors.muted }]}>{day.weekday}</Text>
          </>
        ) : null}
      </View>
      <View style={styles.middle}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {round.name}
        </Text>
        <Text
          style={[styles.subline, { color: colors.muted }]}
          numberOfLines={1}
          testID={`diary-row-line-${round.gameId}`}
        >
          {diarySubline(round, points)}
        </Text>
      </View>
      {result ? <DiaryMedallion result={result} testID={`diary-result-${round.gameId}`} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 64,
  },
  divider: { borderBottomWidth: 1 },
  date: { width: 40, flexShrink: 0, alignItems: 'center' },
  // Designet: Fraunces 20/600 med `line-height: 1`, som nettleseren tegner den.
  day: fraunces(600, 20, 20),
  // Inter i nettleserens `normal`: 10 = 12 pt, 15 = 19 pt og 12 = 15 pt.
  weekday: { ...interLine(10, 12), fontFamily: FONTS.sansSemiBold, letterSpacing: 1.2 },
  middle: { flex: 1, minWidth: 0 },
  name: { ...interLine(15, 19), fontFamily: FONTS.sansSemiBold },
  subline: { ...interLine(12, 15), fontFamily: FONTS.sans },
});
