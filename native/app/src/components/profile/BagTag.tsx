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
      style={[
        styles.card,
        { backgroundColor: colors.surfaceStrong, shadowColor: colors.surfaceStrong },
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
          <View
            accessible
            accessibilityLabel={`${PROFILE_TEXT.handicapLabel} ${model.hcpText ?? PROFILE_TEXT.hcpNotSetSpoken}`}
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

const RING = 52;
/** Linjehøyden til det store handicaptallet (64 pt i Fraunces). */
const HCP_LINE = 62;

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
  hcpBlock: { alignSelf: 'flex-start' },
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
