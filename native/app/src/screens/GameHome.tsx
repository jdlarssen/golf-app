// Native N3 (#1825): spill-hjem — det ene stedet som avgjør hva spilleren skal
// gjøre nå.
//
// CTA-en kommer fra `computePrimaryCtaState`, speilet av webbens PrimaryCta, og
// telles på LOKALE slag: står det tre hull i SQLite som ikke har rukket opp til
// serveren ennå, teller de likevel. Alt annet på skjermen er bundelen.
import { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NO_REJECTION_REASON } from '../../../../lib/games/rejectionReason';
import { STATUS_LABELS, type GameStatus } from '../../../../lib/games/status';
import type { GameMode } from '../../../../lib/scoring/modes/types';
import type { BundlePlayer, GameBundle } from '../data/gameBundle';
import { seedGameScores } from '../data/seedScores';
import { displayName, formatTeeOff } from '../lib/display';
import { isScoringSupported, UNSUPPORTED_FORMAT_MESSAGE } from '../lib/formatGate';
import {
  computePrimaryCtaState,
  nextUnfilledHole,
} from '../lib/primaryCtaState';
import { findInRoster, pendingApprovals, toRoster } from '../lib/roster';
import { filledHolesFor, useGameBundle, useLocalScores } from '../lib/useGameData';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { COLORS, ui } from '../theme';

/** Appen fører bare hele runder — segment-spill gates bort i `formatGate`. */
const HOLE_COUNT = 18;

export function GameHome({ route, navigation }: ScreenProps<'GameHome'>) {
  const { gameId } = route.params;
  const { userId } = useSession();
  const { bundle, errorText, loading } = useGameBundle(gameId);
  const { scores, reload } = useLocalScores(gameId);

  // Hent ned det serveren har hver gang skjermen åpnes, og les lokalt etterpå.
  // Feiler seeden (offline), står de lokale radene som de var.
  useFocusEffect(
    useCallback(() => {
      void seedGameScores(gameId)
        .catch(() => undefined)
        .then(() => reload());
    }, [gameId, reload]),
  );

  if (!bundle) {
    if (loading) {
      return (
        <View style={ui.centered} testID="game-loading">
          <ActivityIndicator color={COLORS.forest} />
        </View>
      );
    }
    return (
      <View style={ui.centered} testID="game-error">
        <Text style={ui.error}>
          Fikk ikke tak i spillet. Sjekk nettet og prøv igjen.
        </Text>
      </View>
    );
  }

  const { game } = bundle;
  const roster = toRoster(bundle.players);
  const me = findInRoster(roster, userId);
  const mode = game.gameMode as GameMode;
  const supported = isScoringSupported(game);
  const filled = filledHolesFor(scores, userId);
  const approvals = me ? pendingApprovals(roster, mode, userId) : [];

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="game-home-screen">
      <Text style={ui.title} testID="game-name">
        {game.name}
      </Text>
      <Text style={ui.muted} testID="game-status">
        {STATUS_LABELS[game.status as GameStatus] ?? game.status}
        {bundle.courseName ? ` · ${bundle.courseName}` : ''}
        {bundle.teeBoxName ? ` · ${bundle.teeBoxName}` : ''}
      </Text>
      {game.scheduledTeeOffAt ? (
        <Text style={ui.muted} testID="game-tee-off">
          Tee-off {formatTeeOff(game.scheduledTeeOffAt)}
        </Text>
      ) : null}

      {me?.player.courseHandicap != null ? (
        <Text style={[ui.body, ui.num]} testID="my-course-handicap">
          Banehandicapet ditt: {me.player.courseHandicap}
        </Text>
      ) : null}

      {me?.player.rejectionReason ? (
        <View style={ui.banner} testID="rejected-banner">
          <Text style={ui.body}>Kortet ditt ble sendt tilbake.</Text>
          {me.player.rejectionReason !== NO_REJECTION_REASON ? (
            <Text style={ui.muted}>{me.player.rejectionReason}</Text>
          ) : null}
        </View>
      ) : null}

      <PrimarySection
        bundle={bundle}
        me={me?.player}
        supported={supported}
        filled={filled}
        onNavigate={navigation.navigate}
      />

      {supported ? (
        <Pressable
          style={ui.buttonSecondary}
          onPress={() => navigation.navigate('Scorecard', { gameId })}
          testID="open-scorecard"
        >
          <Text style={ui.buttonSecondaryText}>Scorekort</Text>
        </Pressable>
      ) : null}

      {approvals.length > 0 ? (
        <Pressable
          style={ui.buttonSecondary}
          onPress={() => navigation.navigate('Approve', { gameId })}
          testID="open-approve"
        >
          <Text style={ui.buttonSecondaryText}>Godkjenn ({approvals.length})</Text>
        </Pressable>
      ) : null}

      <Text style={ui.sectionTitle}>Spillere</Text>
      <View style={ui.card} testID="roster">
        {bundle.players.map((player) => (
          <RosterRow key={player.userId} player={player} isMe={player.userId === userId} />
        ))}
      </View>

      {errorText ? (
        <Text style={ui.muted} testID="game-stale">
          Viser lagret informasjon — fikk ikke kontakt med serveren.
        </Text>
      ) : null}
    </ScrollView>
  );
}

/**
 * CTA-en, banneret eller henvisningen til nettsiden — i den rekkefølgen
 * spilleren skal møte dem.
 */
function PrimarySection({
  bundle,
  me,
  supported,
  filled,
  onNavigate,
}: {
  bundle: GameBundle;
  me: BundlePlayer | undefined;
  supported: boolean;
  filled: number[];
  onNavigate: ScreenProps<'GameHome'>['navigation']['navigate'];
}) {
  const { game } = bundle;

  if (!supported) {
    return (
      <View style={ui.banner} testID="format-gate">
        <Text style={ui.body}>{UNSUPPORTED_FORMAT_MESSAGE}</Text>
      </View>
    );
  }

  if (!me) {
    return (
      <View style={ui.banner} testID="not-a-player">
        <Text style={ui.body}>Du står ikke oppført som spiller her.</Text>
      </View>
    );
  }

  if (me.withdrawnAt) {
    return (
      <View style={ui.banner} testID="withdrawn-banner">
        <Text style={ui.body}>Du er trukket fra dette spillet.</Text>
      </View>
    );
  }

  if (game.status === 'scheduled') {
    return (
      <View style={ui.banner} testID="waiting-room">
        <Text style={ui.body}>
          Runden er ikke startet ennå. Spillet åpner for føring når arrangøren
          starter det.
        </Text>
      </View>
    );
  }

  if (game.status === 'finished') {
    return (
      <View style={ui.banner} testID="finished-banner">
        <Text style={ui.body}>Runden er avsluttet. Scorekortet er lesevisning.</Text>
      </View>
    );
  }

  if (game.status !== 'active') {
    return null;
  }

  const state = computePrimaryCtaState({
    strokesCount: filled.length,
    totalHoles: HOLE_COUNT,
    submittedAt: me.submittedAt,
    approvedAt: me.approvedAt,
    requirePeerApproval: game.requirePeerApproval,
  });

  if (state === 'submitted_pending_approval') {
    return (
      <View style={ui.banner} testID="submitted-banner">
        <Text style={ui.body}>Kortet er levert. Nå venter det på en makker.</Text>
      </View>
    );
  }

  if (state === 'submitted_approved') {
    return (
      <View style={ui.banner} testID="submitted-banner">
        <Text style={ui.body}>Kortet er levert og godkjent.</Text>
      </View>
    );
  }

  if (state === 'ready_to_submit') {
    return (
      <Pressable
        style={ui.button}
        onPress={() => onNavigate('Scorecard', { gameId: game.id })}
        testID="primary-cta"
      >
        <Text style={ui.buttonText}>Se over og lever</Text>
      </Pressable>
    );
  }

  const nextHole = nextUnfilledHole(filled, HOLE_COUNT);
  return (
    <View>
      <Pressable
        style={ui.button}
        onPress={() => onNavigate('Hole', { gameId: game.id, holeNumber: nextHole })}
        testID="primary-cta"
      >
        <Text style={ui.buttonText}>
          {state === 'not_started' ? 'Start runden' : 'Fortsett runden'}
        </Text>
      </Pressable>
      {state === 'in_progress' ? (
        <Text style={[ui.muted, ui.num, styles.ctaSubtext]}>
          {filled.length} av {HOLE_COUNT} hull ført
        </Text>
      ) : null}
    </View>
  );
}

function RosterRow({ player, isMe }: { player: BundlePlayer; isMe: boolean }) {
  const marks: string[] = [];
  if (player.flightNumber != null) marks.push(`Flight ${player.flightNumber}`);
  if (player.teamNumber != null) marks.push(`Lag ${player.teamNumber}`);
  if (player.withdrawnAt) marks.push('Trukket');
  else if (player.approvedAt) marks.push('Godkjent');
  else if (player.submittedAt) marks.push('Levert');

  return (
    <View style={styles.rosterRow} testID={`roster-row-${player.userId}`}>
      <Text style={[ui.body, isMe && styles.meName]}>
        {displayName(player)}
        {isMe ? ' (deg)' : ''}
      </Text>
      {marks.length > 0 ? <Text style={ui.muted}>{marks.join(' · ')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ctaSubtext: { textAlign: 'center', marginTop: 6 },
  rosterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  meName: { fontWeight: '700' },
});
