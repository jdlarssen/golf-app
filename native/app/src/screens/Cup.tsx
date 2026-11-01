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
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppCupView } from '../../../../lib/cup/appCupView';
import { CupMatchRow } from '../components/cup/CupMatchRow';
import { CupResultLine, CupResults } from '../components/cup/CupResults';
import { StatusPill } from '../components/league/LeaguePills';
import { fetchCup, type CupLoadFailure } from '../data/cup';
import { openOrReturn } from '../lib/backTo';
import {
  CUP_APP_TEXT,
  CUP_TEXT,
  cupStatusLabel,
  describeCupLoadFailure,
  matchesSummary,
  pointsHeader,
} from '../lib/cupCopy';
import { useMarkVisitRead } from '../lib/useMarkVisitRead';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../theme';

export function Cup({ route, navigation }: ScreenProps<'Cup'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { cupId } = route.params;
  const { userId } = useSession();
  // #2201: det du åpner, er lest: varslene om start, avdekking og resultat.
  useMarkVisitRead('cup', cupId);
  useMarkVisitRead('cupResults', cupId);
  const [view, setView] = useState<AppCupView | null>(null);
  const [failure, setFailure] = useState<CupLoadFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchCup(cupId);
    if (result.ok) {
      setView(result.view);
      setFailure(null);
    } else {
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
  // Cupen finnes ikke (lenger) for deg: det skjermen hadde, er ikke ditt å se.
  if (view === null || failure === 'not_found') {
    return <CupLoadFailed reason={failure ?? 'load_failed'} retrying={loading} onRetry={() => void load()} />;
  }

  const stale = failure !== null;
  const mine = view.matches.filter((match) => match.mine);
  const rest = view.matches.filter((match) => !match.mine);
  const finished = view.results !== null;
  const header = finished ? null : pointsHeader(view.pointsToWin, view.status);
  const openMatch = (gameId: string) => openOrReturn(navigation, 'GameHome', { gameId });

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

      {stale ? <Note text={CUP_APP_TEXT.stale} testID="cup-stale" /> : null}
      {view.lineupPending ? <Note text={CUP_APP_TEXT.lineupPending} testID="cup-lineup-pending" /> : null}

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
            <CupMatchRow key={match.gameId} match={match} onOpen={() => openMatch(match.gameId)} />
          ))}
        </View>
      ) : null}
      {rest.length > 0 ? (
        <View testID="cup-other-matches">
          <Heading text={mine.length > 0 ? CUP_APP_TEXT.restHeading : CUP_TEXT.matchesHeading} />
          {rest.map((match) => (
            <CupMatchRow key={match.gameId} match={match} onOpen={() => openMatch(match.gameId)} />
          ))}
        </View>
      ) : null}
    </ScrollView>
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
  scroll: { flexGrow: 1, paddingHorizontal: 16 },
  head: { paddingTop: 10, gap: 6, paddingBottom: 8 },
  title: { ...fraunces(500, 26, 30, { multiline: true }) },
  pill: { flexDirection: 'row' },
  line: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  pending: { ...interLine(12, 16, { multiline: true }), fontFamily: FONTS.sans, paddingTop: 4 },
  note: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 4, marginBottom: 4 },
  noteText: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  heading: { fontSize: 12, fontFamily: FONTS.sansSemiBold, marginTop: 16, marginBottom: 6 },
  failure: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderRadius: 22 },
  retryText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
