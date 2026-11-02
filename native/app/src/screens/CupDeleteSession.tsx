// #2752: bekreftelsen før en økt i uttaket slettes. Destruktive flyter har egen skjerm, og
// knappen sto rett under «Prøv igjen» (eierens svar 02.11). Er økta avdekket imens, sier
// serveren nei. En økt som alt er borte, er det du ville.
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteCupLineupSession } from '../data/cupSetup';
import { backTo } from '../lib/backTo';
import { DELETE_TEXT, SESSION_DELETE_TEXT } from '../lib/cupDeleteCopy';
import { FORMAT_LABELS } from '../lib/cupGenerateCopy';
import { LINEUP_TEXT, lineupFailureText } from '../lib/cupLineupCopy';
import { formatMessage } from '../lib/kavalkadeCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, useTheme } from '../theme';

const DELIVERED_TEXT = [
  SESSION_DELETE_TEXT.deliveredNone,
  SESSION_DELETE_TEXT.deliveredOne,
  SESSION_DELETE_TEXT.deliveredBoth,
] as const;

export function CupDeleteSession({ route, navigation }: ScreenProps<'CupDeleteSession'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { cupId, sessionId, format, slotCount, delivered } = route.params;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);

  const leave = () => backTo(navigation, 'CupLineup', { cupId });

  const submit = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const result = await deleteCupLineupSession(cupId, sessionId);
    sending.current = false;
    if (result.ok) {
      if (navigation.isFocused()) leave();
      else setBusy(false);
      return;
    }
    setError(lineupFailureText(result.reason));
    setBusy(false);
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 24 }]}
      testID="cup-delete-session-screen"
    >
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
        {SESSION_DELETE_TEXT.heading}
      </Text>
      <Text style={[styles.body, { color: colors.text }]} testID="cup-delete-session-what">
        {`${FORMAT_LABELS[format]}: ${formatMessage(LINEUP_TEXT.slotSummary, { count: slotCount })}`}
      </Text>
      <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.small, { color: colors.text }]} testID="cup-delete-session-delivered">
          {DELIVERED_TEXT[delivered]}
        </Text>
        <Text style={[styles.small, { color: colors.text }]}>{SESSION_DELETE_TEXT.noMatches}</Text>
        <Text style={[styles.small, { color: colors.muted }]}>{DELETE_TEXT.irreversibleNote}</Text>
      </View>

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]} testID="cup-delete-session-error">
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          style={[ui.button, { backgroundColor: colors.danger }]}
          onPress={() => void submit()}
          testID="cup-delete-session-submit"
        >
          <Text style={ui.buttonText}>{busy ? DELETE_TEXT.pending : SESSION_DELETE_TEXT.button}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={ui.buttonSecondary}
          onPress={leave}
          testID="cup-delete-session-cancel"
        >
          <Text style={ui.buttonSecondaryText}>{DELETE_TEXT.cancel}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 10, gap: 8 },
  title: { ...fraunces(500, 26, 30, { multiline: true }), marginBottom: 4 },
  body: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans },
  box: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, gap: 6, marginTop: 4 },
  small: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  error: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, marginTop: 4 },
  actions: { paddingTop: 14, gap: 8 },
});
