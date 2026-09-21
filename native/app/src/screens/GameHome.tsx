// Native N3 (#1825): spill-hjem — det ene stedet som avgjør hva spilleren skal
// gjøre nå.
//
// CTA-en kommer fra `computePrimaryCtaState`, speilet av webbens PrimaryCta, og
// telles på LOKALE slag: står det tre hull i SQLite som ikke har rukket opp til
// serveren ennå, teller de likevel. Alt annet på skjermen er bundelen.
//
// N4 (#1828): i lag-formatene som deler én ball er «mine hull» LAGETS hull —
// kapteinens rader — og «levert» er lagets stempel, ikke bare mitt. Begge
// spørsmålene stilles til delte hjelpere; CTA-regelen selv er uendret.
//
// N6b (#1855): arrangørens roster-drift henger under skjermen, og ALLE
// deltakere bekrefter plassen sin stille når de åpner den — webbens
// «besøk = bekreftelse» (#463), uten eget UI.
//
// N6c (#1856): arrangøren avslutter runden herfra — men på en egen flate
// (`EndGame`), ikke med en knapp her. Flippen er praktisk irreversibel, og
// husregelen er at slikt får sin egen bekreftelses-side.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { modeCollapsesToTeamCard } from '../../../../lib/scoring/modes/types';
import { OrganiserSection } from '../components/game/OrganiserSection';
import { HakeIcon } from '../components/icons/Icons';
import type { BundlePlayer, GameBundle } from '../data/gameBundle';
import { confirmParticipation } from '../data/rosterActions';
import { seedGameScores } from '../data/seedScores';
import { undoSelfWithdraw } from '../data/withdrawSelf';
import {
  describeSelfWithdrawFailure,
  WITHDRAW_SELF,
} from '../lib/rosterCopy';
import { displayName, formatTeeOff } from '../lib/display';
import {
  GATE_LINK_LABEL,
  gameWebPath,
  gateMessage,
  gateReason,
  type GateReason,
} from '../lib/formatGate';
import { WebLinkButton } from '../components/WebLinkButton';
import { nameLookup } from '../lib/leaderboardModel';
import {
  computePrimaryCtaState,
  nextUnfilledHole,
} from '../lib/primaryCtaState';
import {
  findInRoster,
  pendingApprovals,
  rosterPlacementMarks,
  rosterStatus,
  shouldConfirmParticipation,
  toRoster,
} from '../lib/roster';
import {
  buildTeamCards,
  filledHolesForOwner,
  findMyTeamCard,
  myTeamCaptainId,
} from '../lib/teamPlay';
import { useGameBundle, useLocalScores, useTeamScores } from '../lib/useGameData';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, useTheme } from '../theme';

/** Appen fører bare hele runder — segment-spill gates bort i `formatGate`. */
const HOLE_COUNT = 18;

export function GameHome({ route, navigation }: ScreenProps<'GameHome'>) {
  const { colors, ui } = useTheme();
  const { gameId } = route.params;
  const { userId } = useSession();
  const { bundle, errorText, loading, refresh } = useGameBundle(gameId);
  const { scores: localScores, reload } = useLocalScores(gameId);
  // #2067: hullene en trukket kaptein førte, teller for laget. Foldes inn før
  // noe annet leser slagene.
  const scores = useTeamScores(localScores, bundle);

  // Hent ned det serveren har hver gang skjermen åpnes, og les lokalt etterpå.
  // Feiler seeden (offline), står de lokale radene som de var.
  useFocusEffect(
    useCallback(() => {
      void seedGameScores(gameId)
        .catch(() => undefined)
        .then(() => reload());
    }, [gameId, reload]),
  );

  // Bekreft plassen min ved å ÅPNE spillet (#463) — samme modell som webben,
  // og bevisst uten UI: arrangøren ser bare at merket dukker opp i rosteret.
  //
  // Oppslaget gjøres her, foran de tidlige returene, fordi hooks ikke kan stå
  // etter dem. `refresh` etterpå henter bundelen med `accepted_at` satt, og
  // flagget slår om til false — effekten kan derfor ikke gå i ring.
  // Skrivingen er best-effort: uten nett skjer ingenting, og neste åpning
  // prøver igjen.
  const confirmNeeded = shouldConfirmParticipation(
    bundle?.players.find((player) => player.userId === userId),
    bundle?.game.status ?? 'draft',
  );
  useEffect(() => {
    if (!confirmNeeded) return;
    void confirmParticipation(gameId).then(() => refresh());
  }, [confirmNeeded, gameId, refresh]);

  if (!bundle) {
    if (loading) {
      return (
        <View style={ui.centered} testID="game-loading">
          <ActivityIndicator color={colors.primary} />
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
  const gated = gateReason(game);
  const supported = gated === null;
  // Lag-formatene: mine hull er kapteinens rader, og «levert» er lagets
  // stempel («noen på laget» — samme regel webbens lagkort bruker).
  const myCaptainId = myTeamCaptainId(roster, userId);
  const myTeamCard =
    myCaptainId != null && modeCollapsesToTeamCard(mode, HOLE_COUNT)
      ? findMyTeamCard(buildTeamCards(roster, nameLookup(bundle.players)), userId)
      : null;
  const filled = filledHolesForOwner(scores, mode, userId, myCaptainId);
  // Godkjenn-lista er per SPILLER også i lag-formater: hvert medlem har sin
  // egen `game_players`-rad, og den delte regelen er alt mode-bevisst.
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
        gated={gated}
        filled={filled}
        submittedAt={myTeamCard ? myTeamCard.submittedAt : (me?.player.submittedAt ?? null)}
        approvedAt={myTeamCard ? myTeamCard.approvedAt : (me?.player.approvedAt ?? null)}
        onChanged={refresh}
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

      {/* Resultattabellen følger samme gate som føringen (#1828): et format
          appen ikke kan taste, viser den heller ikke tall for. Planlagte spill
          har ingen slag ennå, så lenken dukker opp når runden er i gang. */}
      {supported && game.status !== 'scheduled' ? (
        <Pressable
          style={ui.buttonSecondary}
          onPress={() => navigation.navigate('Leaderboard', { gameId })}
          testID="open-leaderboard"
        >
          <Text style={ui.buttonSecondaryText}>Resultater</Text>
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
          <RosterRow
            key={player.userId}
            player={player}
            isMe={player.userId === userId}
            gameMode={mode}
            players={bundle.players}
          />
        ))}
      </View>

      {/* Arrangør-seksjonen henger på `created_by`, ikke på et admin-flagg:
          appen er arrangørens flate, Sekretariatet bor på nettsiden. */}
      {game.createdBy === userId ? (
        <OrganiserSection
          bundle={bundle}
          userId={userId}
          onChanged={refresh}
          onFinish={() => navigation.navigate('EndGame', { gameId })}
        />
      ) : null}

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
  gated,
  filled,
  submittedAt,
  approvedAt,
  onChanged,
  onNavigate,
}: {
  bundle: GameBundle;
  me: BundlePlayer | undefined;
  gated: GateReason | null;
  filled: number[];
  /**
   * Stemplene CTA-en skal regne på — mine egne, eller lagets i de formatene
   * som deler ett kort. Sendes inn i stedet for å leses av `me`, slik at
   * begge tilfellene går gjennom samme fem grener.
   */
  submittedAt: string | null;
  approvedAt: string | null;
  /** Hent bundelen på nytt. Kalles etter «Angre trekk», uansett utfall. */
  onChanged: () => void | Promise<void>;
  onNavigate: ScreenProps<'GameHome'>['navigation']['navigate'];
}) {
  const { ui } = useTheme();
  const { game } = bundle;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * «Angre trekk» på trukket-banneret (#1917).
   *
   * Banneret sa bare at du var trukket. Trakk du deg ved et uhell — eller
   * ombestemte du deg på banen — var eneste vei ut nettsiden, og det er nøyaktig
   * blindveien #1891 ryddet et annet sted.
   *
   * Går via `DELETE /api/games/[id]/withdraw-self`, aldri en skriving:
   * `guard_game_players_self_update` vakt (c) (0147/0168) nekter appen å røre
   * `withdrawn_at` på egen rad. `onChanged()` uansett utfall — bundelen er
   * fasiten for hva skjermen skal vise etterpå, så `kept` leses ikke.
   */
  const undoWithdraw = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await undoSelfWithdraw(game.id);
      setNotice(
        result.ok ? null : describeSelfWithdrawFailure(result.reason, 'undo'),
      );
    } catch {
      setNotice(describeSelfWithdrawFailure('withdraw_failed', 'undo'));
    } finally {
      await onChanged();
      setBusy(false);
    }
  }, [game.id, onChanged]);

  if (gated !== null) {
    return (
      <View style={ui.banner} testID="format-gate">
        <Text style={ui.body}>{gateMessage(gated)}</Text>
        {/* #1891: dette er hovedstedet spilleren møter gaten — leaderboardet er
            det andre. Uten knappen er setningen en blindvei: den sier hvor
            runden føres, men ikke hvordan du kommer dit. */}
        <WebLinkButton
          label={GATE_LINK_LABEL}
          path={gameWebPath(game.id)}
          testID="format-gate-link"
        />
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
        {/* #1917: banneret var bare en beskjed. Nå har det en vei ut. Knappen
            står her for ALLE trukne, også den arrangøren trakk — nøyaktig som
            nettsidens angre-knapp gjør i dag. */}
        <Pressable
          style={ui.buttonSecondary}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          testID="withdrawn-undo"
          onPress={() =>
            Alert.alert(WITHDRAW_SELF.undoTitle, WITHDRAW_SELF.undoBody, [
              { text: 'Avbryt', style: 'cancel' },
              {
                text: WITHDRAW_SELF.undoCta,
                onPress: () => void undoWithdraw(),
              },
            ])
          }
        >
          <Text style={ui.buttonSecondaryText}>{WITHDRAW_SELF.undoLabel}</Text>
        </Pressable>
        {notice ? (
          <Text style={ui.error} testID="withdrawn-undo-notice">
            {notice}
          </Text>
        ) : null}
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
    submittedAt,
    approvedAt,
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

/**
 * Én rad i spillerlista. Eksportert for render-testen (samme grep som
 * `LeaderboardBody`) — hva raden SIER er delt logikk i `rosterMarks`, men at
 * den lange wolf-merkelappen faktisk får plass er det bare en render som
 * svarer på.
 *
 * Statusen står for seg (#1879): «Levert» og «Godkjent» får en hake foran
 * ordet — glyfen leses raskere i en tett liste. Aldri haken alene: den er lik
 * for begge, så det er ordet som skiller dem. «Trukket» har ingen glyf som
 * leses riktig uten ord, og står derfor som tekst.
 */
export function RosterRow({
  player,
  isMe,
  gameMode,
  players,
}: {
  player: BundlePlayer;
  isMe: boolean;
  gameMode: GameMode;
  /** Hele rosteret — `rosterMarks` teller selv n-en wolf-rotasjonen går over. */
  players: readonly BundlePlayer[];
}) {
  const { colors, ui } = useTheme();
  const marks = rosterPlacementMarks(player, gameMode, players);
  const status = rosterStatus(player);
  const checked = status === 'Levert' || status === 'Godkjent';

  return (
    <View style={styles.rosterRow} testID={`roster-row-${player.userId}`}>
      <Text style={[ui.body, styles.rosterName, isMe && styles.meName]}>
        {displayName(player)}
        {isMe ? ' (deg)' : ''}
      </Text>
      {marks.length > 0 || status ? (
        <View style={styles.rosterRight}>
          {marks.length > 0 ? (
            // `flexShrink` på begge sider: «Wolf på hull 3, 6, 9, 12, 15 og 18» er
            // den lengste merkelappen som finnes, og uten dette renner den ut av
            // raden på en smal telefon i stedet for å brekke (#1842-lærdommen —
            // tekst som klippes er tekst som lyver).
            <Text
              style={[ui.muted, styles.rosterMarks]}
              testID={`roster-marks-${player.userId}`}
            >
              {marks.join(' · ')}
            </Text>
          ) : null}
          {status ? (
            <View style={styles.rosterStatus} testID={`roster-status-${player.userId}`}>
              {checked ? (
                <HakeIcon
                  color={status === 'Godkjent' ? colors.primary : colors.muted}
                  size={16}
                  testID={`roster-status-check-${player.userId}`}
                />
              ) : null}
              <Text style={ui.muted}>{status}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
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
  rosterName: { flexShrink: 1 },
  rosterRight: {
    flexShrink: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    columnGap: 8,
  },
  rosterMarks: { flexShrink: 1, textAlign: 'right' },
  rosterStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // Egen familie, ikke `fontWeight` — expo-font velger snitt på familienavn.
  meName: { fontFamily: FONTS.sansBold },
});
