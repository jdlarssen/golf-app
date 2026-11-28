// #3019: vilkårene, én gang (tegning 15). Google Play krever at spillerne
// godtar vilkår før de lager innhold andre ser, og Apple vil se reglene bak
// «Rapporter». Samme oppsett som spørsmålet om AI-tekster: overskrift i
// Fraunces 28, brødtekst i 15, og to knapper på 52 nederst. «Nei, logg meg ut»
// er det andre svaret, fordi appen ikke kan brukes uten vilkårene.
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tap } from '../components/Tap';
import { StatusBarBand } from '../components/StatusBarBand';
import { PilUtIcon } from '../components/icons/Icons';
import { MODERATION_TEXT } from '../lib/moderationCopy';
import { FONTS, fraunces, useTheme } from '../theme';

export type TermsAnswer = 'accept' | 'decline';

export function TermsQuestion({
  pending,
  line,
  onAnswer,
  onRead,
}: {
  /** Svaret som lagres nå, eller `null`. */
  pending: TermsAnswer | null;
  /** Linja over knappene når noe gikk galt, eller `null`. */
  line: string | null;
  onAnswer: (answer: TermsAnswer) => void;
  onRead: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const busy = pending !== null;

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={[styles.screen, { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 20 }]}
        testID="terms-screen"
      >
        <View style={styles.top}>
          <Text style={[styles.heading, { color: colors.text }]} accessibilityRole="header">
            {MODERATION_TEXT.termsTitle}
          </Text>
          <Text style={[styles.body, { color: colors.text }]}>{MODERATION_TEXT.termsBody1}</Text>
          <Text style={[styles.body, { color: colors.text }]}>{MODERATION_TEXT.termsBody2}</Text>
          <Text style={[styles.body, { color: colors.muted }]}>{MODERATION_TEXT.termsBody3}</Text>
          <Tap style={styles.read} onPress={onRead} accessibilityRole="link" testID="terms-read">
            <Text style={[styles.readText, { color: colors.primary }]}>{MODERATION_TEXT.termsRead}</Text>
            <PilUtIcon color={colors.primary} size={16} />
          </Tap>
        </View>

        <View style={styles.bottom}>
          {line ? (
            <Text style={[styles.error, { color: colors.danger }]} testID="terms-error">
              {line}
            </Text>
          ) : null}
          <Tap
            style={[styles.button, { backgroundColor: colors.primary }, busy && styles.buttonOff]}
            onPress={() => onAnswer('accept')}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            testID="terms-accept"
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
              {pending === 'accept' ? MODERATION_TEXT.termsSaving : MODERATION_TEXT.termsAccept}
            </Text>
          </Tap>
          <Tap
            style={[
              styles.button,
              { borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
              busy && styles.buttonOff,
            ]}
            onPress={() => onAnswer('decline')}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            testID="terms-decline"
          >
            <Text style={[styles.buttonText, { color: colors.text }]}>{MODERATION_TEXT.termsDecline}</Text>
          </Tap>
        </View>
      </ScrollView>
      <StatusBarBand color={colors.bg} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1 },
  top: { paddingHorizontal: 20, gap: 14 },
  heading: { ...fraunces(500, 28, 32, { multiline: true }), marginTop: 6 },
  body: { fontSize: 15, lineHeight: 21, fontFamily: FONTS.sans },
  read: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' },
  readText: { fontSize: 15, lineHeight: 21, fontFamily: FONTS.sansSemiBold },
  bottom: { marginTop: 'auto', paddingTop: 24, paddingHorizontal: 20, gap: 10 },
  error: { fontSize: 14, lineHeight: 19, fontFamily: FONTS.sans, textAlign: 'center' },
  button: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  buttonOff: { opacity: 0.45 },
  buttonText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
