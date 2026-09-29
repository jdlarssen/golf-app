// #2256: bag-taggen — det skoggrønne, litt skrå kortet øverst i profilen.
//
// Kortet tegner bare det `bagTagModel` svarer (`lib/bagTag.ts`); det regner
// ingenting selv.
//
// **Drakten.** Flaten er `surfaceStrong` og teksten `onStrong` i begge
// draktene: skogen er mørk i lys og mørk modus, så blekket oppå er lyst i
// begge. Kickeren og initialringen er i samme lin; gull hører til seire-flisa.
// Skråstillingen er statisk (ingen animasjon), og den flytter ingenting i
// layouten: `transform` tegnes etter at plassen er regnet ut.
//
// **Skjermleseren.** Navnet er sidens overskrift. Hullet og ringen er pynt og
// skjult. Handicapet leses som én setning («Handicap 14,2»), og påminnelsen
// om et gammelt handicap er en knapp til skjemaet, med minst 44 pt å treffe.
//
// **Høyden står mens raden lastes (#1973).** Uten modell tegnes samme kort
// med tomme linjer. Hver linje har fast `lineHeight` og `minHeight`, så kortet
// ikke hopper når navnet og handicapet kommer.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BagTagModel } from '../../lib/bagTag';
import { PROFILE_TEXT } from '../../lib/profileCopy';
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
}

export function BagTag({ model, placeholderName = '', onEditProfile }: BagTagProps) {
  const { colors } = useTheme();
  const ink = { color: colors.onStrong };
  const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;

  return (
    <View
      testID="bag-tag"
      style={[styles.card, { backgroundColor: colors.surfaceStrong }]}
    >
      <View style={styles.topRow}>
        <View {...hidden} style={[styles.hole, { backgroundColor: colors.bg, borderColor: colors.onStrong }]} />
        <Text style={[styles.kicker, ink]} numberOfLines={1} testID="bag-tag-kicker">
          {model?.kicker ?? ''}
        </Text>
      </View>

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

      <View style={styles.bottomRow}>
        <View style={styles.hcpBlock}>
          {model ? (
            <View
              accessible
              accessibilityLabel={`${PROFILE_TEXT.handicapLabel} ${model.hcpText ?? '–'}`}
              testID="profile-hcp"
            >
              <Text style={[styles.hcpLabel, ink]}>{PROFILE_TEXT.handicapLabel}</Text>
              <Text style={[styles.hcpValue, ink]} testID="profile-hcp-value">
                {model.hcpText ?? '–'}
              </Text>
            </View>
          ) : (
            <View style={styles.hcpPlaceholder} />
          )}
          {model ? <HandicapAge model={model} onEditProfile={onEditProfile} /> : null}
        </View>
        <View {...hidden} style={[styles.ring, { borderColor: colors.onStrong }]}>
          <Text style={[styles.initials, ink]}>{model?.initials ?? ''}</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Linja under handicapet: «Oppdatert 26. sep», eller en knapp til skjemaet —
 * «Ikke oppdatert på over en måned» når tallet er gammelt, «Sett handicap»
 * når profilen aldri ble fullført (#1979).
 */
function HandicapAge({ model, onEditProfile }: { model: BagTagModel; onEditProfile: () => void }) {
  const { colors } = useTheme();
  const ink = { color: colors.onStrong };

  if (model.hcpAge && !model.hcpAge.stale) {
    // Samme høyde som knappen under, så kortet er like høyt i begge tilstander.
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

const RING = 64;

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 20,
    paddingTop: 16,
    gap: 4,
    // Luft til skråstillingen: hjørnene stikker et par punkter ut.
    marginVertical: 12,
    transform: [{ rotate: '-1.5deg' }],
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 20 },
  // Det stansede hullet viser sidens bakgrunn gjennom kortet.
  hole: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
  kicker: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  name: { fontSize: 24, lineHeight: 30, minHeight: 30, fontFamily: FONTS.serifScore, marginTop: 6 },
  subline: { fontSize: 14, lineHeight: 20, minHeight: 20, fontFamily: FONTS.sans, opacity: 0.9 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
  },
  hcpBlock: { flexShrink: 1 },
  hcpLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  hcpValue: {
    fontSize: 44,
    lineHeight: 52,
    fontFamily: FONTS.serifScore,
    fontVariant: ['tabular-nums'],
  },
  // Samme høyde som etikett + tall + linja under, så kortet står stille.
  hcpPlaceholder: { height: 16 + 52 + TAP },
  age: { fontSize: 14, lineHeight: 20, fontFamily: FONTS.sans },
  ageLine: { minHeight: TAP, justifyContent: 'center' },
  ageLink: { minHeight: TAP, justifyContent: 'center', alignSelf: 'flex-start' },
  ageLinkText: { fontFamily: FONTS.sansMedium, textDecorationLine: 'underline' },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  initials: { fontSize: 22, fontFamily: FONTS.serifDisplay },
});
