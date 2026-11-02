// #2752: bekreftelsen før en spiller fjernes fra lista, med nettets ord. Destruktive
// flyter har egen skjerm. Serveren rører aldri kamper som alt er laget, og en spiller
// som alt er borte, er suksess. Har cupen startet imens, sier skjermen det.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { removeCupParticipant } from '../data/cupSetup';
import { backTo } from '../lib/backTo';
import { firstNameOf, participantFailureText, REMOVE_TEXT } from '../lib/cupSetupCopy';
import { formatMessage } from '../lib/kavalkadeCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, useTheme } from '../theme';

export function CupRemovePlayer({ route, navigation }: ScreenProps<'CupRemovePlayer'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { cupId, userId, name, cupName, captain, returnTo } = route.params;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const firstName = firstNameOf(name);

  const leave = (notice?: 'participant_removed') => backTo(navigation, returnTo, { cupId, notice });

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await removeCupParticipant(cupId, userId);
    if (result.ok) {
      leave('participant_removed');
      return;
    }
    if (result.reason === 'not_draft') setLocked(true);
    else setError(participantFailureText(result.reason, 0));
    setBusy(false);
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 24 }]}
      testID="cup-remove-screen"
    >
      {locked ? (
        <View testID="cup-remove-locked">
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
            {REMOVE_TEXT.lockedHeading}
          </Text>
          <Text style={[styles.body, { color: colors.text }]}>{REMOVE_TEXT.lockedBody}</Text>
        </View>
      ) : (
        <View>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" testID="cup-remove-title">
            {formatMessage(REMOVE_TEXT.heading, { name, cup: cupName })}
          </Text>
          <Text style={[styles.body, { color: colors.text }]}>{formatMessage(REMOVE_TEXT.body, { firstName })}</Text>
          {captain ? (
            <Text style={[styles.body, { color: colors.text }]} testID="cup-remove-captain">
              {REMOVE_TEXT.captain}
            </Text>
          ) : null}
          <Text style={[styles.body, { color: colors.text }]}>{formatMessage(REMOVE_TEXT.canReAdd, { firstName })}</Text>
        </View>
      )}

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]} testID="cup-remove-error">
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {locked ? null : (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={[ui.button, { backgroundColor: colors.danger }]}
            onPress={() => void submit()}
            testID="cup-remove-submit"
          >
            <Text style={ui.buttonText}>
              {busy ? REMOVE_TEXT.pending : formatMessage(REMOVE_TEXT.confirm, { firstName })}
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={ui.buttonSecondary}
          onPress={() => leave()}
          testID="cup-remove-cancel"
        >
          <Text style={ui.buttonSecondaryText}>{REMOVE_TEXT.cancel}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 10, gap: 8 },
  title: { ...fraunces(500, 26, 30, { multiline: true }), marginBottom: 8 },
  body: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, marginBottom: 6 },
  error: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  actions: { paddingTop: 14, gap: 8 },
});
