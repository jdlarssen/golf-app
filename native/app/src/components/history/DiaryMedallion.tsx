// #2265: plassen til høyre på en rad i Rundedagboka, som designlerretet
// (`Historikk-forslag`) tegner den: en medaljong på 24 pt med tallet og «av 8»
// ved siden av. Selve medaljongen er `RankMedal` (#2700), som sideturneringen
// også bruker.
//
// Matchplay har ingen plass: resultatet står i ord («Du vant 3&2») i samme
// stil som «av 8». Hele raden har én etikett (`diaryRowLabel`), så alt her er
// skjult for skjermleseren.
import { StyleSheet, Text, View } from 'react-native';
import type { DiaryResult } from '../../lib/roundDiary';
import { fieldSizeShort } from '../../lib/historyCopy';
import { FONTS, useTheme } from '../../theme';
import { RankMedal } from '../RankMedal';

export function DiaryMedallion({ result, testID }: { result: DiaryResult; testID?: string }) {
  const { colors } = useTheme();
  if (result.kind === 'text') {
    return (
      <View style={styles.cluster} testID={testID}>
        <Text style={[styles.field, { color: colors.muted }]}>{result.text}</Text>
      </View>
    );
  }
  return (
    <View style={styles.cluster} testID={testID}>
      <RankMedal
        rank={result.rank}
        medal={result.medal}
        testID={testID ? `${testID}-${result.medal ?? 'ring'}` : undefined}
      />
      <Text style={[styles.field, { color: colors.muted }]}>{fieldSizeShort(result.fieldSize)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cluster: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  field: { fontSize: 12, fontFamily: FONTS.sans },
});
