// #2752: cup-rommet i appen, det nettets `/cup/[id]` og `/cup/[id]/resultater`
// viser på ett sted.
//
// Mens cupen pågår: poengmålet, «3 av 8 matcher spilt» og kampene, dine først.
// Ingen poeng og ingen vinner: eieren vil at resultatet kommer når cupen avsluttes
// (#1468, og eierens svar igjen 01.11). Ruta sender dem ikke heller. Når cupen er
// ferdig, står resultatene her (`CupResults`).
//
// Alt kommer fra `GET /api/cup/[id]` (`data/cup.ts`). Skjermen henter ved hvert
// fokus og når du drar ned. Ingen lagring på disk i v1, som ligaen: uten nett står
// det skjermen alt har hentet, med en merknad; uten noe hentet står feilen med
// «Prøv igjen». Selve kampene virker uten nett som andre spill.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppCupMatch, AppCupView } from '../../../../lib/cup/appCupView';
import { CupMatchRow } from '../components/cup/CupMatchRow';
import { CupResultLine, CupResults } from '../components/cup/CupResults';
import { ChevronIcon } from '../components/icons/Icons';
import { StatusPill } from '../components/league/LeaguePills';
import { fetchCup, type CupLoadFailure } from '../data/cup';
import { startCup } from '../data/cupSetup';
import { openOrReturn } from '../lib/backTo';
import {
  CUP_APP_TEXT,
  CUP_TEXT,
  cupStatusLabel,
  describeCupLoadFailure,
  matchesSummary,
  pointsHeader,
} from '../lib/cupCopy';
import { FINISH_TEXT, MANAGE_APP_TEXT } from '../lib/cupManageCopy';
import { playerCountLine, SETUP_APP_TEXT } from '../lib/cupSetupCopy';
import { FORMAT_LABELS, GENERATE_TEXT, START_TEXT, startFailureText } from '../lib/cupGenerateCopy';
import { LINEUP_ROOM_TEXT } from '../lib/cupLineupCopy';
import { formatMessage } from '../lib/kavalkadeCopy';
import { useMarkVisitRead } from '../lib/useMarkVisitRead';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../theme';

export function Cup(props: ScreenProps<'Cup'>) {
  // Et varsel om en annen cup bytter bare parameteren på den åpne skjermen. Nøkkelen
  // gir et nytt rom, så én cup aldri står under en annens id.
  return <CupRoom key={props.route.params.cupId} {...props} />;
}

function CupRoom({ route, navigation }: ScreenProps<'Cup'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { cupId, notice } = route.params;
  const { userId } = useSession();
  // #2201: det du åpner, er lest: varslene om start, avdekking og resultat.
  useMarkVisitRead('cup', cupId);
  useMarkVisitRead('cupResults', cupId);
  const [view, setView] = useState<AppCupView | null>(null);
  const [failure, setFailure] = useState<CupLoadFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // Knappen er deaktivert først når `starting` er tegnet. Refen stopper trykk nummer to før det.
  const sending = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchCup(cupId);
    if (result.ok) {
      setView(result.view);
      setFailure(null);
    } else {
      // Borte for deg: det skjermen hadde, skal ikke komme tilbake uten nett.
      if (result.reason === 'not_found') setView(null);
      setFailure(result.reason);
    }
    setLoading(false);
    setPulling(false);
  }, [cupId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Kvitteringen og et nei på starten, nullstilt når siden mister fokus.
  useEffect(
    () =>
      navigation.addListener('blur', () => {
        navigation.setParams({ notice: undefined });
        setStartError(null);
      }),
    [navigation],
  );

  const start = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    setStarting(true);
    setStartError(null);
    const result = await startCup(cupId);
    sending.current = false;
    setStarting(false);
    if (result.ok) navigation.setParams({ notice: 'cup_started' });
    else setStartError(startFailureText(result.reason));
    // Også etter et nei: gikk svaret tapt, er cupen allerede i gang, og rommet skal vise det.
    void load();
  }, [cupId, load, navigation]);

  const onPull = useCallback(() => {
    setPulling(true);
    void load();
  }, [load]);

  if (view === null && failure === null) {
    return (
      <View style={ui.centered} testID="cup-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>{CUP_APP_TEXT.loading}</Text>
      </View>
    );
  }
  if (view === null) {
    return <CupLoadFailed reason={failure ?? 'load_failed'} retrying={loading} onRetry={() => void load()} />;
  }

  const stale = failure !== null;
  const mine = view.matches.filter((match) => match.mine);
  const rest = view.matches.filter((match) => !match.mine);
  const finished = view.results !== null;
  const draft = view.status === 'draft';
  const header = finished ? null : pointsHeader(view.pointsToWin, view.status);
  const openMatch = (match: AppCupMatch) => {
    if (match.canOpen) {
      openOrReturn(navigation, 'GameHome', { gameId: match.gameId });
      return;
    }
    openOrReturn(navigation, 'CupMatchBoard', {
      cupId,
      gameId: match.gameId,
      label: match.label ?? CUP_TEXT.matchFallback,
      names: `${match.side1} ${CUP_TEXT.mot} ${match.side2}`,
    });
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 24 }]}
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} tintColor={colors.primary} />}
      testID="cup-screen"
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" testID="cup-name">
          {view.name}
        </Text>
        {view.results ? (
          <CupResultLine results={view.results} />
        ) : (
          <View style={styles.pill}>
            <StatusPill label={cupStatusLabel(view.status)} live={view.status === 'active'} />
          </View>
        )}
        {header ? (
          <Text style={[styles.line, { color: colors.muted }]} testID="cup-points-to-win">
            {header}
          </Text>
        ) : null}
        {finished ? null : (
          <Text style={[styles.line, { color: colors.muted }]} testID="cup-progress">
            {matchesSummary(view.progress)}
          </Text>
        )}
      </View>

      {notice === 'cup_finished' ? <Note text={FINISH_TEXT.finishedNotice} testID="cup-notice" /> : null}
      {notice === 'cup_started' ? <Note text={START_TEXT.started} testID="cup-notice" /> : null}
      {notice === 'matches_generated' ? <Note text={START_TEXT.matchesGenerated} testID="cup-notice" /> : null}
      {notice === 'matches_changed' ? <Note text={GENERATE_TEXT.matchesChanged} testID="cup-notice" /> : null}
      {stale ? <Note text={CUP_APP_TEXT.stale} testID="cup-stale" /> : null}
      {view.selfWithdrawn ? <Note text={CUP_TEXT.withdrawnBanner} testID="cup-self-withdrawn" /> : null}
      {view.canManage && view.participantCount !== null && !stale ? (
        <Door
          text={SETUP_APP_TEXT.playersDoor}
          sub={playerCountLine(view.participantCount, null)}
          onPress={() => openOrReturn(navigation, 'CupParticipants', { cupId })}
          testID="cup-open-players"
        />
      ) : null}
      {draft && view.canManage && !stale ? (
        <>
          <Door
            text={SETUP_APP_TEXT.continueDoor}
            onPress={() => openOrReturn(navigation, 'CreateCup', { cupId })}
            testID="cup-open-setup"
          />
          <Door
            text={GENERATE_TEXT.door}
            onPress={() => openOrReturn(navigation, 'CupGenerate', { cupId })}
            testID="cup-open-generate"
          />
        </>
      ) : null}
      {/* Et utkast uten kamper har ingenting å styre ennå. */}
      {view.canManage && !stale && (!draft || view.matches.length > 0) ? (
        <Door
          text={MANAGE_APP_TEXT.roomLink}
          onPress={() => openOrReturn(navigation, 'CupManage', { cupId })}
          testID="cup-open-manage"
        />
      ) : null}
      {draft && view.canManage && !stale ? (
        <StartCup
          canStart={view.matches.length >= 2}
          starting={starting}
          error={startError}
          onStart={() => void start()}
        />
      ) : null}
      {view.lineup.door && !stale ? (
        <Door
          text={view.lineup.door.kind === 'organizer' ? LINEUP_ROOM_TEXT.organizerDoor : LINEUP_ROOM_TEXT.captainDoor}
          sub={
            view.lineup.door.kind === 'organizer'
              ? formatMessage(LINEUP_ROOM_TEXT.organizerDoorSub, { count: view.lineup.door.sessionCount })
              : LINEUP_ROOM_TEXT.captainDoorSub
          }
          onPress={() => openOrReturn(navigation, 'CupLineup', { cupId })}
          testID="cup-open-lineup"
        />
      ) : null}
      {view.lineupPending && !view.lineup.door ? <Note text={CUP_APP_TEXT.lineupPending} testID="cup-lineup-pending" /> : null}
      {view.lineup.revealed ? (
        <View style={[styles.revealed, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="cup-lineup-revealed">
          <Text style={[styles.revealedTitle, { color: colors.text }]}>{LINEUP_ROOM_TEXT.revealedTitle}</Text>
          <Text style={ui.muted}>
            {formatMessage(LINEUP_ROOM_TEXT.revealedBody, {
              format: FORMAT_LABELS[view.lineup.revealed.format],
              count: view.lineup.revealed.slotCount,
            })}
          </Text>
        </View>
      ) : null}

      {view.results ? <CupResults view={view} results={view.results} userId={userId} /> : null}
      {!finished && !stale ? (
        <Text style={[styles.pending, { color: colors.muted }]} testID="cup-results-pending">
          {CUP_TEXT.resultsPending}
        </Text>
      ) : null}

      {view.matches.length === 0 ? (
        <>
          <Heading text={CUP_TEXT.matchesHeading} />
          <Note text={CUP_TEXT.noMatches} testID="cup-no-matches" />
        </>
      ) : null}
      {mine.length > 0 ? (
        <View testID="cup-my-matches">
          <Heading text={CUP_APP_TEXT.mineHeading} />
          {mine.map((match) => (
            <CupMatchRow key={match.gameId} match={match} onOpen={() => openMatch(match)} />
          ))}
        </View>
      ) : null}
      {rest.length > 0 ? (
        <View testID="cup-other-matches">
          <Heading text={mine.length > 0 ? CUP_APP_TEXT.restHeading : CUP_TEXT.matchesHeading} />
          {rest.map((match) => (
            <CupMatchRow key={match.gameId} match={match} onOpen={() => openMatch(match)} />
          ))}
        </View>
      ) : null}

      {view.canWithdrawSelf && !stale ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => openOrReturn(navigation, 'CupWithdraw', { cupId })}
          style={[styles.quiet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          testID="cup-withdraw-self"
        >
          <Text style={[styles.quietText, { color: colors.text }]}>{CUP_TEXT.withdrawSelfLink}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Door({ text, sub, onPress, testID }: { text: string; sub?: string; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.doorRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={testID}
    >
      <View style={styles.doorBody}>
        <Text style={[styles.doorText, { color: colors.text }]}>{text}</Text>
        {sub ? <Text style={[styles.doorSub, { color: colors.muted }]}>{sub}</Text> : null}
      </View>
      <ChevronIcon direction="right" color={colors.primary} size={16} strokeWidth={2} />
    </Pressable>
  );
}

function Heading({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.muted }]}>
      {text}
    </Text>
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

function StartCup({
  canStart,
  starting,
  error,
  onStart,
}: {
  canStart: boolean;
  starting: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const { colors, ui } = useTheme();
  const disabled = !canStart || starting;
  return (
    <View style={styles.start}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: starting }}
        disabled={disabled}
        style={[ui.button, disabled && styles.startDimmed]}
        onPress={onStart}
        testID="cup-start"
      >
        <Text style={ui.buttonText}>{starting ? START_TEXT.pending : START_TEXT.button}</Text>
      </Pressable>
      {canStart ? null : (
        <Text style={ui.muted} testID="cup-start-hint">
          {START_TEXT.hint}
        </Text>
      )}
      {error ? (
        <Text style={[styles.startError, { color: colors.danger }]} testID="cup-start-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function CupLoadFailed({
  reason,
  retrying,
  onRetry,
}: {
  reason: CupLoadFailure;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { colors, ui } = useTheme();
  const text = describeCupLoadFailure(reason);
  return (
    <View style={ui.centered} testID={reason === 'not_found' ? 'cup-not-found' : 'cup-load-failed'}>
      <Text style={[styles.failure, { color: reason === 'not_found' ? colors.text : colors.danger }]}>{text}</Text>
      {reason === 'not_found' ? null : (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          style={[styles.retry, { borderColor: colors.primary }]}
          testID="cup-retry"
        >
          <Text style={[styles.retryText, { color: colors.primary }]}>
            {retrying ? CUP_APP_TEXT.retrying : CUP_APP_TEXT.retry}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  revealed: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4, marginTop: 8 },
  revealedTitle: { ...fraunces(500, 17, 22) },
  start: { gap: 6, marginTop: 12 },
  startDimmed: { opacity: 0.45 },
  startError: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  scroll: { flexGrow: 1, paddingHorizontal: 16 },
  head: { paddingTop: 10, gap: 6, paddingBottom: 8 },
  title: { ...fraunces(500, 26, 30, { multiline: true }) },
  pill: { flexDirection: 'row' },
  line: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  pending: { ...interLine(12, 16, { multiline: true }), fontFamily: FONTS.sans, paddingTop: 4 },
  note: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 4, marginBottom: 4 },
  noteText: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  heading: { fontSize: 12, fontFamily: FONTS.sansSemiBold, marginTop: 16, marginBottom: 6 },
  doorRow: {
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
  },
  doorBody: { flex: 1, gap: 2 },
  doorText: { fontSize: 14, fontFamily: FONTS.sansMedium },
  doorSub: { ...interLine(12, 16), fontFamily: FONTS.sans },
  quiet: { minHeight: TAP, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 999, marginTop: 18 },
  quietText: { fontSize: 13, fontFamily: FONTS.sansMedium },
  failure: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderRadius: 22 },
  retryText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
