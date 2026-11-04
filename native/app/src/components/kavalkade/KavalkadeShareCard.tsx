// #2265 PR 2: deleversjonen av et kavalkade-kort, det bildet «Del kortet»
// sender. Oppsettet er webbens PNG-rute
// (`app/[locale]/kavalkade/[year]/card/[kind]/route.tsx`) i en tredjedel av
// størrelsen: kortet er 360 pt bredt, og telefonens 3x gir de 1080 pikslene
// webben tegner. Hvert mål under er rutas pikseltall delt på telefonens skala,
// så bildet blir 1080 piksler bredt også på en 2x-telefon (view-shot tar
// bildet i telefonens skala).
//
// Innholdet kommer fra `buildKavalkadeCardModel`, som på webben, og bredden og
// høyden fra `cardImageLayout.ts`. Fargene er merkepaletten for bilder
// (`lib/og/palette.ts`), som ikke bytter med drakten. Webben tegner med
// Satori og Googles statiske Fraunces, som har optisk størrelse 14; appen
// bruker derfor snittene for 14 pt i rutas størrelser.
import { StyleSheet, Text, View } from 'react-native';
import {
  KAVALKADE_CARD_IMAGE_WIDTH,
  computeCardHeight,
  heroFontSize,
} from '../../../../../lib/kavalkade/cardImageLayout';
import type { KavalkadeCardModel } from '../../../../../lib/kavalkade/cardModel';
import {
  CHAMP,
  CHAMP_DARK,
  CHAMP_PILL,
  CHAMP_TINT,
  FOREST,
  HAIRLINE,
  LINEN,
  MUTED,
  ROW_HAIRLINE,
  TAUPE,
} from '../../../../../lib/og/palette';
import { KAVALKADE_SHARE_TEXT } from '../../lib/kavalkadeCopy';
import { FONTS, frauncesFamily } from '../../theme';
import { ShareWordmark, cardPx as px, satoriLine } from '../ShareCardParts';

/** Bildets bredde i punkter. */
export const SHARE_CARD_WIDTH = px(KAVALKADE_CARD_IMAGE_WIDTH);

export function KavalkadeShareCard({ model }: { model: KavalkadeCardModel }) {
  const heroSize = heroFontSize(model.hero.value);
  return (
    <View style={[styles.card, { height: px(computeCardHeight(model)) }]} testID={`kavalkade-share-${model.kind}`}>
      <View style={styles.header}>
        <ShareWordmark size={56} weight={500} color={FOREST} />
        <View style={styles.pill}>
          <Text style={styles.eyebrow}>{model.eyebrow}</Text>
        </View>
      </View>

      <Text style={styles.title}>{model.title}</Text>

      <View style={styles.rule} />

      <View style={styles.hero}>
        <Text style={[styles.heroValue, satoriLine(heroSize, heroSize * 1.06, true)]}>
          {model.hero.value}
        </Text>
        {model.hero.caption ? <Text style={styles.caption}>{model.hero.caption}</Text> : null}
      </View>

      {model.lines.map((line, index) => (
        <View key={index} style={styles.line}>
          <Text style={styles.lineLabel}>{line.label}</Text>
          <Text style={styles.lineValue}>{line.value}</Text>
        </View>
      ))}

      <View style={styles.footer}>
        <View style={styles.footerRule} />
        <Text style={styles.site}>tornygolf.no</Text>
        <Text style={styles.tagline}>{KAVALKADE_SHARE_TEXT.tagline}</Text>
      </View>
    </View>
  );
}

const TITLE = satoriLine(64, 64 * 1.12, true);

const styles = StyleSheet.create({
  card: { width: SHARE_CARD_WIDTH, backgroundColor: LINEN, padding: px(72) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: {
    backgroundColor: CHAMP_PILL,
    borderRadius: 999,
    paddingVertical: px(12),
    paddingHorizontal: px(28),
  },
  eyebrow: { fontFamily: FONTS.sans, fontSize: px(28), color: CHAMP_DARK },
  title: { ...TITLE, fontFamily: frauncesFamily(600, 14), color: FOREST, marginTop: TITLE.marginTop + px(36) },
  rule: { height: px(2), backgroundColor: HAIRLINE, marginTop: px(32), marginBottom: px(8) },
  hero: {
    backgroundColor: CHAMP_TINT,
    borderWidth: px(2),
    borderColor: HAIRLINE,
    borderRadius: px(32),
    paddingVertical: px(56),
    paddingHorizontal: px(48),
  },
  heroValue: { fontFamily: frauncesFamily(600, 14), color: FOREST },
  caption: { fontFamily: FONTS.sans, fontSize: px(34), color: CHAMP_DARK, marginTop: px(16) },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: px(26),
    borderBottomWidth: px(2),
    borderBottomColor: ROW_HAIRLINE,
  },
  lineLabel: { flex: 1, fontFamily: FONTS.sans, fontSize: px(34), color: MUTED },
  lineValue: { fontFamily: FONTS.sansMedium, fontSize: px(36), color: TAUPE },
  footer: { marginTop: 'auto', alignItems: 'center' },
  footerRule: { alignSelf: 'stretch', height: px(2), backgroundColor: HAIRLINE, marginBottom: px(24) },
  site: { fontFamily: frauncesFamily(500, 14), fontSize: px(34), color: FOREST },
  tagline: { fontFamily: FONTS.sans, fontSize: px(26), color: '#8C8475', marginTop: px(8) },
});
