// #2752: kapteinuttaket, det nettets `CupLineupRoom` og `CupLineupBoard` gir. Arrangøren ser
// begge lag og styrer øktene. Kapteinen ser og fyller sitt eget. Hemmeligheten står på
// serveren: motstanderens plasser kommer som `slots: null`, så appen har dem ikke.
//
// Alt krever nett. Etter hver handling leses tavla på nytt, også etter et nei: gikk svaret
// tapt, står handlingen kanskje likevel, og skjermen skal vise det som faktisk er.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AppCupLineupView } from '../../../../lib/cup/appCupLineupView';
import { Note } from '../components/create/primitives';
import { OpenSessionCard, PlannedCountCard } from '../components/cup/lineup/LineupForms';
import { LineupSessionCard, type LineupActions } from '../components/cup/lineup/LineupSessionCard';
import { KEYBOARD_SCROLL_PROPS, useBottomInsetUnlessKeyboard } from '../components/KeyboardInset';
import {
  deleteCupLineupSession,
  fetchCupLineup,
  openCupLineupSession,
  retryCupLineupReveal,
  setCupPlannedMatchCount,
  submitCupLineup,
  unlockCupLineup,
  type CupSetupResult,
} from '../data/cupSetup';
import { openOrReturn } from '../lib/backTo';
import { LINEUP_TEXT, lineupFailureText, lineupLoadFailureText } from '../lib/cupLineupCopy';
import { SETUP_APP_TEXT, setupLoadFailureText } from '../lib/cupSetupCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, interLine, TAP, useTheme } from '../theme';

/** Hvilken knapp siste handling kom fra: feilen skal stå der (#2087). */
type Target = { sessionId: string | null; team: 1 | 2 | null };

export function CupLineup({ route, navigation }: ScreenProps<'CupLineup'>) {
  const { colors, ui } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();
  const { cupId } = route.params;
  const [view, setView] = useState<AppCupLineupView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>({ sessionId: null, team: null });
  // Knappen er deaktivert først når `busy` er tegnet. Refen stopper trykk nummer to før det.
  const sending = useRef(false);

  const load = useCallback(async () => {
    const result = await fetchCupLineup(cupId);
    if (result.ok) {
      setView(result.view);
      setFailure(null);
    } else {
      if (result.reason === 'not_found' || result.reason === 'not_allowed') setView(null);
      setFailure(result.reason);
    }
  }, [cupId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const run = async (next: Target, call: () => Promise<CupSetupResult>) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    setTarget(next);
    const result = await call();
    if (!result.ok) setError(lineupFailureText(result.reason));
    await load();
    sending.current = false;
    setBusy(false);
  };

  if (view === null && failure === null) {
    return (
      <View style={ui.centered} testID="cup-lineup-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>{SETUP_APP_TEXT.loading}</Text>
      </View>
    );
  }
  if (view === null) {
    const final = failure === 'not_found' || failure === 'not_allowed';
    return (
      <View style={ui.centered} testID="cup-lineup-failed">
        <Text style={[styles.failure, { color: final ? colors.text : colors.danger }]}>
          {lineupLoadFailureText(failure ?? 'load_failed')}
        </Text>
        {final ? null : <RetryButton onPress={() => void load()} />}
      </View>
    );
  }

  const organizer = view.role === 'organizer';
  // Vektede cuper har ikke noe «først til X», så de slipper spørsmålet og sperren (#1902).
  const needsPlanned = view.hasDefaultWeights && view.plannedMatchCount === null;
  // Økta kan være borte (slettet et annet sted). Da er toppen det eneste stedet igjen.
  const errorOnCard = error !== null && target.sessionId !== null && view.sessions.some((s) => s.id === target.sessionId);

  const actions: LineupActions = {
    onSubmit: (sessionId, team, slots) => void run({ sessionId, team }, () => submitCupLineup(cupId, sessionId, team, slots)),
    onUnlock: (sessionId, team) => void run({ sessionId, team }, () => unlockCupLineup(cupId, sessionId, team)),
    onRetry: (sessionId) => void run({ sessionId, team: null }, () => retryCupLineupReveal(cupId, sessionId)),
    onDelete: (sessionId) => void run({ sessionId, team: null }, () => deleteCupLineupSession(cupId, sessionId)),
  };

  return (
    <ScrollView
      {...KEYBOARD_SCROLL_PROPS}
      contentContainerStyle={[ui.scroll, { paddingBottom: 20 + bottomInset }]}
      testID="cup-lineup-screen"
    >
      <Text style={ui.title}>{LINEUP_TEXT.pageTitle}</Text>
      <Text style={ui.muted}>{organizer ? LINEUP_TEXT.subtitleOrganizer : LINEUP_TEXT.subtitleCaptain}</Text>

      {failure !== null ? (
        <View style={styles.gapTop}>
          <Note testID="cup-lineup-stale">{setupLoadFailureText(failure)}</Note>
          <RetryButton onPress={() => void load()} />
        </View>
      ) : null}

      {error !== null && !errorOnCard ? (
        <Text style={[styles.error, { color: colors.danger }]} testID="cup-lineup-error">
          {error}
        </Text>
      ) : null}

      {organizer && !view.bothCaptains ? (
        <View style={styles.gapTop}>
          <Note testID="cup-lineup-needs-captains">{LINEUP_TEXT.needsCaptains}</Note>
          <Pressable
            accessibilityRole="button"
            style={ui.buttonSecondary}
            onPress={() => openOrReturn(navigation, 'CupParticipants', { cupId })}
            testID="cup-lineup-open-players"
          >
            <Text style={ui.buttonSecondaryText}>{SETUP_APP_TEXT.playersDoor}</Text>
          </Pressable>
        </View>
      ) : null}

      {organizer && view.bothCaptains && view.hasDefaultWeights ? (
        <PlannedCountCard
          // Et tall lagret et annet sted skal ikke bli stående som det gamle i feltet.
          key={String(view.plannedMatchCount)}
          view={view}
          busy={busy}
          onSave={(value) => void run({ sessionId: null, team: null }, () => setCupPlannedMatchCount(cupId, value))}
        />
      ) : null}

      {organizer && view.bothCaptains ? (
        <OpenSessionCard
          view={view}
          busy={busy}
          needsPlanned={needsPlanned}
          onOpen={(format, slotCount) =>
            void run({ sessionId: null, team: null }, () => openCupLineupSession(cupId, format, slotCount))
          }
        />
      ) : null}

      <Text style={[ui.sectionTitle, styles.heading]}>{LINEUP_TEXT.sessionsHeading}</Text>
      {view.sessions.length === 0 ? (
        <Note testID="cup-lineup-empty">{organizer ? LINEUP_TEXT.emptyOrganizer : LINEUP_TEXT.emptyCaptain}</Note>
      ) : (
        view.sessions.map((session) => (
          <LineupSessionCard
            key={session.id}
            view={view}
            session={session}
            busy={busy}
            error={errorOnCard && target.sessionId === session.id ? error : null}
            errorTeam={target.team}
            actions={actions}
          />
        ))
      )}
    </ScrollView>
  );
}

function RetryButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.retry, { borderColor: colors.primary }]}
      testID="cup-lineup-retry"
    >
      <Text style={[styles.retryText, { color: colors.primary }]}>{SETUP_APP_TEXT.retry}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  failure: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderRadius: 22 },
  retryText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  gapTop: { gap: 8, marginTop: 12 },
  heading: { marginTop: 16 },
  error: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, marginTop: 10 },
});
