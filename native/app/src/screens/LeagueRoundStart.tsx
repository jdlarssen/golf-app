// #2638 Del 2: «Start runden» i en ligarunde (tegning 5 og 5b).
//
// Rundas innstillinger står åpne øverst i en simulatorliga, så spilleren kan
// stille inn Trackman før første slag. Under dem velger spilleren medspillere
// blant deltakerne. Den som har levert eller spiller runden nå, er låst, som
// på nettsiden. Knappen er aktiv når valget holder for markørregelen
// (`minFlightPlayers`, `lib/league/flightRules.ts`): i en simulatorliga kan du
// starte alene, i en vanlig liga trengs minst én medspiller.
//
// Starten går via `POST /api/liga/rounds/[roundId]/start`, og alle reglene
// sjekkes der (`startLeagueRoundFlightCore`). Et avslag vises med nettsidens
// ord (`describeLeagueStartRefusal`) i den gule boksen over knappen. Er det
// alt kjent at runden ikke kan startes (vinduet er stengt, du har levert, du
// er i gang, banen mangler), står boksen rett under tittelen, som på
// tegning 5b. Etter start erstatter spillet denne skjermen, så «tilbake» fra
// spillet går til ligaen.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppLeagueParticipant, AppLeagueRound, AppLeagueView } from '../../../../lib/league/appLeagueView';
import { MAX_CO_PLAYERS, minFlightPlayers } from '../../../../lib/league/flightRules';
import type { LeagueStartRefusal } from '../../../../lib/league/leagueStartRefusal';
import { nameInitials } from '../../../../lib/names/initials';
import { LeagueLoadFailed, LeagueLoading, LeagueNotice } from '../components/league/LeagueStates';
import { SimSettingsCard } from '../components/league/SimSettingsCard';
import { LigaHakeIcon } from '../components/icons/Icons';
import {
  fetchLeague,
  startLeagueRound,
  type LeagueLoadFailure,
  type LeagueStartFailure,
} from '../data/league';
import {
  ROUND_START_TEXT,
  START_REFUSAL_TEXT,
  describeLeagueStartRefusal,
  participantLabel,
  roundWindow,
  settingsHeading,
} from '../lib/leagueCopy';
import { formatHcpNb } from '../lib/profileCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, useTheme } from '../theme';

type Lock = 'delivered' | 'in_progress' | null;

/**
 * Det som alt er kjent fra ligasiden: grunnen til at runden ikke kan startes,
 * i kjernens egne koder, eller `null`. Serveren avgjør fortsatt når knappen
 * trykkes; dette bestemmer bare hva skjermen viser først.
 */
export function knownRefusal(
  round: AppLeagueRound,
  meId: string,
  now: Date,
): Extract<LeagueStartRefusal, 'outside_window' | 'already_played' | 'flight_in_progress' | 'round_not_ready'> | null {
  if (roundWindow(round, now) !== 'open') return 'outside_window';
  if (round.delivered.includes(meId)) return 'already_played';
  if (round.inProgress.includes(meId)) return 'flight_in_progress';
  if (!round.ready) return 'round_not_ready';
  return null;
}

export function LeagueRoundStart({ navigation, route }: ScreenProps<'LeagueRoundStart'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { leagueId, roundId } = route.params;
  const [view, setView] = useState<AppLeagueView | null>(null);
  const [failure, setFailure] = useState<LeagueLoadFailure | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<LeagueStartFailure | null>(null);

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
  }, [leagueId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (view === null && failure === null) return <LeagueLoading />;
  if (view === null || failure === 'not_found') {
    return <LeagueLoadFailed reason={failure ?? 'load_failed'} retrying={loading} onRetry={() => void load()} />;
  }

  const round = view.rounds.find((r) => r.id === roundId);
  if (!round) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.bg }]} testID="round-start-missing">
        <Text style={[styles.missingText, { color: colors.text }]}>{START_REFUSAL_TEXT.round_not_found}</Text>
      </View>
    );
  }

  const meId = view.me.userId;
  const minCoPlayers = minFlightPlayers(view.league.isSimulator) - 1;
  const known = knownRefusal(round, meId, now);
  const coPlayers = view.participants
    .filter((p) => p.userId !== meId)
    .map((p) => ({
      participant: p,
      lock: (round.delivered.includes(p.userId)
        ? 'delivered'
        : round.inProgress.includes(p.userId)
          ? 'in_progress'
          : null) as Lock,
    }));
  const chosen = coPlayers.filter((c) => c.lock === null && selected.has(c.participant.userId));
  const full = chosen.length >= MAX_CO_PLAYERS;
  const canStart = !pending && chosen.length >= minCoPlayers;

  const toggle = (userId: string) => {
    setRefusal(null);
    setSelected((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(userId)) nextSet.delete(userId);
      else nextSet.add(userId);
      return nextSet;
    });
  };

  const start = async () => {
    setPending(true);
    setRefusal(null);
    const result = await startLeagueRound(
      round.id,
      chosen.map((c) => c.participant.userId),
    );
    if (result.ok) {
      navigation.replace('GameHome', { gameId: result.gameId });
      return;
    }
    setRefusal(result.reason);
    setPending(false);
  };

  const button = (
    <Pressable
      onPress={() => void start()}
      disabled={!canStart}
      accessibilityRole="button"
      accessibilityState={{ disabled: !canStart, busy: pending }}
      style={[styles.cta, { backgroundColor: colors.primary }, canStart ? null : styles.ctaOff]}
      testID="round-start-submit"
    >
      <Text style={[styles.ctaText, { color: colors.onPrimary }]}>
        {pending ? ROUND_START_TEXT.startPending : ROUND_START_TEXT.startButton}
      </Text>
    </Pressable>
  );

  const title = (
    <View style={styles.titleBlock}>
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
        {round.label}
      </Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>{view.league.name}</Text>
    </View>
  );

  // Tegning 5b: kjent avslag, rett under tittelen.
  if (known) {
    return (
      <ScrollView
        contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 20 }]}
        testID="round-start-screen"
      >
        {title}
        <View style={styles.inline}>
          <LeagueNotice
            text={describeLeagueStartRefusal(refusal ?? known)}
            testID="round-start-refusal"
          />
          {button}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]} testID="round-start-screen">
      <ScrollView contentContainerStyle={styles.scrollBody} testID="round-start-scroll">
        {title}
        {view.league.isSimulator ? (
          <View testID="round-start-settings">
            <SectionHead title={settingsHeading(round.label)} />
            <SimSettingsCard round={round} defaultOpen />
          </View>
        ) : null}
        <SectionHead title={ROUND_START_TEXT.coPlayersLegend} />
        <Text style={[styles.note, { color: colors.muted }]} testID="round-start-rule">
          {view.league.isSimulator ? ROUND_START_TEXT.simulatorRule : ROUND_START_TEXT.markerRule}
        </Text>
        {coPlayers.length === 0 ? (
          minCoPlayers > 0 ? (
            <View style={styles.inline}>
              <LeagueNotice text={ROUND_START_TEXT.noCoPlayers} testID="round-start-no-co-players" />
            </View>
          ) : null
        ) : (
          <View
            style={[styles.pick, { backgroundColor: colors.surface, borderColor: colors.border }]}
            testID="round-start-players"
          >
            {coPlayers.map(({ participant, lock }, index) => (
              <PlayerRow
                key={participant.userId}
                participant={participant}
                all={view.participants}
                lock={lock}
                checked={lock === null && selected.has(participant.userId)}
                blocked={lock === null && !selected.has(participant.userId) && full}
                first={index === 0}
                onToggle={() => toggle(participant.userId)}
              />
            ))}
          </View>
        )}
      </ScrollView>
      <View
        style={[
          styles.foot,
          { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: 22 + insets.bottom },
        ]}
      >
        {refusal ? <LeagueNotice text={describeLeagueStartRefusal(refusal)} testID="round-start-refusal" /> : null}
        {button}
      </View>
    </View>
  );
}

function PlayerRow({
  participant,
  all,
  lock,
  checked,
  blocked,
  first,
  onToggle,
}: {
  participant: AppLeagueParticipant;
  all: readonly AppLeagueParticipant[];
  lock: Lock;
  checked: boolean;
  /** Flighten er full: en ledig rad kan ikke velges før en annen tas bort. */
  blocked: boolean;
  first: boolean;
  onToggle: () => void;
}) {
  const { colors, scheme } = useTheme();
  const disabled = lock !== null || blocked;
  const name = participantLabel(participant, all);
  const hcp = participant.hcpIndex !== null ? `HCP ${formatHcpNb(participant.hcpIndex)}` : null;
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={name}
      style={[styles.row, first ? null : { borderTopWidth: 1, borderTopColor: colors.divider }]}
      testID={`round-start-player-${participant.userId}`}
    >
      <View
        style={[
          styles.avatar,
          // Tegningenes `--av-other-bg`: salvien i lys, skogflaten i natt.
          { backgroundColor: scheme === 'dark' ? colors.surfaceStrong : colors.primarySoft },
          disabled ? styles.dim : null,
        ]}
      >
        <Text style={[styles.avatarText, { color: colors.primary }]}>
          {nameInitials(participant.fullName ?? participant.name)}
        </Text>
      </View>
      <View style={[styles.rowText, disabled ? styles.dim : null]}>
        <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
        {hcp ? <Text style={[styles.hcp, { color: colors.muted }]}>{hcp}</Text> : null}
      </View>
      {lock ? (
        <Text style={[styles.lock, { color: colors.muted }]} testID={`round-start-lock-${participant.userId}`}>
          {lock === 'delivered' ? ROUND_START_TEXT.lockDelivered : ROUND_START_TEXT.lockInProgress}
        </Text>
      ) : (
        <View
          style={[
            styles.ring,
            checked
              ? { backgroundColor: colors.primary, borderColor: colors.primary }
              : { borderColor: colors.scoreUnsetFg },
            blocked ? styles.dim : null,
          ]}
        >
          {checked ? <LigaHakeIcon color={colors.onPrimary} size={14} /> : null}
        </View>
      )}
    </Pressable>
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
  screen: { flex: 1 },
  scroll: { flexGrow: 1 },
  scrollBody: { paddingBottom: 20 },
  // `.ptitle`: 6 under toppen, 20 fra kanten.
  titleBlock: { paddingTop: 6, paddingHorizontal: 20 },
  title: { ...fraunces(500, 30, 37, { multiline: true }) },
  subtitle: { ...interLine(13, 16), fontFamily: FONTS.sans, marginTop: 2 + interLine(13, 16).marginTop },
  sectionHead: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingTop: 22,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  // `.note`: 13/18, 20 fra kanten, 10 over lista.
  note: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, paddingHorizontal: 20, paddingBottom: 10 },
  // Tegning 5b: boksen og knappen 16 fra kanten, 14 under tittelen.
  inline: { marginHorizontal: 16, marginTop: 14 },
  pick: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  // `.prow`: minst 52 høy, 8 og 14 inn, 12 mellom.
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 14, minHeight: 52 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
  rowText: { flex: 1, minWidth: 0 },
  name: { ...interLine(15, 20), fontFamily: FONTS.sansSemiBold },
  hcp: { ...interLine(12, 16), fontFamily: FONTS.sans },
  lock: { ...interLine(12, 16), fontFamily: FONTS.sansSemiBold },
  ring: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.5 },
  // `.foot`: flaten med strek over, 12 og 16 inn, 22 under.
  foot: { borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 16 },
  cta: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  ctaOff: { opacity: 0.45 },
  ctaText: { ...interLine(16, 19), fontFamily: FONTS.sansSemiBold },
  missing: { flex: 1, alignItems: 'center', paddingTop: 26, paddingHorizontal: 24 },
  missingText: { ...interLine(16, 23, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
});
