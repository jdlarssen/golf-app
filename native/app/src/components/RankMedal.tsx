// #2700: plassmedaljen på 24 pt, flyttet ut av `DiaryMedallion` (#2265) så
// Rundedagboka og sideturneringen tegner den samme. Designlerretet
// (`Historikk-forslag`): gull, sølv og bronse med tallet på metallet, og fra
// plass 4 en ring i `border` uten fyll, med tallet i `text`.
//
// Metallene er like i begge drakter (designet), og hentes ikke fra webbens
// `Medallion.tsx`: gull er flat #C9A961, sølv en radial fra hvitt til
// #CFC9BD med en innfelt ring (60 % av #9A9180), og bronse en radial fra
// #E8C3A4 til #B07C52. Tallet på metallet er mørk skog i begge drakter.
import { StyleSheet, Text, View } from 'react-native';
import type { DiaryMedal } from '../lib/roundDiary';
import { centeredLineTop, fraunces, frauncesNormalLine, useTheme } from '../theme';
import { MedalDisc } from './icons/Icons';

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

export function RankMedal({
  rank,
  medal,
  testID,
}: {
  rank: number;
  /** `null` gir ringen uten fyll. */
  medal: DiaryMedal | null;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.medal, medal ? null : [styles.ring, { borderColor: colors.border }]]}
      testID={testID}
    >
      {medal ? <Metal medal={medal} /> : null}
      <Text style={[styles.rank, { color: medal ? METAL.ink : colors.text }]}>{rank}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
