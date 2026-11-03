// native/app/src/components/PushPromptCard.tsx
// #2758: kortet øverst på Hjem som spør om varsler, etter den valgte tegningen (valg
// A). Reglene for hvem som ser det står i `data/pushPrompt.ts`. Telefonens eget
// spørsmål kommer først etter trykk. Kortet leses på nytt ved hvert fokus, så
// bekreftelsen er borte neste gang Hjem åpnes.
//
// «Slå på varsler» lagrer svaret FØR telefonen spør: dreper noen appen midt i
// dialogen, har spilleren alt svart. En feil tar svaret bort igjen, så kortet kommer
// tilbake. Mens en runde pågår, vises ingenting.
import { useCallback, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { turnOnPush } from '../data/pushDevice';
import {
  clearPushPromptAnswered,
  markPushPromptAnswered,
  readShouldShowPushPrompt,
} from '../data/pushPrompt';
import { PROFILE_TEXT } from '../lib/profileCopy';
import { FONTS, interLine, useTheme } from '../theme';

type PromptState = 'hidden' | 'ask' | 'done';

export function PushPromptCard({ roundInProgress }: { roundInProgress: boolean }) {
  const { colors, ui } = useTheme();
  const [view, setView] = useState<PromptState>('hidden');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void readShouldShowPushPrompt().then((show) => {
        if (!cancelled) setView(show ? 'ask' : 'hidden');
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const onEnable = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    await markPushPromptAnswered();
    const result = await turnOnPush();
    setBusy(false);
    if (result.ok) {
      setView('done');
      AccessibilityInfo.announceForAccessibility(
        `${PROFILE_TEXT.pushPromptDoneTitle}. ${PROFILE_TEXT.pushPromptDoneBody}`,
      );
    } else if (result.reason === 'declined' || result.reason === 'denied') {
      setView('hidden');
    } else {
      await clearPushPromptAnswered();
      setFailed(true);
      AccessibilityInfo.announceForAccessibility(PROFILE_TEXT.pushOnFailed);
    }
  }, []);

  const onLater = useCallback(async () => {
    setView('hidden');
    await markPushPromptAnswered();
  }, []);

  if (roundInProgress || view === 'hidden') return null;

  const cardColors = { backgroundColor: colors.surface, borderColor: colors.border };
  const title = [styles.title, { color: colors.text }];
  const body = [styles.body, { color: colors.muted }];

  if (view === 'done') {
    return (
      <View style={[styles.card, cardColors]} testID="push-prompt-done">
        <View style={styles.inner}>
          <Text style={title}>{PROFILE_TEXT.pushPromptDoneTitle}</Text>
          <Text style={body}>{PROFILE_TEXT.pushPromptDoneBody}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, cardColors]} testID="push-prompt">
      <View style={[styles.stripe, { backgroundColor: colors.accent }]} />
      <View style={styles.inner}>
        <Text style={title} accessibilityRole="header">
          {PROFILE_TEXT.pushPromptTitle}
        </Text>
        <Text style={body}>{PROFILE_TEXT.pushPromptBody}</Text>
        {failed ? (
          <Text style={[ui.error, styles.error]} testID="push-prompt-error">
            {PROFILE_TEXT.pushOnFailed}
          </Text>
        ) : null}
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void onEnable()}
            style={[styles.enable, { backgroundColor: colors.primary }, busy ? styles.busy : null]}
            testID="push-prompt-enable"
          >
            <Text style={[styles.enableText, { color: colors.onPrimary }]}>{PROFILE_TEXT.pushPromptEnable}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void onLater()}
            style={styles.later}
            testID="push-prompt-later"
          >
            <Text style={[styles.laterText, { color: colors.text }]}>{PROFILE_TEXT.pushPromptLater}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  stripe: { height: 4 },
  inner: { padding: 14, gap: 4 },
  title: { ...interLine(15, 20), fontFamily: FONTS.sansSemiBold },
  body: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  error: { marginTop: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 8 },
  enable: { minHeight: 44, borderRadius: 999, paddingHorizontal: 18, justifyContent: 'center' },
  enableText: { ...interLine(14, 18), fontFamily: FONTS.sansMedium },
  later: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  laterText: { ...interLine(14, 18), fontFamily: FONTS.sans },
  busy: { opacity: 0.6 },
});
