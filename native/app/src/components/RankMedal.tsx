// #2700: plassmedaljen på 24 pt, flyttet ut av `DiaryMedallion` (#2265) så
// Rundedagboka og sideturneringen tegner den samme. Designlerretet
// (`Historikk-forslag`): gull, sølv og bronse med tallet på metallet, og fra
// plass 4 en ring i `border` uten fyll, med tallet i `text`.
//
// #2259: Topplista tegner den på 28 pt (`size`), med tallet i Fraunces 14. Størrelsen er
// 24 uten `size`, så de to eldre flatene er uendret.
//
// Metallene er like i begge drakter (designet), og hentes ikke fra webbens
// `Medallion.tsx`: gull er flat #C9A961, sølv en radial fra hvitt til
// #CFC9BD med en innfelt ring (60 % av #9A9180), og bronse en radial fra
// #E8C3A4 til #B07C52. Tallet på metallet er mørk skog i begge drakter.
import { StyleSheet, Text, View } from 'react-native';
import type { DiaryMedal } from '../lib/roundDiary';
import { centeredLineTop, fraunces, frauncesNormalLine, useTheme } from '../theme';
import { MedalDisc } from './icons/Icons';

const DEFAULT_SIZE = 24;
/** Størrelsene designet tegner, og tallets Fraunces-størrelse i hver. */
const RANK_FONT: Readonly<Record<number, number>> = { 24: 12, 28: 14 };

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

function Metal({ medal, size }: { medal: DiaryMedal; size: number }) {
  if (medal === 'gold') {
    return <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2, backgroundColor: METAL.gold }]} />;
  }
  return medal === 'silver' ? (
    <MedalDisc
      highlight={METAL.silverHighlight}
      edge={METAL.silverEdge}
      ring={METAL.silverRing}
      size={size}
      gradientId="diary-silver"
    />
  ) : (
    <MedalDisc
      highlight={METAL.bronzeHighlight}
      edge={METAL.bronzeEdge}
      size={size}
      gradientId="diary-bronze"
    />
  );
}

export function RankMedal({
  rank,
  medal,
  size = DEFAULT_SIZE,
  testID,
}: {
  rank: number;
  /** `null` gir ringen uten fyll. */
  medal: DiaryMedal | null;
  /** 24 (Rundedagboka, sideturneringen) eller 28 (Topplista). */
  size?: 24 | 28;
  testID?: string;
}) {
  const { colors } = useTheme();
  const fontSize = RANK_FONT[size];
  const rankLine = frauncesNormalLine(fontSize);
  // Tallet står der nettleseren midtstiller linja (`centeredLineTop`), ikke
  // der Yoga runder den: linja i hele boksen, og i boksen innenfor ringens kant.
  return (
    <View
      style={[
        styles.medal,
        { width: size, height: size, borderRadius: size / 2, paddingTop: centeredLineTop(size, rankLine) },
        medal ? null : [styles.ring, { borderColor: colors.border, paddingTop: centeredLineTop(size - 2, rankLine) }],
      ]}
      testID={testID}
    >
      {medal ? <Metal medal={medal} size={size} /> : null}
      <Text style={[fraunces(600, fontSize), { color: medal ? METAL.ink : colors.text }]}>{rank}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  medal: { alignItems: 'center' },
  disc: { position: 'absolute' },
  ring: { borderWidth: 1 },
});
