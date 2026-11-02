// #2752: bekreftelsen før et utkast slettes, med nettets ord. Destruktive flyter har egen
// skjerm. Serveren sletter bare det som ikke er startet, og sier hva som følger med. En cup
// som alt er borte, er det du ville, så det regnes som slettet (et tapt svar og nytt trykk).
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppCupDeletePreview } from '../../../../lib/cup/appCupDeleteView';
import { deleteCup, fetchCupDeletePreview } from '../data/cupSetup';
import { backTo } from '../lib/backTo';
import { DELETE_APP_TEXT, DELETE_TEXT, deleteFailureText } from '../lib/cupDeleteCopy';
import { SETUP_APP_TEXT, setupLoadFailureText } from '../lib/cupSetupCopy';
import { formatMessage } from '../lib/kavalkadeCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, useTheme, withAlpha } from '../theme';

export function CupDelete({ route, navigation }: ScreenProps<'CupDelete'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { cupId } = route.params;
  const [preview, setPreview] = useState<AppCupDeletePreview | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  // Knappen er deaktivert først når `busy` er tegnet. Refen stopper trykk nummer to før det.
  const sending = useRef(false);

  const load = useCallback(async () => {
    const result = await fetchCupDeletePreview(cupId);
    if (result.ok) {
      setPreview(result.view);
      setFailure(null);
    } else {
      setFailure(result.reason);
    }
  }, [cupId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const leave = () => backTo(navigation, 'Cup', { cupId });

  const submit = async () => {
    if (sending.current || preview === null) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const result = await deleteCup(cupId);
    sending.current = false;
    if (result.ok || result.reason === 'not_found') {
      // Har du gått tilbake mens svaret var på vei, skal skjermen du står på stå i ro.
      if (navigation.isFocused()) backTo(navigation, 'Home', { deletedCup: preview.name });
      else setBusy(false);
      return;
    }
    if (result.reason === 'not_draft') setLocked(true);
    else setError(deleteFailureText(result.reason));
    setBusy(false);
  };

  const scroll = [styles.scroll, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 24 }];

  if (preview === null && failure === null) {
    return (
      <View style={ui.centered} testID="cup-delete-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>{SETUP_APP_TEXT.loading}</Text>
      </View>
    );
  }
  if (preview === null) {
    const final = failure === 'not_found' || failure === 'not_manager';
    return (
      <View style={ui.centered} testID="cup-delete-failed">
        <Text style={[styles.failure, { color: final ? colors.text : colors.danger }]}>
          {setupLoadFailureText(failure ?? 'load_failed')}
        </Text>
        {final ? null : (
          <Pressable
            accessibilityRole="button"
            style={ui.buttonSecondary}
            onPress={() => void load()}
            testID="cup-delete-retry"
          >
            <Text style={ui.buttonSecondaryText}>{SETUP_APP_TEXT.retry}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const cancel = (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      style={ui.buttonSecondary}
      onPress={leave}
      testID="cup-delete-cancel"
    >
      <Text style={ui.buttonSecondaryText}>{DELETE_TEXT.cancel}</Text>
    </Pressable>
  );

  if (locked || !preview.draft) {
    return (
      <ScrollView contentContainerStyle={scroll} testID="cup-delete-screen">
        <View testID="cup-delete-locked">
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
            {DELETE_APP_TEXT.lockedHeading}
          </Text>
          <Text style={[styles.body, { color: colors.text }]}>{DELETE_APP_TEXT.lockedBody}</Text>
        </View>
        <View style={styles.actions}>{cancel}</View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={scroll} testID="cup-delete-screen">
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" testID="cup-delete-title">
        {formatMessage(DELETE_TEXT.heading, { name: preview.name })}
      </Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        {preview.team1Name} {DELETE_TEXT.versus} {preview.team2Name}
      </Text>
      <View
        style={[
          styles.warning,
          { backgroundColor: withAlpha(colors.accent, 0.14), borderColor: withAlpha(colors.accent, 0.5) },
        ]}
      >
        <Text style={[styles.small, { color: colors.text }]} testID="cup-delete-warning">
          {DELETE_TEXT.warning}
        </Text>
      </View>
      <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.boxHeading, { color: colors.muted }]}>{DELETE_TEXT.permanentHeading}</Text>
        <Text style={[styles.small, { color: colors.text }]}>{formatMessage(DELETE_TEXT.cupEntry, { name: preview.name })}</Text>
        <Text style={[styles.small, { color: colors.text }]}>{DELETE_TEXT.rosterEntry}</Text>
        {preview.matchCount > 0 ? (
          <Text style={[styles.small, { color: colors.muted }]} testID="cup-delete-matches">
            {formatMessage(DELETE_TEXT.neverPlayedNote, { count: preview.matchCount })}
          </Text>
        ) : null}
        {preview.keptCount > 0 ? (
          <Text style={[styles.small, { color: colors.muted }]} testID="cup-delete-kept">
            {formatMessage(DELETE_TEXT.keptNote, { count: preview.keptCount })}
          </Text>
        ) : null}
        <Text style={[styles.small, { color: colors.muted }]}>{DELETE_TEXT.irreversibleNote}</Text>
      </View>

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]} testID="cup-delete-error">
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
          testID="cup-delete-submit"
        >
          <Text style={ui.buttonText}>{busy ? DELETE_TEXT.pending : DELETE_TEXT.deleteButton}</Text>
        </Pressable>
        {cancel}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 10, gap: 8 },
  title: { ...fraunces(500, 26, 30, { multiline: true }), marginBottom: 4 },
  body: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans },
  failure: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  warning: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 4 },
  box: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, gap: 6, marginTop: 4 },
  boxHeading: { fontSize: 12, fontFamily: FONTS.sansSemiBold },
  small: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  error: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, marginTop: 4 },
  actions: { paddingTop: 14, gap: 8 },
});
