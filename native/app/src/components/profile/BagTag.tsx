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
// to punkter, med «−2,6 denne sesongen» rett under, nederst til høyre i samme
// rad som tallet (Profil v2, som i designet). Uten kurve står «Oppdatert …» på
// samme plass. Mens kurven lastes står plassen tom, så teksten ikke bytter
// foran øynene på deg. Påminnelsen om et gammelt handicap vinner alltid: den
// er en knapp, med 44 pt å treffe. Raden er like høy i alle tilstander, fordi
// tallet til venstre bestemmer høyden.
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
import { FONTS, useTheme } from '../../theme';

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
  // Deleversjonen står skjult i samme tre som profilens kort; uten egne
  // test-ID-er finnes hver ID én gang.
  const tid = (id: string) => (share ? undefined : id);
  const { colors } = useTheme();
  const ink = { color: colors.onStrong };
  // Etiketten og initialene står i den varme kremen, navnet og tallet i
  // `onStrong`, som i designet.
  const warm = { color: colors.onStrongWarm };
  const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;
  // Kurven hører til et handicap som står; uten tall er det ingenting å tegne.
  const curve = model?.hcpText && trend && trend !== 'loading' ? trend : null;

  return (
    <View
      testID={tid('bag-tag')}
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
            testID={tid('bag-tag-kicker')}
          >
            {model?.kicker ?? ''}
          </Text>
          <Text
            accessibilityRole="header"
            style={[styles.name, ink]}
            numberOfLines={2}
            testID={tid('profile-name')}
          >
            {model?.name ?? placeholderName}
          </Text>
          <Text style={[styles.subline, ink]} testID={tid('bag-tag-subline')}>
            {model?.subline ?? ''}
          </Text>
        </View>
        <View {...hidden} style={[styles.ring, { borderColor: `${colors.accent}B3` }]}>
          <Text style={[styles.initials, warm]}>{model?.initials ?? ''}</Text>
        </View>
      </View>

      {model ? (
        <View style={styles.hcpRow}>
          <View
            accessible
            accessibilityLabel={
              `${PROFILE_TEXT.handicapLabel} ${model.hcpText ?? PROFILE_TEXT.hcpNotSetSpoken}` +
              (curve ? `, ${handicapSeasonChangeSpoken(curve.change)}` : '')
            }
            testID={tid('profile-hcp')}
          >
            <Text style={[styles.hcpLabel, warm]}>{PROFILE_TEXT.handicapLabel}</Text>
            <Text style={[styles.hcpValue, ink]} testID={tid('profile-hcp-value')}>
              {model.hcpText ?? '–'}
            </Text>
          </View>
          <View style={styles.hcpSide}>
            {curve ? <HandicapCurve points={curve.points} testID={tid('profile-hcp-curve')} /> : null}
            {share ? (
              // Som linja på skjermen: ved et gammelt handicap står påminnelsen
              // der, ikke endringen, så bildet viser heller ingen endring.
              curve && !model.hcpAge?.stale ? (
                <Text style={[styles.side, ink]} testID="share-hcp-change">
                  {handicapSeasonChange(curve.change)}
                </Text>
              ) : null
            ) : (
              <HandicapAge model={model} trend={model.hcpText ? trend : null} onEditProfile={onEditProfile} />
            )}
          </View>
        </View>
      ) : (
        <View style={styles.hcpPlaceholder} />
      )}

      {share ? (
        <Text style={[styles.wordmark, ink]} testID="share-wordmark">
          {PROFILE_TEXT.shareWordmark}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Linja nederst til høyre for handicapet: «−2,6 denne sesongen» når kurven
 * står, ellers «Oppdatert 26. sep», eller en knapp til skjemaet — «Ikke
 * oppdatert på over en måned» når tallet er gammelt, «Sett handicap» når
 * profilen aldri ble fullført (#1979). Tom mens kurven lastes.
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
    if (trend === 'loading') return null;
    if (trend) {
      // Kurven er lest i ord i handicapet, så linja er skjult for skjermleseren.
      return (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.side, ink]}
          testID="profile-hcp-change"
        >
          {handicapSeasonChange(trend.change)}
        </Text>
      );
    }
    return (
      <Text style={[styles.side, ink]} testID="profile-hcp-age">
        {model.hcpAge.text}
      </Text>
    );
  }

  const label = model.hcpAge ? model.hcpAge.text : PROFILE_TEXT.setHandicap;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onEditProfile}
      // Linja er liten; trykkflaten er 44 pt høy uansett.
      hitSlop={SIDE_HIT_SLOP}
      testID={model.hcpAge ? 'profile-hcp-age' : 'profile-set-handicap'}
    >
      <Text style={[styles.side, styles.sideLink, ink]}>{label}</Text>
    </Pressable>
  );
}

/** Kurvefeltet i designet: 120 × 44, linja fra 8 til 36 pt ned, 2 pt inn fra kantene. */
const CURVE_WIDTH = 120;
const CURVE_HEIGHT = 44;
const CURVE_X = 2;
const CURVE_TOP = 8;
const CURVE_BOTTOM = 36;

/**
 * Sesongens handicap som en linje, eldste til venstre. Et lavere handicap står
 * lavere, så en god sesong går nedover mot høyre, som i designet. Streken er
 * salvie (`live`, samme salvie som ellers på skogflaten), og prikken i enden
 * er klippet mot feltets høyrekant, som i designet. Pynt: tallet og endringen
 * leses i ord.
 */
function HandicapCurve({ points, testID }: { points: readonly number[]; testID?: string }) {
  const { colors } = useTheme();
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min;
  const innerW = CURVE_WIDTH - CURVE_X * 2;
  const innerH = CURVE_BOTTOM - CURVE_TOP;
  const xy = points.map((value, index) => ({
    x: CURVE_X + (index / (points.length - 1)) * innerW,
    // Flat sesong (samme verdi hele veien): linja står midt i feltet.
    y: CURVE_TOP + (span === 0 ? innerH / 2 : ((max - value) / span) * innerH),
  }));
  const last = xy[xy.length - 1];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Svg width={CURVE_WIDTH} height={CURVE_HEIGHT}>
        <Polyline
          points={xy.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={colors.live}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={last.x} cy={last.y} r={4} fill={colors.onStrongWarm} />
      </Svg>
    </View>
  );
}

const SIDE_HIT_SLOP = { top: 16, bottom: 16, left: 8, right: 8 };

/** Ringen i designet: 52 pt innvendig pluss 1 pt kant på hver side. */
const RING = 54;
/**
 * Linjehøyden til det store handicaptallet (64 pt i Fraunces). iOS legger
 * luften over sifrene; 68 gir de 7 pt designet har mellom «HANDICAP» og
 * toppen av sifrene. Under skriftstørrelsen tegner iOS sifrene opp over
 * etiketten.
 */
const HCP_LINE = 68;
/**
 * Designets linjehøyde (0,95) lar kommaet stikke ut under boksen; iOS gir
 * plass til hele. Så mye trekkes fra under tallet, så raden, og kurven og
 * linja som står nederst i den, får designets høyde (målt i simulatoren).
 */
const HCP_OVERHANG = 7;

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22,
    gap: 14,
    // Profilen har 16 pt til kanten; designet har kortet 28 pt inn.
    marginHorizontal: 12,
    marginTop: 16,
    shadowOpacity: 0.22,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 14 },
    transform: [{ rotate: '-1.5deg' }],
    // Skyggen legger seg over toppen av flisene under, som i designet.
    zIndex: 1,
  },
  // Bildet: rett, uten skygge og uten luft rundt, så kortet fyller bildet.
  shareCard: {
    transform: [],
    marginHorizontal: 0,
    marginTop: 0,
    shadowOpacity: 0,
  },
  wordmark: { alignSelf: 'flex-end', fontSize: 18, fontFamily: FONTS.serifDisplay, opacity: 0.85 },
  // Den stansede spalten viser sidens bakgrunn gjennom kortet.
  slot: { alignSelf: 'center', width: 44, height: 14, borderRadius: 7 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  identity: { flexShrink: 1 },
  kicker: {
    fontSize: 10,
    lineHeight: 12,
    minHeight: 12,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  name: { fontSize: 28, lineHeight: 31, minHeight: 31, fontFamily: FONTS.serifDisplay, marginTop: 6 },
  subline: { fontSize: 12, lineHeight: 15, minHeight: 15, fontFamily: FONTS.sans, opacity: 0.85, marginTop: 2 },
  hcpRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  // Kurven øverst og linja under, nederst til høyre i raden.
  hcpSide: { flexShrink: 1, alignItems: 'flex-end', gap: 4 },
  side: { fontSize: 11, lineHeight: 13, fontFamily: FONTS.sans, opacity: 0.9, textAlign: 'right' },
  sideLink: { fontFamily: FONTS.sansMedium, textDecorationLine: 'underline', opacity: 1 },
  hcpLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  hcpValue: {
    fontSize: 64,
    lineHeight: HCP_LINE,
    marginBottom: -HCP_OVERHANG,
    fontFamily: FONTS.serifScore,
    // Designet er 64 pt Fraunces med optisk størrelse, som er smalere enn
    // appens faste snitt. Tettere sperring gir samme bredde på «14,2».
    letterSpacing: -3.2,
  },
  // Samme høyde som etikett + tall, så kortet står stille mens raden lastes.
  hcpPlaceholder: { height: 12 + HCP_LINE - HCP_OVERHANG },
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
