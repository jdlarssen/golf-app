// #2752: avslutte kamper og hele cupen, det nettets `CupActionsSection` gir. Hva som
// står i veien, står øverst: sidepoeng stenger knappen, og kamper uten levering gjør
// den til «Avslutt likevel». Skjermen regner ingenting selv: alt kommer fra
// `GET /api/cup/[id]/manage`, og vakta er kjernen på serveren. Peer-godkjenningen
// slakkes aldri. Alt krever nett.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppCupFinishMatch, AppCupManageView } from '../../../../lib/cup/appCupManageView';
import { fetchCupManage, finishCup, finishCupMatch } from '../data/cupManage';
import { backTo, openOrReturn } from '../lib/backTo';
import { CUP_TEXT, matchesSummary } from '../lib/cupCopy';
import {
  FINISH_APP_TEXT,
  FINISH_TEXT,
  MANAGE_APP_TEXT,
  cupFinishFailureText,
  manageLoadFailureText,
  matchFinishFailureText,
  missingAwardsLine,
} from '../lib/cupManageCopy';
import { formatMessage } from '../lib/kavalkadeCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, TAP, useTheme, withAlpha } from '../theme';

const labelOf = (match: AppCupFinishMatch) => match.label ?? CUP_TEXT.matchFallback;

export function CupFinish({ route, navigation }: ScreenProps<'CupFinish'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { cupId } = route.params;
  const [view, setView] = useState<AppCupManageView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchDone, setMatchDone] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchCupManage(cupId);
    if (result.ok) {
      setView(result.view);
      setFailure(null);
      return result.view;
    }
    if (result.reason === 'not_found' || result.reason === 'not_manager') setView(null);
    setFailure(result.reason);
    return null;
  }, [cupId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (view === null && failure === null) {
    return (
      <View style={ui.centered} testID="cup-finish-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>{MANAGE_APP_TEXT.loading}</Text>
      </View>
    );
  }
  if (view === null) {
    const final = failure === 'not_found' || failure === 'not_manager';
    return (
      <View style={ui.centered} testID="cup-finish-failed">
        <Text style={[styles.failure, { color: final ? colors.text : colors.danger }]}>
          {manageLoadFailureText(failure ?? 'load_failed')}
        </Text>
        {final ? null : (
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button"
            style={[styles.retry, { borderColor: colors.primary }]}
            testID="cup-finish-retry"
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>{MANAGE_APP_TEXT.retry}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const stale = failure !== null;
  const { activeMatches, missingAwards, progress } = view.finish;
  const blocking = activeMatches.filter((match) => match.blocksFinish);
  const anyway = blocking.length > 0;
  const awardsOpen = missingAwards.length > 0;
  const running = view.status === 'active';
  const current = activeMatches.find((match) => match.gameId === confirming) ?? null;

  const leave = () => backTo(navigation, 'CupManage', { cupId });

  const submitCup = async () => {
    setBusy(true);
    setError(null);
    setMatchDone(false);
    const result = await finishCup(cupId, anyway);
    if (result.ok) {
      backTo(navigation, 'Cup', { cupId, notice: 'cup_finished' });
      return;
    }
    const fresh = await load();
    // De to første betyr at skjermen er utdatert: den nye lista sier hva som mangler.
    // Feilen navngir kampene som fortsatt pågår, som på nettet: de andre rakk det.
    if (result.reason !== 'side_awards_missing' && result.reason !== 'matches_not_submitted') {
      const left = fresh?.finish.activeMatches ?? activeMatches;
      setError(cupFinishFailureText(result.reason, left.map(labelOf).join(', ')));
    }
    setBusy(false);
  };

  const submitMatch = async (match: AppCupFinishMatch) => {
    setBusy(true);
    setError(null);
    const result = await finishCupMatch(cupId, match.gameId, match.blocksFinish);
    if (result.ok) {
      setConfirming(null);
      setMatchDone(true);
    } else if (result.reason !== 'not_all_submitted') {
      setError(matchFinishFailureText(result.reason));
    }
    await load();
    setBusy(false);
  };

  if (current !== null) {
    return (
      <ScrollView
        contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 24 }]}
        testID="cup-finish-match-screen"
      >
        <View style={styles.head}>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" testID="cup-finish-match-title">
            {formatMessage(FINISH_APP_TEXT.matchHeading, { match: labelOf(current) })}
          </Text>
          <Text style={[styles.line, { color: colors.muted }]}>
            {current.side1} {CUP_TEXT.mot} {current.side2}
          </Text>
        </View>
        {current.blocksFinish ? (
          <Warning
            text={formatMessage(FINISH_APP_TEXT.matchNotSubmitted, { match: labelOf(current) })}
            testID="cup-finish-match-missing"
          />
        ) : null}
        {error ? (
          <Text style={[styles.error, { color: colors.danger }]} testID="cup-finish-error">
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy || stale}
            style={[ui.button, current.blocksFinish ? { backgroundColor: colors.danger } : null, stale ? styles.dimmed : null]}
            onPress={() => void submitMatch(current)}
            testID="cup-finish-match-submit"
          >
            <Text style={ui.buttonText}>
              {busy
                ? FINISH_APP_TEXT.matchPending
                : current.blocksFinish
                  ? FINISH_TEXT.anywayButton
                  : FINISH_APP_TEXT.matchButton}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={ui.buttonSecondary}
            onPress={() => {
              setConfirming(null);
              setError(null);
            }}
            testID="cup-finish-match-cancel"
          >
            <Text style={ui.buttonSecondaryText}>{FINISH_APP_TEXT.cancel}</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 24 }]}
      testID="cup-finish-screen"
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" testID="cup-finish-name">
          {view.name}
        </Text>
        <Text style={[styles.line, { color: colors.muted }]} testID="cup-finish-progress">
          {matchesSummary(progress)}
        </Text>
      </View>

      {stale ? <Note text={FINISH_APP_TEXT.stale} testID="cup-finish-stale" /> : null}
      {matchDone ? <Note text={FINISH_APP_TEXT.matchFinished} testID="cup-finish-match-done" /> : null}
      {error ? (
        <Text style={[styles.error, { color: colors.danger }]} testID="cup-finish-error">
          {error}
        </Text>
      ) : null}

      {view.status === 'finished' ? <Note text={FINISH_TEXT.alreadyFinished} testID="cup-finish-already" /> : null}
      {view.status === 'draft' ? <Note text={FINISH_APP_TEXT.notRunning} testID="cup-finish-not-running" /> : null}

      {running && awardsOpen ? (
        <View testID="cup-finish-awards-missing">
          <Warning
            text={formatMessage(FINISH_TEXT.sideAwardsHint, { awards: missingAwardsLine(missingAwards) })}
            testID="cup-finish-awards-hint"
          />
          {stale ? null : (
            <Pressable
              accessibilityRole="button"
              onPress={() => openOrReturn(navigation, 'CupSideAwards', { cupId })}
              style={styles.link}
              testID="cup-finish-open-awards"
            >
              <Text style={[styles.linkText, { color: colors.primary }]}>{FINISH_APP_TEXT.registerLink}</Text>
            </Pressable>
          )}
        </View>
      ) : null}
      {running && anyway ? (
        <Warning
          text={formatMessage(FINISH_APP_TEXT.cupNotSubmitted, { matches: blocking.map(labelOf).join(', ') })}
          testID="cup-finish-not-submitted"
        />
      ) : null}

      {running && activeMatches.length > 0 ? (
        <View testID="cup-finish-active">
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.muted }]}>
            {FINISH_APP_TEXT.activeHeading}
          </Text>
          {activeMatches.map((match) => (
            <View
              key={match.gameId}
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
              testID={`cup-finish-match-${match.gameId}`}
            >
              <View style={styles.text}>
                <Text style={[styles.label, { color: colors.muted }]}>{labelOf(match)}</Text>
                <Text style={[styles.names, { color: colors.text }]}>
                  {match.side1} <Text style={[styles.mot, { color: colors.muted }]}>{CUP_TEXT.mot}</Text> {match.side2}
                </Text>
                <Text style={[styles.small, { color: colors.muted }]}>
                  {match.blocksFinish ? CUP_TEXT.matchInProgress : CUP_TEXT.matchScorecardsSubmitted}
                </Text>
              </View>
              {stale ? null : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${FINISH_APP_TEXT.matchLink}: ${labelOf(match)}`}
                  disabled={busy}
                  onPress={() => {
                    setConfirming(match.gameId);
                    setMatchDone(false);
                    setError(null);
                  }}
                  style={styles.link}
                  testID={`cup-finish-open-match-${match.gameId}`}
                >
                  <Text style={[styles.linkText, { color: colors.primary }]}>{FINISH_APP_TEXT.matchLink}</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        {running ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy || awardsOpen || stale}
            style={[
              ui.button,
              anyway ? { backgroundColor: colors.danger } : null,
              awardsOpen || stale ? styles.dimmed : null,
            ]}
            onPress={() => void submitCup()}
            testID="cup-finish-submit"
          >
            <Text style={ui.buttonText}>
              {busy
                ? anyway
                  ? FINISH_TEXT.anywayPending
                  : FINISH_TEXT.pending
                : anyway
                  ? FINISH_TEXT.anywayButton
                  : FINISH_TEXT.button}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={ui.buttonSecondary}
          onPress={leave}
          testID="cup-finish-cancel"
        >
          <Text style={ui.buttonSecondaryText}>{FINISH_APP_TEXT.cancel}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Note({ text, testID }: { text: string; testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.note, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={testID}>
      <Text style={[styles.noteText, { color: colors.muted }]}>{text}</Text>
    </View>
  );
}

function Warning({ text, testID }: { text: string; testID: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.note,
        { backgroundColor: withAlpha(colors.accent, 0.14), borderColor: withAlpha(colors.accent, 0.5) },
      ]}
      testID={testID}
    >
      <Text style={[styles.noteText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 16 },
  head: { paddingTop: 10, gap: 6, paddingBottom: 8 },
  title: { ...fraunces(500, 26, 30, { multiline: true }) },
  line: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  note: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 4, marginBottom: 8 },
  noteText: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  error: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, paddingTop: 4 },
  heading: { fontSize: 12, fontFamily: FONTS.sansSemiBold, marginTop: 12, marginBottom: 6 },
  row: {
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  text: { flex: 1, gap: 2 },
  label: { fontSize: 12, fontFamily: FONTS.sansSemiBold },
  names: { ...fraunces(500, 15, 20, { multiline: true }) },
  mot: { fontSize: 12, fontFamily: FONTS.sans },
  small: { ...interLine(12, 16, { multiline: true }), fontFamily: FONTS.sans },
  link: { minHeight: TAP, justifyContent: 'center' },
  linkText: { fontSize: 13, fontFamily: FONTS.sansMedium, textDecorationLine: 'underline' },
  actions: { paddingTop: 14, gap: 8 },
  dimmed: { opacity: 0.45 },
  failure: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderRadius: 22 },
  retryText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
