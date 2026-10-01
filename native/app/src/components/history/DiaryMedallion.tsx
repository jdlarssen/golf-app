// #2265: plassen til høyre på en rad i Rundedagboka, som designlerretet
// (`Historikk-forslag`) tegner den: en medaljong på 24 pt med tallet og «av 8»
// ved siden av.
//
// Metallene er like i begge drakter (designet), og hentes ikke fra webbens
// `Medallion.tsx`: gull er flat #C9A961, sølv en radial fra hvitt til
// #CFC9BD med en innfelt ring (60 % av #9A9180), og bronse en radial fra
// #E8C3A4 til #B07C52. Tallet på metallet er mørk skog i begge drakter. Fra
// plass 4 står en ring i `border` uten fyll, med tallet i `text`.
//
// Matchplay har ingen plass: resultatet står i ord («Du vant 3&2») i samme
// stil som «av 8». Hele raden har én etikett (`diaryRowLabel`), så alt her er
// skjult for skjermleseren.
import { StyleSheet, Text, View } from 'react-native';
import type { DiaryMedal, DiaryResult } from '../../lib/roundDiary';
import { fieldSizeShort } from '../../lib/historyCopy';
import { FONTS, centeredLineTop, fraunces, frauncesNormalLine, useTheme } from '../../theme';
import { MedalDisc } from '../icons/Icons';

const SIZE = 24;
/** Fraunces 12 i nettleserens `normal`: 12 + 3 pt. */
const RANK_LINE = frauncesNormalLine(12);

/** Designets metaller, like i lys og mørk drakt. */
const METAL = {
  gold: '#C9A961',
  silverHighlight: '#FFFFFF',
  silverEdge: '#CFC9BD',
  silverRing: '#9A9180',
  bronzeHighlight: '#E8C3A4',
  bronzeEdge: '#B07C52',
  /** Tallet på metallet: designets #1A2E1F i begge drakter. */
  ink: '#1A2E1F',
} as const;

function Metal({ medal }: { medal: DiaryMedal }) {
  if (medal === 'gold') return <View style={[styles.disc, { backgroundColor: METAL.gold }]} />;
  return medal === 'silver' ? (
    <MedalDisc
      highlight={METAL.silverHighlight}
      edge={METAL.silverEdge}
      ring={METAL.silverRing}
      size={SIZE}
      gradientId="diary-silver"
    />
  ) : (
    <MedalDisc
      highlight={METAL.bronzeHighlight}
      edge={METAL.bronzeEdge}
      size={SIZE}
      gradientId="diary-bronze"
    />
  );
}

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
      <View
        style={[
          styles.medal,
          result.medal ? null : [styles.ring, { borderColor: colors.border }],
        ]}
        testID={testID ? `${testID}-${result.medal ?? 'ring'}` : undefined}
      >
        {result.medal ? <Metal medal={result.medal} /> : null}
        <Text style={[styles.rank, { color: result.medal ? METAL.ink : colors.text }]}>
          {result.rank}
        </Text>
      </View>
      <Text style={[styles.field, { color: colors.muted }]}>{fieldSizeShort(result.fieldSize)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cluster: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  // Tallet står der nettleseren midtstiller linja (`centeredLineTop`), ikke
  // der Yoga runder den: 15 pt linje i 24 pt, og i 22 pt innenfor ringens kant.
  medal: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    paddingTop: centeredLineTop(SIZE, RANK_LINE),
  },
  disc: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
  ring: { borderWidth: 1, paddingTop: centeredLineTop(SIZE - 2, RANK_LINE) },
  rank: fraunces(600, 12),
  field: { fontSize: 12, fontFamily: FONTS.sans },
});
