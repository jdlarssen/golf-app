// native/app/src/screens/CompleteProfile.tsx
// #2216: «Fullfør profilen» — navn og handicap første gang, før appen.
//
// En ny spiller lager kontoen i appen (koden går gjennom nettsidens sperrer),
// og har da verken navn eller handicap. Porten foran stacken (`ProfileGate`)
// viser dette steget når `profile_completed_at` mangler, samme regel som
// nettsidens `/`. Skjermen er bygget etter designet (Profilstart-forslag,
// #2350): «To ting, så er du med», spillet som venter når du står på et, de to
// feltene, «Slik ser de andre deg» og «Sett i gang».
//
// **Ingen regel her.** Lagringen går gjennom `PUT /api/profile`, som kjører
// samme `parseProfileInput` som nettsidens skjema og setter
// `profile_completed_at`. Forhåndsvisningen bruker samme grenser
// (`onboardingPreviewHcp`), så den aldri viser et tall lagringen avviser.
//
// **Steget skriver ikke over det det ikke viser.** Kallenavn og klasse som
// alt står på raden sendes uendret, og kjønn sendes som `null` («la stå»).
// Samme grunn som i `lib/users/profileInput.ts`: onboarding samler bare inn
// navn og handicap (#1064).
//
// Ingen «Logg ut» her: designet har ingen. Utloggingen ligger i «Personvern og
// konto» når profilen er fullført.
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nameInitials } from '../../../../lib/names/initials';
import { fetchOnboardingGame, type OnboardingGame } from '../data/onboardingGame';
import { saveProfile, type OwnProfile, type ProfileSaveFailure } from '../data/profile';
import {
  ONBOARDING_TEXT,
  describeProfileSaveFailure,
  onboardingGameDate,
  onboardingGameLine,
  onboardingGameTitle,
  onboardingPreviewHcp,
} from '../lib/profileCopy';
import { FONTS, fraunces, frauncesFamily, useTheme, withAlpha } from '../theme';
import { asLevel } from './EditProfile';

export function CompleteProfile({
  userId,
  profile,
  onDone,
}: {
  userId: string;
  profile: OwnProfile;
  onDone: () => void;
}) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [magnitude, setMagnitude] = useState('');
  const [isPlus, setIsPlus] = useState(false);
  const [focus, setFocus] = useState<'name' | 'hcp' | null>(null);
  const [game, setGame] = useState<OnboardingGame | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ProfileSaveFailure | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchOnboardingGame(userId).then((next) => {
      if (!cancelled) setGame(next);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const onSave = () => {
    // Feilmeldingen står over feltene, som på nettsiden. Med tastaturet nede
    // står den på skjermen, og skjermleseren får den lest opp.
    Keyboard.dismiss();
    setPending(true);
    setFailure(null);
    void saveProfile({
      // RÅ input: serveren trimmer, tolker komma og avgjør.
      name,
      nickname: profile.nickname,
      hcpIndex: magnitude,
      hcpPlus: isPlus,
      gender: null,
      level: asLevel(profile.level),
    })
      .then((result) => {
        if (result.ok) {
          // Porten bytter til appen; skjermen avmonteres.
          onDone();
          return;
        }
        setPending(false);
        setFailure(result.reason);
        AccessibilityInfo.announceForAccessibility(describeProfileSaveFailure(result.reason));
      })
      .catch((err: unknown) => {
        console.error('[CompleteProfile] lagring kastet', err);
        setPending(false);
        setFailure('update_failed');
      });
  };

  const fieldStyle = (field: 'name' | 'hcp') => [
    styles.field,
    { backgroundColor: colors.surface, color: colors.text },
    focus === field
      ? { borderWidth: 1.5, borderColor: colors.primary }
      : { borderWidth: 1, borderColor: colors.border },
  ];

  const shownName = name.trim();
  const date = game ? onboardingGameDate(game.teeOffAt) : null;
  const gameLine = game ? onboardingGameLine(game) : '';

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[
        styles.screen,
        { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 20 },
      ]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      testID="complete-profile-screen"
    >
      <View style={styles.top}>
        <Text style={[ui.kicker, { color: colors.accentText }]}>{ONBOARDING_TEXT.kicker}</Text>
        <Text style={[styles.heading, { color: colors.text }]} accessibilityRole="header">
          {ONBOARDING_TEXT.heading}
        </Text>
      </View>

      {game ? (
        <View
          style={[styles.gameCard, { backgroundColor: colors.surfaceStrong }]}
          testID="complete-profile-game"
        >
          {date ? (
            <View
              style={[styles.dateBox, { backgroundColor: withAlpha(colors.onStrongWarm, 0.12) }]}
            >
              <Text style={[styles.dateDay, { color: colors.onStrongWarm }]}>{date.day}</Text>
              <Text style={[styles.dateMonth, { color: colors.onStrongWarm }]}>{date.month}</Text>
            </View>
          ) : null}
          <View style={styles.gameText}>
            <Text style={[styles.gameTitle, { color: colors.onStrongWarm }]}>
              {onboardingGameTitle(game.name)}
            </Text>
            {gameLine ? (
              <Text style={[styles.gameLine, { color: withAlpha(colors.onStrongWarm, 0.85) }]}>
                {gameLine}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {failure ? (
        <Text style={[ui.error, styles.error]} testID="complete-profile-error">
          {describeProfileSaveFailure(failure)}
        </Text>
      ) : null}

      <View style={styles.fields}>
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.text }]}>{ONBOARDING_TEXT.nameLabel}</Text>
          <TextInput
            style={fieldStyle('name')}
            value={name}
            onChangeText={setName}
            onFocus={() => setFocus('name')}
            onBlur={() => setFocus(null)}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            accessibilityLabel={ONBOARDING_TEXT.nameLabel}
            accessibilityHint={ONBOARDING_TEXT.nameHint}
            testID="complete-profile-name"
          />
          <Text style={[styles.hint, { color: colors.muted }]}>{ONBOARDING_TEXT.nameHint}</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.text }]}>{ONBOARDING_TEXT.hcpLabel}</Text>
          <View style={styles.hcpRow}>
            {/* «+» er en knapp og ikke en bryter, som på nettsiden og i
                «Rediger profil»: en bryter ville lest som en innstilling. */}
            <Pressable
              style={[
                styles.plus,
                isPlus
                  ? { backgroundColor: colors.primary, borderColor: colors.primary }
                  : { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => setIsPlus((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={ONBOARDING_TEXT.plusHandicapLabel}
              accessibilityState={{ selected: isPlus }}
              testID="complete-profile-hcp-plus"
            >
              <Text style={[styles.plusText, { color: isPlus ? colors.onPrimary : colors.muted }]}>
                +
              </Text>
            </Pressable>
            <TextInput
              style={[fieldStyle('hcp'), styles.hcpField]}
              value={magnitude}
              onChangeText={setMagnitude}
              onFocus={() => setFocus('hcp')}
              onBlur={() => setFocus(null)}
              keyboardType="decimal-pad"
              accessibilityLabel={ONBOARDING_TEXT.hcpLabel}
              accessibilityHint={ONBOARDING_TEXT.hcpHint}
              testID="complete-profile-hcp"
            />
          </View>
          <Text style={[styles.hint, { color: colors.muted }]}>{ONBOARDING_TEXT.hcpHint}</Text>
        </View>
      </View>

      <View style={styles.preview}>
        <Text style={ui.kicker}>{ONBOARDING_TEXT.previewKicker}</Text>
        <View
          style={[styles.previewRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>
              {shownName ? nameInitials(shownName) : ''}
            </Text>
          </View>
          <Text
            style={[styles.previewName, { color: colors.text }]}
            numberOfLines={1}
            testID="complete-profile-preview-name"
          >
            {shownName || ONBOARDING_TEXT.previewNamePlaceholder}
          </Text>
          <Text
            style={[styles.previewHcp, { color: colors.muted }]}
            testID="complete-profile-preview-hcp"
          >
            {onboardingPreviewHcp(magnitude, isPlus)}
          </Text>
        </View>
      </View>

      <View style={styles.bottom}>
        <Pressable
          style={[styles.submit, { backgroundColor: colors.primary }, pending && styles.submitOff]}
          onPress={onSave}
          disabled={pending}
          accessibilityRole="button"
          accessibilityState={{ disabled: pending }}
          testID="complete-profile-submit"
        >
          <Text style={[styles.submitText, { color: colors.onPrimary }]}>
            {pending ? ONBOARDING_TEXT.submitPending : ONBOARDING_TEXT.submitButton}
          </Text>
        </Pressable>
        <Text style={[styles.footnote, { color: colors.muted }]}>{ONBOARDING_TEXT.footnote}</Text>
      </View>
    </ScrollView>
  );
}

// Målene er designets (Profilstart-forslag): overskrift 28/500, kort 14 i
// luft og 16 i radius, felt 52 høye med 12 i radius, «+» 52 × 52, raden for
// «Slik ser de andre deg» 14 i radius med en sirkel på 36, knapp 52.
const styles = StyleSheet.create({
  screen: { flexGrow: 1 },
  top: { paddingHorizontal: 20 },
  heading: { ...fraunces(500, 28, 32, { multiline: true }), marginTop: 6 },
  gameCard: {
    marginTop: 14,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: { ...fraunces(600, 18, 18) },
  dateMonth: {
    fontSize: 9,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.08,
    textTransform: 'uppercase',
  },
  gameText: { flex: 1 },
  gameTitle: { fontSize: 14, lineHeight: 20, fontFamily: FONTS.sansSemiBold },
  gameLine: { fontSize: 14, lineHeight: 20, fontFamily: FONTS.sans },
  error: { marginTop: 16, marginHorizontal: 20 },
  fields: { paddingTop: 20, paddingHorizontal: 20, gap: 18 },
  fieldGroup: { gap: 6 },
  label: { fontSize: 14, fontFamily: FONTS.sansSemiBold },
  field: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: FONTS.sans,
  },
  hint: { fontSize: 12, fontFamily: FONTS.sans },
  hcpRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plus: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusText: { fontSize: 18, fontFamily: FONTS.sansSemiBold },
  // Snittet og størrelsen, ikke `fraunces()`: linjeboksen den gir er for
  // tekst, og et `TextInput` med `lineHeight` klipper sifrene på iOS.
  hcpField: {
    flex: 1,
    fontFamily: frauncesFamily(600, 22),
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  preview: { paddingTop: 22, paddingHorizontal: 20 },
  previewRow: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontFamily: FONTS.sansSemiBold },
  previewName: { flex: 1, fontSize: 15, fontFamily: FONTS.sansSemiBold },
  previewHcp: { fontSize: 13, fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  bottom: { marginTop: 'auto', paddingTop: 16, paddingHorizontal: 20 },
  submit: {
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitOff: { opacity: 0.45 },
  submitText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  footnote: { fontSize: 12, fontFamily: FONTS.sans, textAlign: 'center', marginTop: 8 },
});
