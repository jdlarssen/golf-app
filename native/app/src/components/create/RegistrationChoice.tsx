// native/app/src/components/create/RegistrationChoice.tsx
// #2840 del 4: «Hvordan får dere spillere?» øverst i spillersteget for en kompisrunde.
//
// Tegningen v3.1, «4. Påmeldingsvalget i «Opprett spill»» (rammene createTeam og
// createApproval), og nettets steg 4 (`PlayerSourceChoice` og `RegistrationSection`
// med `part="type"`):
//  - tre kort med tittel og en linje under,
//  - bryteren «Slipp venner direkte inn» inne i kortet «De ber om plass, jeg godkjenner»
//    når det er valgt,
//  - «Hva melder man på?» med Individuelt og Lag, bare for formater med lag,
//  - merknaden når arrangøren går av lista (`organiserStartsOnRoster`).
//
// Komponenten avgjør ingenting selv. Skjermen gir den valgene slik de lagres
// (`resolveRegistration`), og om merknaden skal stå.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RegistrationMode } from '../../../../../lib/games/registration';
import {
  REGISTRATION_MODE_CARDS,
  REGISTRATION_MODES,
  REGISTRATION_TEXT,
  REGISTRATION_TYPE_LABELS,
  REGISTRATION_TYPES,
  type AppRegistrationType,
} from '../../lib/registrationCopy';
import { FONTS, interLine, useTheme } from '../../theme';
import { DesignSwitch, listSwitchOffColor } from '../DesignSwitch';
import { Note } from './primitives';

export function RegistrationChoice({
  mode,
  type,
  letFriendsSkipGate,
  supportsTeams,
  organiserOffRoster,
  onMode,
  onType,
  onLetFriendsSkipGate,
}: {
  mode: RegistrationMode;
  type: AppRegistrationType;
  letFriendsSkipGate: boolean;
  /** `gameModeSupportsTeams` for det valgte formatet. Uten lag står ikke «Hva melder man på?». */
  supportsTeams: boolean;
  /** Arrangøren står ikke på lista (lagpåmelding via lenken). */
  organiserOffRoster: boolean;
  onMode: (mode: RegistrationMode) => void;
  onType: (type: AppRegistrationType) => void;
  onLetFriendsSkipGate: (value: boolean) => void;
}) {
  const { colors, scheme, ui } = useTheme();

  const cardStyle = (active: boolean) => [
    styles.card,
    active
      ? { backgroundColor: colors.primarySoft, borderColor: colors.primary, ...styles.cardActive }
      : { backgroundColor: colors.surface, borderColor: colors.border },
  ];

  return (
    <View testID="create-registration">
      <Text style={ui.title}>{REGISTRATION_TEXT.sourceTitle}</Text>

      <View style={styles.stack} accessibilityRole="radiogroup">
        {REGISTRATION_MODES.map((option) => {
          const active = option === mode;
          const card = REGISTRATION_MODE_CARDS[option];
          return (
            <View key={option} style={cardStyle(active)}>
              <Pressable
                testID={`create-registration-${option}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, checked: active }}
                accessibilityLabel={`${card.title}. ${card.hint}`}
                onPress={() => onMode(option)}
                style={styles.cardPress}
              >
                <Text style={[styles.cardTitle, { color: colors.text }]}>{card.title}</Text>
                <Text style={[styles.cardHint, { color: colors.muted }]}>{card.hint}</Text>
              </Pressable>
              {/* Tegningen: bryteren står inne i kortet når det er valgt, som
                  nettets innrykkede avkrysning. */}
              {option === 'manual_approval' && active ? (
                <View style={styles.toggle} testID="create-registration-friends">
                  <View style={styles.toggleText}>
                    <Text style={[styles.toggleTitle, { color: colors.text }]}>
                      {REGISTRATION_TEXT.friendsSkipTitle}
                    </Text>
                    <Text style={[styles.cardHint, { color: colors.muted }]}>
                      {REGISTRATION_TEXT.friendsSkipHint}
                    </Text>
                  </View>
                  <DesignSwitch
                    testID="create-registration-friends-switch"
                    value={letFriendsSkipGate}
                    disabled={false}
                    onValueChange={onLetFriendsSkipGate}
                    label={REGISTRATION_TEXT.friendsSkipTitle}
                    onColor={colors.primary}
                    offColor={listSwitchOffColor(colors, scheme)}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {supportsTeams ? (
        <>
          <Text style={[styles.sect, { color: colors.muted }]} testID="create-registration-what">
            {REGISTRATION_TEXT.whatLegend}
          </Text>
          <View style={styles.two} accessibilityRole="radiogroup">
            {REGISTRATION_TYPES.map((option) => {
              const active = option === type;
              return (
                <View key={option} style={styles.half}>
                  <Pressable
                    testID={`create-registration-type-${option}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active, checked: active }}
                    onPress={() => onType(option)}
                    style={[cardStyle(active), styles.typeCard]}
                  >
                    <Text style={[styles.cardTitle, styles.centered, { color: colors.text }]}>
                      {REGISTRATION_TYPE_LABELS[option]}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {organiserOffRoster ? (
        <Note testID="create-registration-organiser-note">{REGISTRATION_TEXT.organiserOffRoster}</Note>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // `.rows`: 12 over og 8 mellom kortene.
  stack: { marginTop: 12, gap: 8 },
  // `.opt`: 16 i hjørnene, 12/14 inni, minst 68 høy, 1 pt kant, valgt 2 pt skog på lys grønn.
  card: { borderRadius: 16, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 14, minHeight: 68 },
  // Kanten blir 1 pt tykkere når kortet velges; luften inni krymper like mye, så kortet står stille.
  cardActive: { borderWidth: 2, paddingVertical: 11, paddingHorizontal: 13 },
  cardPress: { flexGrow: 1, justifyContent: 'center', gap: 2 },
  cardTitle: { ...interLine(16, 20), fontFamily: FONTS.sansSemiBold },
  cardHint: { ...interLine(13, 17.5, { multiline: true }), fontFamily: FONTS.sans },
  // `.toggle`: 10 over, minst 44 høy, 12 mellom teksten og bryteren.
  toggle: { marginTop: 10, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { ...interLine(15, 19), fontFamily: FONTS.sansSemiBold },
  // `.sect`: 20 over, 8 under, 14 pt halvfet i dempet farge.
  sect: { ...interLine(14, 18), fontFamily: FONTS.sansSemiBold, marginTop: 20, marginBottom: 8 },
  // `.two2`: to like kolonner, 8 mellom.
  two: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  // `.two2 .opt`: minst 52 høy, teksten midtstilt.
  typeCard: { minHeight: 52, justifyContent: 'center' },
  centered: { textAlign: 'center' },
});
