// #2265 PR 2: deleversjonen av et kavalkade-kort, det bildet «Del kortet»
// sender. Oppsettet er webbens PNG-rute
// (`app/[locale]/kavalkade/[year]/card/[kind]/route.tsx`) i en tredjedel av
// størrelsen: kortet er 360 pt bredt, og telefonens 3x gir de 1080 pikslene
// webben tegner. Hvert mål under er rutas pikseltall delt på 3.
//
// Innholdet kommer fra `buildKavalkadeCardModel`, som på webben, og bredden og
// høyden fra `cardImageLayout.ts`. Fargene er merkepaletten for bilder
// (`lib/og/palette.ts`), som ikke bytter med drakten. Webben tegner med
// Satori og Googles statiske Fraunces, som har optisk størrelse 14; appen
// bruker derfor snittene for 14 pt i rutas størrelser.
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import {
  BALL_CENTER_X_EM,
  BALL_DIAMETER_EM,
  BALL_SHADING_MIN_PX,
  T_CAP_HEIGHT_EM,
} from '../../../../../lib/brand/wordmarkBall';
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

/** Rutas piksler per punkt her. */
const SCALE = 3;
/** Bildets bredde i punkter. */
export const SHARE_CARD_WIDTH = KAVALKADE_CARD_IMAGE_WIDTH / SCALE;

const px = (value: number) => value / SCALE;

/** Satori sin grunnlinje i ordmerket (`lib/og/wordmark.tsx`). */
const SATORI_BASELINE_EM = 0.86;

/** Ordmerket «Tørny» med gullballen over T-en, som `OgWordmark`. */
function ShareWordmark({ fontSize }: { fontSize: number }) {
  const d = BALL_DIAMETER_EM * fontSize;
  const clearance = Math.max(0, BALL_DIAMETER_EM + T_CAP_HEIGHT_EM - SATORI_BASELINE_EM) * fontSize;
  const shaded = d * SCALE >= BALL_SHADING_MIN_PX;
  return (
    <View style={{ paddingTop: clearance }}>
      <Text style={[styles.wordmark, { fontSize, lineHeight: fontSize }]}>Tørny</Text>
      <Svg
        width={d}
        height={d}
        style={{
          position: 'absolute',
          left: (BALL_CENTER_X_EM - BALL_DIAMETER_EM / 2) * fontSize,
          top: clearance + (SATORI_BASELINE_EM - T_CAP_HEIGHT_EM) * fontSize - d,
        }}
      >
        <Defs>
          {/* `BALL_SHADING_CSS`: lys i 36 % / 30 %, borte ved 60 %. */}
          <RadialGradient id="ball" cx="36%" cy="30%" r="60%" fx="36%" fy="30%">
            <Stop offset="0" stopColor={LINEN} stopOpacity={0.55} />
            <Stop offset="1" stopColor={LINEN} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={d / 2} cy={d / 2} r={d / 2} fill={CHAMP} />
        {shaded ? <Circle cx={d / 2} cy={d / 2} r={d / 2} fill="url(#ball)" /> : null}
      </Svg>
    </View>
  );
}

export function KavalkadeShareCard({ model }: { model: KavalkadeCardModel }) {
  const heroSize = px(heroFontSize(model.hero.value));
  return (
    <View style={[styles.card, { height: px(computeCardHeight(model)) }]} testID={`kavalkade-share-${model.kind}`}>
      <View style={styles.header}>
        <ShareWordmark fontSize={px(56)} />
        <View style={styles.pill}>
          <Text style={styles.eyebrow}>{model.eyebrow}</Text>
        </View>
      </View>

      <Text style={styles.title}>{model.title}</Text>

      <View style={styles.rule} />

      <View style={styles.hero}>
        <Text style={[styles.heroValue, { fontSize: heroSize, lineHeight: heroSize * 1.06 }]}>
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

const styles = StyleSheet.create({
  card: { width: SHARE_CARD_WIDTH, backgroundColor: LINEN, padding: px(72) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { fontFamily: frauncesFamily(500, 14), color: FOREST },
  pill: {
    backgroundColor: CHAMP_PILL,
    borderRadius: 999,
    paddingVertical: px(12),
    paddingHorizontal: px(28),
  },
  eyebrow: { fontFamily: FONTS.sans, fontSize: px(28), color: CHAMP_DARK },
  title: {
    fontFamily: frauncesFamily(600, 14),
    fontSize: px(64),
    lineHeight: px(64) * 1.12,
    color: FOREST,
    marginTop: px(36),
  },
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
