// #2256: bag-taggen — det skoggrønne, litt skrå kortet øverst i profilen.
//
// Kortet tegner bare det `bagTagModel` svarer (`lib/bagTag.ts`); det regner
// ingenting selv.
//
// **Drakten følger designlerretet** (eierens retning 29.09). Flaten er
// `surfaceStrong` og teksten `onStrong` i begge draktene: skogen er mørk i lys
// og mørk modus, så blekket oppå er lyst i begge. Klubben står i gull, og
// initialringen har gull kant. Øverst er en stanset spalte for stroppen, og
// kortet har en skogfarget skygge. Skråstillingen er statisk (ingen animasjon),
// og den flytter ingenting i layouten: `transform` tegnes etter at plassen er
// regnet ut.
//
// **Skjermleseren.** Navnet er sidens overskrift. Spalten og ringen er pynt og
// skjult. Handicapet leses som én setning («Handicap 14,2»), og påminnelsen
// om et gammelt handicap er en knapp til skjemaet, med minst 44 pt å treffe.
//
// **Høyden står mens raden lastes (#1973).** Uten modell tegnes samme kort
// med tomme linjer. Hver linje har fast `lineHeight` og `minHeight`, så kortet
// ikke hopper når navnet og handicapet kommer.
//
// **Handicap-kurven** (0195) står til høyre for tallet når sesongen har minst
// to punkter, med «−2,6 denne sesongen» på linja under. Uten kurve står
// «Oppdatert …» der, som før. Linja har samme høyde i alle tilstander, og mens
// kurven lastes står den tom, så teksten ikke bytter foran øynene på deg.
// Påminnelsen om et gammelt handicap vinner alltid: den er en knapp.
//
// **Deleversjonen** (`variant="share"`, #2256 PR 3) er kortet slik det blir
// som bilde: rett (ingen skråstilling eller skygge), uten knapper og uten
// «Oppdatert …», med endringen i sesongen når kurven står, og ordmerket
// «Tørny» nederst. Drakten velges av den som tegner den (`ShareBagTagButton`
// pakker den i lys drakt).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import type { HandicapTrend } from '../../../../../lib/stats/handicapTrend';
import type { BagTagModel } from '../../lib/bagTag';
import {
  PROFILE_TEXT,
  handicapSeasonChange,
  handicapSeasonChangeSpoken,
} from '../../lib/profileCopy';
import { FONTS, TAP, useTheme } from '../../theme';

export interface BagTagProps {
  /** `null` mens profilraden lastes, eller når den ikke kunne leses. */
  model: BagTagModel | null;
  /**
   * Navnet kortet viser uten modell. Tomt mens raden lastes (#1973); når
   * lesingen feilet, sender profilen e-posten, det ærligste den har.
   */
  placeholderName?: string;
  /** Åpner skjemaet — fra «Sett handicap» og fra påminnelsen om et gammelt handicap. */
  onEditProfile: () => void;
  /**
   * Sesongens handicap-kurve. `'loading'` mens den lastes, `null` når det
   * ikke er noen (under to punkter, eller lesingen feilet).
   */
  trend?: HandicapTrend | null | 'loading';
  /** `share` = bildet som deles (se toppen av fila). */
  variant?: 'profile' | 'share';
}

export function BagTag({
  model,
  placeholderName = '',
  onEditProfile,
  trend = null,
  variant = 'profile',
}: BagTagProps) {
  const share = variant === 'share';
  const { colors } = useTheme();
  const ink = { color: colors.onStrong };
  const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;
  // Kurven hører til et handicap som står; uten tall er det ingenting å tegne.
  const curve = model?.hcpText && trend && trend !== 'loading' ? trend : null;

  return (
    <View
      testID="bag-tag"
      style={[
        styles.card,
        { backgroundColor: colors.surfaceStrong, shadowColor: colors.surfaceStrong },
        share ? styles.shareCard : null,
      ]}
    >
      <View {...hidden} style={[styles.slot, { backgroundColor: colors.bg }]} />

      <View style={styles.topRow}>
        <View style={styles.identity}>
          <Text
            style={[styles.kicker, { color: colors.accent }]}
            numberOfLines={1}
            testID="bag-tag-kicker"
          >
            {model?.kicker ?? ''}
          </Text>
          <Text
            accessibilityRole="header"
            style={[styles.name, ink]}
            numberOfLines={2}
            testID="profile-name"
          >
            {model?.name ?? placeholderName}
          </Text>
          <Text style={[styles.subline, ink]} testID="bag-tag-subline">
            {model?.subline ?? ''}
          </Text>
        </View>
        <View {...hidden} style={[styles.ring, { borderColor: `${colors.accent}B3` }]}>
          <Text style={[styles.initials, ink]}>{model?.initials ?? ''}</Text>
        </View>
      </View>

      <View style={styles.hcpBlock}>
        {model ? (
          <View style={styles.hcpRow}>
            <View
              accessible
              accessibilityLabel={
                `${PROFILE_TEXT.handicapLabel} ${model.hcpText ?? PROFILE_TEXT.hcpNotSetSpoken}` +
                (curve ? `, ${handicapSeasonChangeSpoken(curve.change)}` : '')
              }
              testID="profile-hcp"
            >
              <Text style={[styles.hcpLabel, ink]}>{PROFILE_TEXT.handicapLabel}</Text>
              <Text style={[styles.hcpValue, ink]} testID="profile-hcp-value">
                {model.hcpText ?? '–'}
              </Text>
            </View>
            {curve ? <HandicapCurve points={curve.points} /> : null}
          </View>
        ) : (
          <View style={styles.hcpPlaceholder} />
        )}
        {model && !share ? (
          <HandicapAge model={model} trend={model.hcpText ? trend : null} onEditProfile={onEditProfile} />
        ) : null}
        {share && curve ? (
          <Text style={[styles.age, styles.change, ink]} testID="share-hcp-change">
            {handicapSeasonChange(curve.change)}
          </Text>
        ) : null}
      </View>

      {share ? (
        <Text style={[styles.wordmark, ink]} testID="share-wordmark">
          {PROFILE_TEXT.shareWordmark}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Linja under handicapet: «−2,6 denne sesongen» når kurven står, ellers
 * «Oppdatert 26. sep», eller en knapp til skjemaet — «Ikke oppdatert på over
 * en måned» når tallet er gammelt, «Sett handicap» når profilen aldri ble
 * fullført (#1979). Tom, men like høy, mens kurven lastes.
 */
function HandicapAge({
  model,
  trend,
  onEditProfile,
}: {
  model: BagTagModel;
  trend: HandicapTrend | null | 'loading';
  onEditProfile: () => void;
}) {
  const { colors } = useTheme();
  const ink = { color: colors.onStrong };

  if (model.hcpAge && !model.hcpAge.stale) {
    // Samme høyde som knappen under, så kortet er like høyt i alle tilstander.
    // Kurven er lest i ord i handicapet over, så linja er skjult for skjermleseren.
    if (trend === 'loading') return <View style={styles.ageLine} />;
    if (trend) {
      return (
        <View
          style={styles.ageLine}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={[styles.age, styles.change, ink]} testID="profile-hcp-change">
            {handicapSeasonChange(trend.change)}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.ageLine}>
        <Text style={[styles.age, ink]} testID="profile-hcp-age">
          {model.hcpAge.text}
        </Text>
      </View>
    );
  }

  const label = model.hcpAge ? model.hcpAge.text : PROFILE_TEXT.setHandicap;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onEditProfile}
      style={styles.ageLink}
      testID={model.hcpAge ? 'profile-hcp-age' : 'profile-set-handicap'}
    >
      <Text style={[styles.age, styles.ageLinkText, ink]}>{label}</Text>
    </Pressable>
  );
}

const CURVE_WIDTH = 132;
const CURVE_HEIGHT = 44;
const CURVE_PAD = 4;

/**
 * Sesongens handicap som en linje, eldste til venstre. Et lavere handicap står
 * lavere, så en god sesong går nedover mot høyre, som i designet. Pynt: tallet
 * og endringen leses i ord.
 */
function HandicapCurve({ points }: { points: readonly number[] }) {
  const { colors } = useTheme();
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min;
  const innerW = CURVE_WIDTH - CURVE_PAD * 2;
  const innerH = CURVE_HEIGHT - CURVE_PAD * 2;
  const xy = points.map((value, index) => ({
    x: CURVE_PAD + (index / (points.length - 1)) * innerW,
    // Flat sesong (samme verdi hele veien): linja står midt i feltet.
    y: CURVE_PAD + (span === 0 ? innerH / 2 : ((max - value) / span) * innerH),
  }));
  const last = xy[xy.length - 1];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.curve}
      testID="profile-hcp-curve"
    >
      <Svg width={CURVE_WIDTH} height={CURVE_HEIGHT}>
        <Polyline
          points={xy.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={colors.onStrong}
          strokeOpacity={0.6}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={last.x} cy={last.y} r={3.5} fill={colors.onStrong} />
      </Svg>
    </View>
  );
}

const RING = 52;
/**
 * Linjehøyden til det store handicaptallet (64 pt i Fraunces). Under
 * skriftstørrelsen tegner iOS sifrene opp over «HANDICAP» (sett i
 * simulatoren); 72 gir luften designet har mellom etiketten og tallet.
 */
const HCP_LINE = 72;

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22,
    gap: 14,
    // Designet står 28 pt fra kanten; skjermen har alt 20.
    marginHorizontal: 8,
    // Luft til skråstillingen og skyggen.
    marginVertical: 16,
    shadowOpacity: 0.22,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 14 },
    transform: [{ rotate: '-1.5deg' }],
  },
  // Bildet: rett, uten skygge og uten luft rundt, så kortet fyller bildet.
  shareCard: {
    transform: [],
    marginHorizontal: 0,
    marginVertical: 0,
    shadowOpacity: 0,
  },
  wordmark: { alignSelf: 'flex-end', fontSize: 18, fontFamily: FONTS.serifDisplay, opacity: 0.85 },
  // Den stansede spalten viser sidens bakgrunn gjennom kortet.
  slot: { alignSelf: 'center', width: 44, height: 14, borderRadius: 7 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  identity: { flexShrink: 1 },
  kicker: {
    fontSize: 11,
    lineHeight: 14,
    minHeight: 14,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  name: { fontSize: 28, lineHeight: 32, minHeight: 32, fontFamily: FONTS.serifDisplay, marginTop: 6 },
  subline: { fontSize: 12, lineHeight: 17, minHeight: 17, fontFamily: FONTS.sans, opacity: 0.85, marginTop: 2 },
  hcpBlock: { alignSelf: 'stretch' },
  hcpRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  // Kurven står midt på sifrene, ikke på grunnlinja under kommaet.
  curve: { marginBottom: 14 },
  change: { alignSelf: 'flex-end', fontVariant: ['tabular-nums'] },
  hcpLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  hcpValue: {
    fontSize: 64,
    lineHeight: HCP_LINE,
    fontFamily: FONTS.serifScore,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  // Samme høyde som etikett + tall + linja under, så kortet står stille.
  hcpPlaceholder: { height: 14 + HCP_LINE + TAP },
  age: { fontSize: 13, lineHeight: 18, fontFamily: FONTS.sans, opacity: 0.9 },
  ageLine: { minHeight: TAP, justifyContent: 'center' },
  ageLink: { minHeight: TAP, justifyContent: 'center', alignSelf: 'flex-start' },
  ageLinkText: { fontFamily: FONTS.sansMedium, textDecorationLine: 'underline', opacity: 1 },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 18, fontFamily: FONTS.serifDisplay },
});
