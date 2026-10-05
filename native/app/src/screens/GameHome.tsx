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
//
// #2255: siden er én startbillett. Rekkefølgen er:
//  1. synk-banneret og banneret for avvist kort,
//  2. billetten (hode, felt, avatarrad) med stubben,
//  3. flisene Tavla, Scorekort og Regler når runden pågår eller er avsluttet,
//     og «Godkjenn (n)»,
//  4. spillerlista, bare når runden er planlagt eller et utkast,
//  5. forklaringen av spillformen («Regler»),
//  6. arrangørdelen.
// Reglene bak billetten bor i `lib/gameTicket.ts`; stubben velger de samme
// grenene, i samme rekkefølge, som `PrimarySection` gjorde før.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
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
import { GameTicket, type TicketField } from '../components/game/GameTicket';
import { GameTiles } from '../components/game/GameTiles';
import { OrganiserSection } from '../components/game/OrganiserSection';
import { RulesSection } from '../components/game/RulesSection';
import { TicketStub } from '../components/game/TicketStub';
import { DelIcon, HakeIcon } from '../components/icons/Icons';
import { SyncBanner } from '../components/sync/SyncBanner';
import type { BundlePlayer } from '../data/gameBundle';
import { fetchOwnProfile } from '../data/profile';
import { confirmParticipation } from '../data/rosterActions';
import { seedGameScores } from '../data/seedScores';
import { displayName } from '../lib/display';
import { gateReason } from '../lib/formatGate';
import {
  calendarEvent,
  slotField,
  startField,
  ticketHeaderLine,
  ticketSlot,
  ticketStrokes,
  ticketStub,
} from '../lib/gameTicket';
import { holeByHoleKind } from '../lib/holeByHole';
import { buildHeroModel } from '../lib/homeHero';
import { nameLookup } from '../lib/leaderboardModel';
import {
  findInRoster,
  flightCtaLabel,
  flightDeliveryFor,
  pendingApprovals,
  rosterPlacementMarks,
  rosterStatus,
  rosterStatusKind,
  shouldConfirmParticipation,
  toRoster,
} from '../lib/roster';
import { computeGameLeaderboard } from '../lib/scoringContext';
import {
  buildTeamCards,
  filledHolesForOwner,
  findMyTeamCard,
  myTeamCaptainId,
  teamHandicapFor,
} from '../lib/teamPlay';
import { canShareLiveFollow, shareLiveFollow } from '../lib/shareLive';
import { TICKET_TEXT, approveButton, fieldA11y, stubTotal } from '../lib/ticketCopy';
import { useGameBundle, useLocalScores, useTeamScores } from '../lib/useGameData';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, useTheme } from '../theme';
import { useMarkVisitRead } from '../lib/useMarkVisitRead';

/** Appen fører bare hele runder — segment-spill gates bort i `formatGate`. */
const HOLE_COUNT = 18;

export function GameHome({ route, navigation }: ScreenProps<'GameHome'>) {
  const { colors, ui } = useTheme();
  const { gameId } = route.params;
  const { userId } = useSession();
  // #2201: det du åpner, er lest.
  useMarkVisitRead('gameHome', gameId);
  const { bundle, errorText, loading, refresh } = useGameBundle(gameId);
  const { scores: localScores, reload } = useLocalScores(gameId);
  // #2067: hullene en trukket kaptein førte, teller for laget. Foldes inn før
  // noe annet leser slagene.
  const scores = useTeamScores(localScores, bundle);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const rulesHeadingRef = useRef<ComponentRef<typeof Text>>(null);
  const rulesY = useRef<number | null>(null);
  const [profileHcpIndex, setProfileHcpIndex] = useState<number | null>(null);

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
  const myRow = bundle?.players.find((player) => player.userId === userId);
  const confirmNeeded = shouldConfirmParticipation(myRow, bundle?.game.status ?? 'draft');
  useEffect(() => {
    if (!confirmNeeded) return;
    void confirmParticipation(gameId).then(() => refresh());
  }, [confirmNeeded, gameId, refresh]);

  // #2255: DINE SLAG før start. Banehandicapen fryses først ved tee-off, så
  // til da regnes den fra hcp-indeksen i profilen (samme vei som webben).
  // Uten nett står «—», og tallet kommer neste gang skjermen åpnes.
  const needsHcpIndex = myRow != null && myRow.courseHandicap == null;
  useEffect(() => {
    if (!needsHcpIndex) return;
    let live = true;
    void fetchOwnProfile(userId).then(
      (profile) => {
        if (live) setProfileHcpIndex(profile.hcpIndex);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [needsHcpIndex, userId]);

  // «Regler»-flisa hopper ned til forklaringen og gir den fokus for
  // skjermleseren. Uten animasjon: det er et hopp, ikke en reise.
  const scrollToRules = useCallback(() => {
    if (rulesY.current === null) return;
    scrollRef.current?.scrollTo({ y: rulesY.current, animated: false });
    if (rulesHeadingRef.current) {
      AccessibilityInfo.sendAccessibilityEvent(rulesHeadingRef.current, 'focus');
    }
  }, []);

  // Del-knappen øverst til høyre (eierens svar b): bare når arrangøren har
  // slått på live-følging, og da deler den webbens «følg live»-lenke. Den
  // felles toppen (#2403) setter den i høyre-plassen sin, 8 pt fra kanten og
  // uten boble, som i designet.
  const liveToken = bundle?.game.spectateToken ?? null;
  const shareToken = canShareLiveFollow(liveToken) ? liveToken : null;
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: shareToken ? () => <ShareLiveButton token={shareToken} /> : undefined,
    });
  }, [navigation, shareToken]);

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
  const teamMode = myCaptainId != null && modeCollapsesToTeamCard(mode, HOLE_COUNT);
  const myTeamCard = teamMode
    ? findMyTeamCard(buildTeamCards(roster, nameLookup(bundle.players)), userId)
    : null;
  const filled = filledHolesForOwner(scores, mode, userId, myCaptainId);
  // Godkjenn-lista er per SPILLER også i lag-formater: hvert medlem har sin
  // egen `game_players`-rad, og den delte regelen er alt mode-bevisst. Spillet
  // sendes med for gaten (#2220): bare når runden krever godkjenning og pågår.
  const approvals = me ? pendingApprovals(roster, bundle.game, userId) : [];

  // DINE SLAG i et lagkort er lagets handicap fra motoren, som på scorekortet.
  // Motoren spørres bare når det faktisk er et lagkort, og først når
  // banehandicapene er frosset ved start (før det viser billetten «—»).
  const teamNumber = myTeamCard?.teamNumber ?? me?.player.teamNumber ?? null;
  const teamHandicap =
    teamMode && teamNumber != null && me?.player.courseHandicap != null
      ? teamHandicapFor(computeGameLeaderboard(bundle, scores), teamNumber)
      : null;
  const start = startField(game.scheduledTeeOffAt, new Date());
  const slot = slotField(ticketSlot(bundle, userId));
  const strokes = ticketStrokes({
    bundle,
    me: me?.player,
    profileHcpIndex,
    teamMode,
    teamHandicap,
  });
  const fields: TicketField[] = [
    { label: TICKET_TEXT.start, value: start.value, sub: start.sub, a11y: start.a11y, testID: 'ticket-start' },
    { label: slot.label, value: slot.value, a11y: fieldA11y(slot.label, slot.value), testID: 'ticket-slot' },
    {
      label: TICKET_TEXT.strokes,
      value: strokes,
      a11y: fieldA11y(
        TICKET_TEXT.strokes,
        strokes === TICKET_TEXT.noValue ? TICKET_TEXT.noValueSpoken : strokes,
      ),
      testID: 'ticket-strokes',
    },
  ];
  // «15 p» til høyre for fremdriften (eierens svar a): tavlas tall for meg,
  // fra den samme modellen helten på Hjem bruker. Regnes bare når runden pågår;
  // modellen svarer uten plass for lagformater, reveal og andre formater.
  const hero = game.status === 'active' ? buildHeroModel({ bundle, scores: localScores, userId }) : null;
  const runningTotal =
    hero?.standing?.total != null && hero.unit ? stubTotal(hero.standing.total, hero.unit) : null;
  const stub = ticketStub({
    status: game.status,
    gate: gated,
    me: me?.player,
    filled,
    totalHoles: HOLE_COUNT,
    submittedAt: myTeamCard ? myTeamCard.submittedAt : (me?.player.submittedAt ?? null),
    approvedAt: myTeamCard ? myTeamCard.approvedAt : (me?.player.approvedAt ?? null),
    requirePeerApproval: game.requirePeerApproval,
  });
  const inPlay = game.status === 'active' || game.status === 'finished';
  // Eierens svar på #2255: lista står bare før runden. Når den pågår eller er
  // avsluttet, er avatarraden i billetten eneste spillerliste.
  const showRoster = game.status === 'scheduled' || game.status === 'draft';

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={[ui.scroll, styles.scroll]} testID="game-home-screen">
      {/* #1980: slag som strandet i køen, synlig også i butikkbygget. */}
      <SyncBanner gameId={gameId} />

      {me?.player.rejectionReason ? (
        <View style={ui.banner} testID="rejected-banner">
          <Text style={ui.body}>Kortet ditt ble sendt tilbake.</Text>
          {me.player.rejectionReason !== NO_REJECTION_REASON ? (
            <Text style={ui.muted}>{me.player.rejectionReason}</Text>
          ) : null}
          {/* #2220: webbens ordlyd (`game.home.rejectionBannerSuffix`). Veien
              dit er «Rediger hullene» på scorekortet. */}
          <Text style={ui.body}>Rediger hullene og lever på nytt.</Text>
        </View>
      ) : null}

      <GameTicket
        kicker={bundle.courseName ? game.name : null}
        title={bundle.courseName ?? game.name}
        headerLine={ticketHeaderLine(bundle)}
        statusLabel={STATUS_LABELS[game.status as GameStatus] ?? game.status}
        fields={fields}
        roster={me ? { players: bundle.players, userId, flightNumber: me.player.flightNumber } : null}
      >
        <TicketStub
          stub={stub}
          gameId={gameId}
          courseName={bundle.courseName}
          teeOffAt={game.scheduledTeeOffAt}
          calendarEvent={calendarEvent(bundle)}
          runningTotal={runningTotal}
          flightCta={flightCtaLabel(flightDeliveryFor(bundle, localScores, userId).length)}
          onChanged={refresh}
          onNavigate={navigation.navigate}
          bundle={bundle}
        />
      </GameTicket>

      {inPlay ? (
        <GameTiles
          supported={supported}
          holeByHole={game.status === 'finished' && holeByHoleKind(game) !== null}
          onBoard={() => navigation.navigate('Leaderboard', { gameId })}
          onHoleByHole={() => navigation.navigate('HoleByHole', { gameId, gameName: game.name })}
          onScorecard={() => navigation.navigate('Scorecard', { gameId })}
          onRules={scrollToRules}
        />
      ) : null}

      {approvals.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          style={ui.buttonSecondary}
          onPress={() => navigation.navigate('Approve', { gameId })}
          testID="open-approve"
        >
          <Text style={ui.buttonSecondaryText}>{approveButton(approvals.length)}</Text>
        </Pressable>
      ) : null}

      {showRoster ? (
        <>
          <Text style={ui.sectionTitle}>{TICKET_TEXT.roster}</Text>
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
        </>
      ) : null}

      <RulesSection
        gameMode={game.gameMode}
        modeConfig={game.modeConfig}
        headingRef={rulesHeadingRef}
        onLayout={(event) => {
          rulesY.current = event.nativeEvent.layout.y;
        }}
      />

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
 * Del-ikonet i toppen. Knappen bærer etiketten; ikonet i den er dekor. Feiler
 * delingsarket, sier en melding det. Toppen har ingen plass til en linje, og
 * feilen er forbigående, så den står ikke fast som på lenkeknappene.
 */
function ShareLiveButton({ token }: { token: string }) {
  const { colors } = useTheme();
  const share = useCallback(async () => {
    const result = await shareLiveFollow(token);
    if (!result.ok) Alert.alert(TICKET_TEXT.shareFailed);
  }, [token]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={TICKET_TEXT.share}
      hitSlop={8}
      onPress={() => void share()}
      style={styles.headerButton}
      testID="share-live"
    >
      <DelIcon color={colors.text} size={20} strokeWidth={1.8} />
    </Pressable>
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
 * leses riktig uten ord, og står derfor som tekst. Haken følger tilstanden
 * (`rosterStatusKind`), ikke ordet: «Levert av Ola» (#2200) er også levert.
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
  const kind = rosterStatusKind(player);
  const status = rosterStatus(player, players);
  const checked = kind === 'submitted' || kind === 'approved';

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
                  color={kind === 'approved' ? colors.primary : colors.muted}
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
  headerButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  /**
   * Designets marger: 16 pt fra kantene, og billetten 8 pt under toppen. Den
   * felles toppen (#2403) er designets rad (8 + 44 pt).
   */
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
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
