// native/app/src/screens/AiConsentQuestion.tsx
// #2561 PR B: spørsmålet om AI-tekster, én gang, rett etter «Fullfør profilen».
//
// Apple krever at spilleren svarer før navn og resultater går til språkmodellen
// (App Review 5.1.2(i)). To knapper og ingen «senere»: et svar som venter, er
// det samme som nei (`lib/ai/consent.ts`), og et tredje valg ville bare utsatt
// spørsmålet. Knappene er like store og like tydelige, så ingen av dem er
// standardvalget.
//
// Ingen tegning finnes for skjermen. Den følger «Fullfør profilen»: overskrift
// i Fraunces 28, brødtekst i 15, knappene 52 høye nederst.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AI_CONSENT_TEXT } from '../lib/aiConsentCopy';
import { FONTS, fraunces, useTheme } from '../theme';
import { StatusBarBand } from '../components/StatusBarBand';

export function AiConsentQuestion({
  pending,
  failed,
  onAnswer,
}: {
  /** Svaret som lagres nå, eller `null`. */
  pending: boolean | null;
  /** Forrige lagring feilet. */
  failed: boolean;
  onAnswer: (granted: boolean) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const busy = pending !== null;

  const button = (granted: boolean, label: string, testID: string) => (
    <Pressable
      style={[styles.button, { backgroundColor: colors.primary }, busy && styles.buttonOff]}
      onPress={() => onAnswer(granted)}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      testID={testID}
    >
      <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
        {pending === granted ? AI_CONSENT_TEXT.saving : label}
      </Text>
    </Pressable>
  );

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={[
          styles.screen,
          { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 20 },
        ]}
        testID="ai-consent-screen"
      >
        <View style={styles.top}>
          <Text style={[styles.heading, { color: colors.text }]} accessibilityRole="header">
            {AI_CONSENT_TEXT.title}
          </Text>
          <Text style={[styles.body, { color: colors.text }]}>{AI_CONSENT_TEXT.body}</Text>
          <Text style={[styles.body, { color: colors.muted }]}>{AI_CONSENT_TEXT.noMeans}</Text>
        </View>

        <View style={styles.bottom}>
          {failed ? (
            <Text style={[styles.error, { color: colors.danger }]} testID="ai-consent-error">
              {AI_CONSENT_TEXT.saveFailed}
            </Text>
          ) : null}
          {button(true, AI_CONSENT_TEXT.yes, 'ai-consent-yes')}
          {button(false, AI_CONSENT_TEXT.no, 'ai-consent-no')}
        </View>
      </ScrollView>
      {/* #1954 D3: fast stripe over statuslinja når innholdet ruller under den. */}
      <StatusBarBand color={colors.bg} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1 },
  top: { paddingHorizontal: 20, gap: 14 },
  heading: { ...fraunces(500, 28, 32, { multiline: true }), marginTop: 6 },
  body: { fontSize: 15, lineHeight: 21, fontFamily: FONTS.sans },
  bottom: { marginTop: 'auto', paddingTop: 24, paddingHorizontal: 20, gap: 10 },
  error: { fontSize: 14, lineHeight: 19, fontFamily: FONTS.sans, textAlign: 'center' },
  button: {
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOff: { opacity: 0.45 },
  buttonText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
