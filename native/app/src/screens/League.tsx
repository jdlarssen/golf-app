// #2638 Del 2: ligasiden i appen (tegningene 2, 2b, 3, 4 og 6).
//
// Fra toppen: navnet, status og sesong, formatlinja («Stableford netto ·
// beste 5 av 7»), rundeinnstillingene i en simulatorliga (foldet, se
// `SimSettingsCard`), den åpne runden med «hvem har spilt» og «Spill runden»,
// sesongtabellen og rundelista.
//
// Alt kommer fra `GET /api/liga/[id]` (`data/league.ts`): tabellen, de
// effektive innstillingene og hvem som har levert regnes på serveren, og
// skjermen regner dem aldri selv. Den henter ved hvert fokus og når du drar
// ned. Ingen lagring på disk i v1 (kontrakten): uten nett står det skjermen
// alt har hentet, med merknaden fra tegning 6 og «Spill runden» dempet; uten
// noe hentet står feilen med «Prøv igjen».
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppLeagueRound, AppLeagueView } from '../../../../lib/league/appLeagueView';
import { OpenRoundCard, type RoundAction } from '../components/league/OpenRoundCard';
import { RoundList } from '../components/league/RoundList';
import { SimSettingsCard } from '../components/league/SimSettingsCard';
import { StandingsTable } from '../components/league/StandingsTable';
import { LeagueLoadFailed, LeagueLoading } from '../components/league/LeagueStates';
import { StatusPill } from '../components/league/LeaguePills';
import { fetchLeague, type LeagueLoadFailure } from '../data/league';
import { useMarkVisitRead } from '../lib/useMarkVisitRead';
import { MARKER_TEXT, awaitingMarkerLine, waitsForLine } from '../lib/markerCopy';
import { markerQueues, type QueuedCard } from '../../../../lib/league/markerQueues';
import {
  LEAGUE_TEXT,
  formatLine,
  leagueStatusLabel,
  nextRoundOf,
  nextRoundOpens,
  openRoundOf,
  seasonLine,
  settingsHeading,
} from '../lib/leagueCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, useTheme } from '../theme';

export function League({ navigation, route }: ScreenProps<'League'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { leagueId } = route.params;
  // #2638: varslene om at en runde er åpen eller stenger snart, lenker hit.
  useMarkVisitRead('league', leagueId);
  const [view, setView] = useState<AppLeagueView | null>(null);
  const [failure, setFailure] = useState<LeagueLoadFailure | null>(null);
  const [loading, setLoading] = useState(false);
  // Bare dra-ned viser hjulet; en henting ved fokus går stille.
  const [pulling, setPulling] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchLeague(leagueId);
    setNow(new Date());
    if (result.ok) {
      setView(result.view);
      setFailure(null);
    } else {
      setFailure(result.reason);
    }
    setLoading(false);
    setPulling(false);
  }, [leagueId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onPull = useCallback(() => {
    setPulling(true);
    void load();
  }, [load]);

  if (view === null && failure === null) return <LeagueLoading />;
  // Ligaen finnes ikke (lenger) for deg: det skjermen hadde, er ikke ditt å se.
  if (view === null || failure === 'not_found') {
    return <LeagueLoadFailed reason={failure ?? 'load_failed'} retrying={loading} onRetry={() => void load()} />;
  }

  const stale = failure !== null;
  const { league, me } = view;
  const open = openRoundOf(view.rounds, now);
  const next = nextRoundOf(view.rounds, now);
  const settingsRound = open ?? next;
  // #2661: kortene som venter på et svar; regelen er den delte `markerQueues`.
  const nameOf = (userId: string) =>
    view.participants.find((p) => p.userId === userId)?.name ?? MARKER_TEXT.unknownPlayer;
  const queues = markerQueues(view.rounds, me.userId, me.isOrganizer);
  const markerRows = queues.forMarker;
  const organizerRows = queues.forOrganizer;
  const openMarker = (a: QueuedCard) =>
    navigation.navigate('MarkerApprove', { leagueId, gameId: a.gameId, userId: a.userId });

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 20 }]}
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} tintColor={colors.primary} />}
      testID="league-screen"
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" testID="league-name">
          {league.name}
        </Text>
        <View style={styles.meta}>
          <StatusPill label={leagueStatusLabel(league.status)} live={league.status === 'active'} />
          <Text style={[styles.season, { color: colors.muted }]}>{seasonLine(league.seasonStart, league.seasonEnd)}</Text>
        </View>
        <Text style={[styles.format, { color: colors.muted }]} testID="league-format">
          {formatLine(view)}
        </Text>
      </View>

      {stale ? (
        <Text style={[styles.stale, { color: colors.muted }]} testID="league-stale">
          {LEAGUE_TEXT.stale}
        </Text>
      ) : null}

      <MarkerQueue
        title={MARKER_TEXT.queueHeading}
        rows={markerRows.map((a) => ({ ...a, name: nameOf(a.userId), sub: a.roundLabel }))}
        onOpen={openMarker}
        testID="league-marker-queue"
      />
      <MarkerQueue
        title={MARKER_TEXT.organizerQueueHeading}
        rows={organizerRows.map((a) => ({
          ...a,
          name: nameOf(a.userId),
          sub: `${a.roundLabel} · ${waitsForLine(nameOf(a.markerUserId))}`,
        }))}
        onOpen={openMarker}
        testID="league-organizer-marker-queue"
      />

      {league.isSimulator && settingsRound ? (
        <View testID="league-settings">
          <SectionHead title={settingsHeading(settingsRound.label)} />
          <SimSettingsCard round={settingsRound} defaultOpen={false} />
        </View>
      ) : null}

      {open ? (
        <OpenRoundCard
          view={view}
          round={open}
          action={roundAction(view, open, next, stale, () =>
            navigation.navigate('LeagueRoundStart', { leagueId, roundId: open.id }),
          )}
        />
      ) : null}

      <SectionHead title={LEAGUE_TEXT.seasonTable} />
      <StandingsTable view={view} now={now} />

      <SectionHead title={LEAGUE_TEXT.rounds} />
      <RoundList view={view} now={now} />
    </ScrollView>
  );

  function roundAction(
    v: AppLeagueView,
    round: AppLeagueRound,
    nextRound: AppLeagueRound | null,
    offline: boolean,
    onPlay: () => void,
  ): RoundAction {
    if (!me.isParticipant) return { kind: 'none' };
    // #2661: levert, og markøren har ikke svart ennå.
    const myWait = round.awaitingMarker.find((a) => a.userId === me.userId);
    if (myWait) {
      const marker = v.participants.find((p) => p.userId === myWait.markerUserId)?.name;
      return { kind: 'note', text: awaitingMarkerLine(marker ?? MARKER_TEXT.unknownPlayer) };
    }
    if (round.delivered.includes(me.userId)) {
      return { kind: 'delivered', nextOpens: nextRound ? nextRoundOpens(nextRound.opensAt) : null };
    }
    if (round.inProgress.includes(me.userId) || v.league.status !== 'active') return { kind: 'none' };
    if (!round.ready) return { kind: 'note', text: LEAGUE_TEXT.missingSetup };
    return offline ? { kind: 'play-offline' } : { kind: 'play', onPress: onPlay };
  }
}

/**
 * #2661: kortene som venter på et svar, øverst på ligasiden, som nettets
 * `MarkerQueueCard`: én rad per kort, et trykk åpner markørens skjerm.
 */
function MarkerQueue<T extends { gameId: string; userId: string; name: string; sub: string }>({
  title,
  rows,
  onOpen,
  testID,
}: {
  title: string;
  rows: T[];
  onOpen: (row: T) => void;
  testID: string;
}) {
  const { colors } = useTheme();
  if (rows.length === 0) return null;
  return (
    <View testID={testID}>
      <SectionHead title={title} />
      <View style={[styles.queueCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {rows.map((row, i) => (
          <Pressable
            key={`${row.gameId}:${row.userId}`}
            onPress={() => onOpen(row)}
            accessibilityRole="button"
            testID={`marker-queue-${row.gameId}-${row.userId}`}
            style={[styles.queueRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
          >
            <View style={styles.queueText}>
              <Text style={[styles.queueName, { color: colors.text }]} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={[styles.queueSub, { color: colors.muted }]} numberOfLines={1}>
                {row.sub}
              </Text>
            </View>
            <Text style={[styles.queueLink, { color: colors.primary }]}>{MARKER_TEXT.review}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Tegningenes `.sechead`: små sperrede versaler, 22 over og 8 under. */
function SectionHead({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.sectionHead, { color: colors.muted }]}>
      {title}
    </Text>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  // `.lh`: 6 under toppen, 20 fra kanten.
  head: { paddingTop: 6, paddingHorizontal: 20 },
  title: { ...fraunces(500, 28, 34, { multiline: true }) },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  season: { ...interLine(12, 16), fontFamily: FONTS.sans },
  format: { ...interLine(13, 16), fontFamily: FONTS.sans, marginTop: 6 + interLine(13, 16).marginTop },
  stale: { ...interLine(14, 20, { multiline: true }), fontFamily: FONTS.sans, paddingTop: 6, paddingHorizontal: 20 },
  queueCard: { marginHorizontal: 16, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10 },
  queueText: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  queueName: { ...interLine(15, 19), fontFamily: FONTS.sansSemiBold },
  queueSub: { ...interLine(12, 15), fontFamily: FONTS.sans, marginTop: 2 },
  queueLink: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
  sectionHead: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingTop: 22,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
});
