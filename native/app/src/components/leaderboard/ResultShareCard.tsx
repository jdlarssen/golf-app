// #2756: resultatkortet, det bildet «Del resultat» sender. Oppsettet er webbens
// PNG-rute (`app/[locale]/games/[id]/leaderboard/share-image/route.tsx`,
// tegningen `Resultatkort-forslag`) omregnet med telefonens skala, som
// `KavalkadeShareCard`: bildet blir 1080 piksler bredt uansett telefon.
//
// Bildet tegnes her og hentes ikke fra nettet, så delingen virker uten nett og
// trenger ingen ny tilgang til dataene (kontrakten, Design D). Modell, rader og
// overskrift er de samme som ruta leser; bare pikslene finnes to steder.
//
// Fargene er merkepaletten for bilder, som ikke bytter med drakten, og teksten
// følger ikke telefonens tekststørrelse: bildet er det samme for alle.
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  ACCENT_ON_STRONG,
  CHAMP,
  FOREST,
  HILL_FAR,
  HILL_NEAR,
  MEDAL_INK,
  ON_STRONG,
} from '../../../../../lib/og/palette';
import { SHARE_CARD_WIDTH } from '../../../../../lib/og/shareCardLayout';
import type { Word } from '../../../../../lib/og/shareCardHeadline';
import type { CardRow } from '../../../../../lib/og/shareCardRows';
import { RESULT_CARD_TEXT } from '../../lib/resultCardCopy';
import type { ResultCardModel } from '../../lib/resultHero';
import { FONTS, frauncesFamily } from '../../theme';
import { ShareWordmark, cardPx as px, satoriLine } from '../ShareCardParts';
import { Medal } from './Medal';

const MUTED = 'rgba(236,229,210,0.8)';
const META = 'rgba(236,229,210,0.85)';
/** Overskriftens snitt i ruta: optisk størrelse 60, og standardsnittets kursiv. */
const HEADLINE_FONT = 'Fraunces500O60';
const HEADLINE_ITALIC = 'FrauncesItalic500O14';
/** Plass under overskriftens linje til halen på kursiv «g», i rutas piksler. */
const DESCENDER_ROOM = 24;

/** Ord for ord, som Satori: hvert ord er sin egen boks, med mellomrommet som `gap`. */
function WordLine({
  words,
  gap,
  lineStyle,
  goldStyle,
  wrap = true,
}: {
  words: Word[];
  gap: number;
  lineStyle: object;
  goldStyle: object;
  /** Bunnlinja står på én linje: Android brakk den selv om det var plass. */
  wrap?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: wrap ? 'wrap' : 'nowrap', columnGap: gap }}>
      {words.map((word, index) => (
        <Text key={index} allowFontScaling={false} style={[lineStyle, word.gold ? goldStyle : null]}>
          {word.text}
        </Text>
      ))}
    </View>
  );
}

function Row({ row }: { row: CardRow }) {
  const winnerDisc = row.winner || row.rank === null;
  return (
    <View style={[styles.row, row.winner ? styles.rowWinner : styles.rowPlain]} testID="result-card-row">
      {row.rank !== null ? (
        <View style={styles.medalBox}>
          {row.winner || row.rank === 1 ? (
            <View
              style={[
                styles.disc,
                // Plass 1 uten vinner (ingen tok et skin): en rolig skive, ikke gull.
                { backgroundColor: row.winner ? CHAMP : 'rgba(236,229,210,0.18)' },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.medalText, { color: winnerDisc ? MEDAL_INK : ON_STRONG }]}
              >
                {row.rank}
              </Text>
            </View>
          ) : (
            <Medal
              rank={row.rank === 2 ? 2 : 3}
              size={px(76)}
              label={String(row.rank)}
              labelStyle={styles.medalText}
              allowFontScaling={false}
            />
          )}
        </View>
      ) : null}
      <Text allowFontScaling={false} style={styles.name}>
        {row.name}
      </Text>
      {row.figure !== null ? (
        <Text
          allowFontScaling={false}
          style={[styles.figure, { color: row.winner ? ACCENT_ON_STRONG : ON_STRONG }]}
        >
          {row.figure}
        </Text>
      ) : null}
    </View>
  );
}

export function ResultShareCard({ card }: { card: ResultCardModel }) {
  const size = card.headline.fontSize;
  const line = satoriLine(size, size * 1.02, true);
  const headlineLine = {
    ...line,
    // Halen på kursiv «g» går under linjeboksen, og Android klipper teksten der.
    paddingBottom: px(DESCENDER_ROOM),
    marginBottom: line.marginBottom - px(DESCENDER_ROOM),
    fontFamily: HEADLINE_FONT,
    color: ON_STRONG,
  };
  return (
    <View style={[styles.card, { height: px(card.height) }]} testID="result-share-card">
      {/* De to åsene langs bunnen, tegningens stier i full størrelse. */}
      <Svg
        width={px(SHARE_CARD_WIDTH)}
        height={px(1350)}
        viewBox="0 0 540 675"
        style={styles.hills}
      >
        <Path
          d="M-40 560 C 120 500, 260 620, 420 540 S 600 520, 620 560 L620 700 L-40 700 Z"
          fill={HILL_FAR}
        />
        <Path
          d="M-40 610 C 140 570, 300 660, 460 600 S 620 590, 640 620 L640 700 L-40 700 Z"
          fill={HILL_NEAR}
        />
      </Svg>

      <View style={styles.header}>
        <ShareWordmark size={44} weight={600} color={ON_STRONG} />
        <Text allowFontScaling={false} style={styles.finalResult}>
          {RESULT_CARD_TEXT.finalResult}
        </Text>
      </View>

      <View style={styles.titles}>
        <Text allowFontScaling={false} style={styles.kicker} testID="result-card-kicker">
          {card.kicker}
        </Text>
        <View style={styles.headline} testID="result-card-headline">
          {card.headline.lines.map((words, index) => (
            <WordLine
              key={index}
              words={words}
              gap={px(Math.round(size * 0.22))}
              lineStyle={headlineLine}
              goldStyle={styles.gold}
            />
          ))}
        </View>
        <Text allowFontScaling={false} style={styles.meta} testID="result-card-meta">
          {card.meta}
        </Text>
      </View>

      {card.rows.length > 0 ? (
        <View style={styles.rows}>
          {card.rows.map((row, index) => (
            <Row key={index} row={row} />
          ))}
        </View>
      ) : null}

      <View style={styles.footer}>
        <WordLine
          words={card.tagline}
          gap={px(6)}
          lineStyle={styles.tagline}
          goldStyle={styles.taglineGold}
          wrap={false}
        />
        <Text allowFontScaling={false} style={styles.site}>
          tornygolf.no
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: px(SHARE_CARD_WIDTH),
    backgroundColor: FOREST,
    paddingVertical: px(68),
    paddingHorizontal: px(72),
    overflow: 'hidden',
  },
  hills: { position: 'absolute', left: 0, bottom: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: px(54),
  },
  finalResult: { fontFamily: FONTS.sansSemiBold, fontSize: px(24), color: MUTED },
  titles: { marginTop: px(68) },
  kicker: { fontFamily: FONTS.sansSemiBold, fontSize: px(26), color: MUTED },
  headline: { marginTop: px(20) },
  gold: { color: ACCENT_ON_STRONG, fontFamily: HEADLINE_ITALIC },
  meta: { fontFamily: FONTS.sans, fontSize: px(30), color: META, marginTop: px(20) },
  rows: { marginTop: px(60), gap: px(20) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: px(32),
    paddingVertical: px(24),
    paddingHorizontal: px(32),
  },
  rowWinner: {
    backgroundColor: 'rgba(236,229,210,0.1)',
    borderWidth: px(2),
    borderColor: 'rgba(201,169,97,0.7)',
  },
  rowPlain: { backgroundColor: 'rgba(236,229,210,0.06)' },
  medalBox: { marginRight: px(28) },
  disc: {
    width: px(76),
    height: px(76),
    borderRadius: px(38),
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: { ...satoriLine(36, 44), fontFamily: frauncesFamily(600, 14) },
  name: {
    ...satoriLine(48, 58),
    flex: 1,
    minWidth: 0,
    fontFamily: frauncesFamily(500, 14),
    color: ON_STRONG,
  },
  figure: { ...satoriLine(52, 63), marginLeft: px(28), fontFamily: frauncesFamily(600, 14) },
  footer: {
    marginTop: 'auto',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  tagline: { fontFamily: FONTS.sans, fontSize: px(26), color: MUTED },
  taglineGold: { color: ACCENT_ON_STRONG },
  site: { fontFamily: FONTS.sansSemiBold, fontSize: px(26), color: ON_STRONG },
});
