// Native N3 (#1825): godkjenn eller send tilbake makkernes kort.
//
// Lista kommer fra den DELTE `pendingApprovalsFor` — samme regel som webbens
// godkjenn-side, spill-hjem-banneret og hjem-kortene. Den lister aldri deg selv
// (0103-triggeren forbyr selv-godkjenning uansett).
//
// #2220: lista har samme gate som «Godkjenn (N)» på spill-hjem
// (`pendingApprovals`): runden krever godkjenning og pågår. Ellers står den
// tomme tilstanden, så knappen og lista aldri sier noe forskjellig.
//
// Selve autorisasjonen ligger i scorekort-ruta (#2215): porten der avgjør hvem
// som får godkjenne og avvise, og kjernen bak den skriver, varsler og tømmer
// web-cachen. Skjermen er UX foran den porten, ikke porten selv — derfor MÅ et
// `{ ok: false }` vises, også når kortet bare ikke var til vurdering lenger.
//
// #2262: hvert kort vises som det klassiske scorekortet — UT og INN med PAR og
// SLAG — og BRUTTO under, samme kort som spilleren selv ser. Uten NETTO: den
// som godkjenner, attesterer slagene, ikke handicapen.
//
// #2577 (designlerretet, rad 68 «Godkjenningen i appen»): ett kort om gangen,
// som det signerte scorekortet med stempel, og de andre under «Venter også».
// «Send tilbake» åpner et ark med valgfri grunn, likt på iOS og Android. Når
// ingenting venter, sier skjermen om alt er godkjent eller om en makker ikke
// har levert ennå. Hvilken tavle som står, avgjør `approveScreenState`.
import { useLayoutEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parForPlayer } from '../../../../lib/games/parDisplay';
import { buildScorecardGrid, type ScorecardGrid as Grid } from '../../../../lib/scorecard/scorecardGrid';
import { resolveScorecardStamp } from '../../../../lib/scorecard/scorecardStamp';
import {
  modeCollapsesToTeamCard,
  type GameMode,
  type ScoringGender,
} from '../../../../lib/scoring/modes/types';
import { RejectSheet } from '../components/approve/RejectSheet';
import { DashedRing, HakeIcon } from '../components/icons/Icons';
import { kickerHeader } from '../components/KickerHeader';
import { ScorecardGrid } from '../components/scorecard/ScorecardGrid';
import {
  ScorecardStampMark,
  ScorecardStatusList,
} from '../components/scorecard/ScorecardStamp';
import { ScorecardTotals } from '../components/scorecard/ScorecardTotals';
import type { LocalScore } from '../data/db';
import type { BundleHole } from '../data/gameBundle';
import { approveScorecard, rejectScorecard } from '../data/playerActions';
import { describeFailure } from '../lib/actionFeedback';
import {
  APPROVE_TEXT,
  approvedLine,
  deliveredLine,
  notDeliveredHintFor,
  notifiedLine,
  pendingHeading,
  positionLabel,
} from '../lib/approveCopy';
import { approveRows, approveScreenState, type ApproveRow } from '../lib/approveState';
import { displayName, formatClock, shortDisplayName } from '../lib/display';
import { findInRoster, toRoster, toStampPlayers, type RosterEntry } from '../lib/roster';
import { scoresByHoleFor, useGameBundle, useLocalScores, useTeamScores } from '../lib/useGameData';
import { useScoreCatchUp } from '../lib/useScoreCatchUp';
import { useTeamTeeShots } from '../lib/useTeamTeeShots';
import { teeShotMinimum } from '../lib/teeShotTeams';
import { TeeShotOrganizerNotice } from '../components/TeeShotOrganizerNotice';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, fraunces, interLine, useTheme } from '../theme';
import { useMarkVisitRead } from '../lib/useMarkVisitRead';

type Busy = { userId: string; action: 'approve' | 'reject' };

export function Approve({ route, navigation }: ScreenProps<'Approve'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { gameId } = route.params;
  const { userId } = useSession();
  // #2201: godkjenningsvarslene for spillet er lest når du har åpnet siden.
  useMarkVisitRead('gameApprove', gameId);
  const { bundle, loading, refresh } = useGameBundle(gameId);
  const { scores: localScores, reload } = useLocalScores(gameId);
  // #2067/#2228: hullene en trukket kaptein førte, står på den nye kapteinens
  // kort, slik webbens godkjenningsside viser dem.
  const scores = useTeamScores(localScores, bundle);
  const [busy, setBusy] = useState<Busy | null>(null);
  // Feilen hører til kortet den kom fra. Åpner et annet kort seg (et trykk, eller
  // fordi kortet forsvant fra lista ved en ny henting), står den ikke der.
  const [error, setError] = useState<{ userId: string; text: string | null } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [rejectUserId, setRejectUserId] = useState<string | null>(null);
  // Grunnen står igjen hvis kallet feilet og arket åpnes for samme kort på nytt.
  const [reasonDraft, setReasonDraft] = useState<{ userId: string; text: string } | null>(null);

  // Slagene hentes ved fokus, i forgrunnen og med nett igjen (#2228). #2580:
  // utslagene på de samme tidspunktene, bare med innstillingen på.
  const minTeeShots = bundle ? teeShotMinimum(bundle.game) : null;
  const teeShots = useTeamTeeShots(gameId, { enabled: minTeeShots != null });
  useScoreCatchUp(gameId, reload, {
    reloadTeeShots: minTeeShots != null ? teeShots.reload : undefined,
  });

  // Spillnavnet står i toppen når bundelen er lest (navigatoren har «Godkjenn»
  // uten ord til da).
  const gameName = bundle?.game.name ?? null;
  useLayoutEffect(() => {
    if (gameName != null) navigation.setOptions(kickerHeader(gameName, APPROVE_TEXT.screenTitle));
  }, [navigation, gameName]);

  const run = async (
    next: Busy,
    action: () => Promise<Awaited<ReturnType<typeof approveScorecard>>>,
  ) => {
    setBusy(next);
    setError(null);
    const result = await action();
    if (next.action === 'reject') setRejectUserId(null);
    if (!result.ok) {
      setBusy(null);
      setError({ userId: next.userId, text: describeFailure(result) });
      return;
    }
    if (next.action === 'reject') setReasonDraft(null);
    // Hent rosteret på nytt — det er det som avgjør hvem som fortsatt står i
    // lista, og skjermen skal ikke lyve om at et kort er borte før serveren
    // sier det. Det neste kortet i lista åpnes da av seg selv. Knappene står
    // låst til da, så kortet som nettopp ble godkjent, ikke låses opp igjen.
    try {
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  if (!bundle) {
    // #1954 A2: en feilet første henting uten cache sier fra, som hull- og
    // tavleskjermen. Uten dette sto «Henter kortene …» til skjermen ble åpnet
    // på nytt.
    return loading ? (
      <View style={ui.centered} testID="approve-loading">
        <Text style={ui.muted}>{APPROVE_TEXT.loading}</Text>
      </View>
    ) : (
      <View style={ui.centered} testID="approve-error">
        <Text style={ui.error}>{APPROVE_TEXT.loadFailed}</Text>
      </View>
    );
  }

  const roster = toRoster(bundle.players);
  const gameMode = bundle.game.gameMode as GameMode;
  const state = approveScreenState({ roster, game: bundle.game, userId });
  // Forsvinner kortet i arket fra lista mens arket er åpent (en annen godkjente
  // det, eller det ble åpnet igjen), lukkes arket, så det ikke dukker opp av seg
  // selv hvis kortet kommer tilbake. Justert under render, som React anbefaler.
  if (
    rejectUserId != null &&
    (state.kind !== 'pending' || !state.pending.some((e) => e.user_id === rejectUserId))
  ) {
    setRejectUserId(null);
  }
  const stampFor = (ownerUserId: string) =>
    resolveScorecardStamp({
      ownerUserId,
      players: toStampPlayers(bundle.players),
      gameMode,
      gameStatus: bundle.game.status,
      requirePeerApproval: bundle.game.requirePeerApproval,
      // Designet (#2385): «Markør: Jonas Berg har godkjent», fullt navn.
      markerName: 'full',
    });
  /** Brutto på kortet, eller `null` når enheten ikke ser noen slag (beslutning 3). */
  const strokesOf = (ownerId: string): number | null => {
    const grid = gridFor(bundle.holes, scores, findInRoster(roster, ownerId));
    return grid.totals.played === 0 ? null : grid.totals.brutto;
  };

  // #2580: «Per har 2 av 4 utslag» på laget for hver spiller under minimum.
  const teeShotNotice =
    minTeeShots != null && teeShots.loaded ? (
      <View style={styles.teeShotNotice}>
        <TeeShotOrganizerNotice players={bundle.players} minimum={minTeeShots} rows={teeShots.rows} />
      </View>
    ) : null;

  if (state.kind === 'empty') {
    return (
      <ScrollView contentContainerStyle={ui.scroll} testID="approve-screen">
        <Text style={ui.body} testID="approve-empty">
          {APPROVE_TEXT.empty}
        </Text>
      </ScrollView>
    );
  }

  if (state.kind === 'pending') {
    const { pending } = state;
    const open = pending.find((entry) => entry.user_id === selectedUserId) ?? pending[0]!;
    const others = pending.filter((entry) => entry !== open);
    const grid = gridFor(bundle.holes, scores, open);
    const stamp = stampFor(open.user_id);
    const rejectEntry =
      rejectUserId == null ? undefined : pending.find((entry) => entry.user_id === rejectUserId);
    const locked = busy != null;

    return (
      <>
        <ScrollView
          style={{ backgroundColor: colors.bg }}
          contentContainerStyle={styles.pendingScroll}
          testID="approve-screen"
        >
          <View style={styles.headingBlock}>
            <Text style={[styles.heading, { color: colors.text }]} accessibilityRole="header">
              {pendingHeading(pending.length)}
            </Text>
            <Text style={[styles.intro, { color: colors.muted }]}>{APPROVE_TEXT.intro}</Text>
          </View>
          {teeShotNotice}

          <View style={styles.nameRow}>
            <Text style={[ui.value, styles.cardName]} numberOfLines={1}>
              {displayName(open.player)}
            </Text>
            <Text style={[styles.position, ui.num, { color: colors.muted }]}>
              {positionLabel(pending.indexOf(open) + 1, pending.length)}
            </Text>
          </View>

          <View style={styles.cardWrap} testID={`approve-card-${open.user_id}`}>
            {grid.totals.played === 0 ? (
              <Text style={ui.muted} testID={`summary-${open.user_id}`}>
                {APPROVE_TEXT.noScores}
              </Text>
            ) : (
              <View testID={`summary-${open.user_id}`}>
                <ScorecardGrid
                  grid={grid}
                  rows={['strokes']}
                  footer={
                    <ScorecardTotals totals={grid.totals} showNet={false} showPoints={false} />
                  }
                  overlay={
                    stamp ? (
                      <View style={styles.stampOffset}>
                        <ScorecardStampMark stamp={stamp} />
                      </View>
                    ) : null
                  }
                />
              </View>
            )}
          </View>

          <View
            style={[
              styles.actions,
              // Stempelet henger under kortet; uten det står knappene tettere.
              { marginTop: stamp && grid.totals.played > 0 ? 44 : 16 },
            ]}
          >
            <Pressable
              style={[ui.button, styles.action]}
              onPress={() =>
                void run({ userId: open.user_id, action: 'approve' }, () =>
                  approveScorecard(gameId, open.user_id),
                )
              }
              disabled={locked}
              accessibilityRole="button"
              testID={`approve-${open.user_id}`}
            >
              <Text style={ui.buttonText}>
                {busy?.userId === open.user_id && busy.action === 'approve'
                  ? APPROVE_TEXT.working
                  : APPROVE_TEXT.approve}
              </Text>
            </Pressable>
            <Pressable
              style={[ui.buttonSecondary, styles.action]}
              onPress={() => setRejectUserId(open.user_id)}
              disabled={locked}
              accessibilityRole="button"
              testID={`reject-${open.user_id}`}
            >
              <Text style={ui.buttonSecondaryText}>{APPROVE_TEXT.sendBack}</Text>
            </Pressable>
          </View>

          {error?.userId === open.user_id && error.text ? (
            <Text style={[ui.error, styles.error]} testID="approve-error">
              {error.text}
            </Text>
          ) : null}

          {others.length > 0 ? (
            <>
              <Text style={[ui.kicker, styles.kicker, styles.waitingKicker]}>
                {APPROVE_TEXT.waitingAlso}
              </Text>
              <View style={styles.waitingList}>
                {others.map((entry) => (
                  <Pressable
                    key={entry.user_id}
                    style={[
                      styles.rowCard,
                      styles.row,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                    onPress={() => {
                      setSelectedUserId(entry.user_id);
                      setError(null);
                    }}
                    disabled={locked}
                    accessibilityRole="button"
                    testID={`approve-row-${entry.user_id}`}
                  >
                    <View style={styles.rowText}>
                      <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                        {displayName(entry.player)}
                      </Text>
                      <Text style={[styles.rowSub, ui.num, { color: colors.muted }]}>
                        {deliveredLine(
                          formatClock(entry.player.submittedAt),
                          strokesOf(entry.user_id),
                        )}
                      </Text>
                    </View>
                    <Text style={[styles.rowLink, { color: colors.primary }]}>
                      {APPROVE_TEXT.review}
                    </Text>
                    <Text
                      style={[styles.chevron, { color: colors.muted }]}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      ›
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>

        {rejectEntry ? (
          <RejectSheet
            key={rejectEntry.user_id}
            name={shortDisplayName(rejectEntry.player)}
            teamCard={modeCollapsesToTeamCard(gameMode, 18)}
            guest={rejectEntry.player.isGuest}
            busy={busy?.userId === rejectEntry.user_id && busy.action === 'reject'}
            initialReason={
              reasonDraft?.userId === rejectEntry.user_id ? reasonDraft.text : undefined
            }
            onReasonChange={(text) => setReasonDraft({ userId: rejectEntry.user_id, text })}
            onSubmit={(reason) =>
              void run({ userId: rejectEntry.user_id, action: 'reject' }, () =>
                rejectScorecard(gameId, rejectEntry.user_id, reason),
              )
            }
            onCancel={() => {
              setRejectUserId(null);
              setReasonDraft(null);
            }}
          />
        ) : null}
      </>
    );
  }

  // Tavle 3 og 4: ingenting venter på meg.
  const me = findInRoster(roster, userId)!;
  const myStamp = stampFor(userId);
  const approvedRows = approveRows(state.approvedByMe, roster, gameMode);
  const notDeliveredRows =
    state.kind === 'notDelivered' ? approveRows(state.notDelivered, roster, gameMode) : [];
  const line = notifiedLine(state.notifiedNames);

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]} testID="approve-screen">
      <ScrollView contentContainerStyle={styles.doneScroll}>
        <View style={styles.doneHead}>
          <View style={[styles.doneMark, { backgroundColor: colors.primarySoft }]}>
            <HakeIcon color={colors.primary} size={28} strokeWidth={2.4} />
          </View>
          <Text style={[styles.doneTitle, { color: colors.text }]} accessibilityRole="header">
            {state.kind === 'allApproved'
              ? APPROVE_TEXT.allApprovedTitle
              : APPROVE_TEXT.nothingWaitingTitle}
          </Text>
          {line ? (
            <Text style={[styles.doneLine, { color: colors.muted }]} testID="approve-notified">
              {line}
            </Text>
          ) : null}
        </View>
        {teeShotNotice}

        {approvedRows.length > 0 ? (
          <>
            <Text style={[ui.kicker, styles.kicker, styles.doneKicker]}>
              {APPROVE_TEXT.approvedByYou}
            </Text>
            <View
              style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              testID="approve-approved"
            >
              {approvedRows.map((row, i) => (
                <ApprovedRow
                  key={row.key}
                  row={row}
                  strokes={strokesOf(row.ownerId)}
                  last={i === approvedRows.length - 1}
                />
              ))}
            </View>
          </>
        ) : null}

        {notDeliveredRows.length > 0 ? (
          <>
            <Text style={[ui.kicker, styles.kicker, styles.doneKicker]}>
              {APPROVE_TEXT.notDeliveredYet}
            </Text>
            {/* Designet tegner raden som sitt eget kort, som radene under «Venter også». */}
            <View style={styles.waitingList} testID="approve-not-delivered">
              {notDeliveredRows.map((row) => (
                <View
                  key={row.key}
                  style={[
                    styles.rowCard,
                    styles.row,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.rowText}>
                    <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.muted }]}>
                      {notDeliveredHintFor(Platform.OS)}
                    </Text>
                  </View>
                  <DashedRing color={colors.scoreUnsetFg} />
                </View>
              ))}
            </View>
          </>
        ) : null}

        {myStamp ? (
          <>
            <Text style={[ui.kicker, styles.kicker, styles.doneKicker]}>
              {APPROVE_TEXT.yourCard}
            </Text>
            <ScorecardStatusList
              stamp={myStamp}
              ownerFullName={me.player.name}
              style={styles.statusList}
            />
          </>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.bg,
            borderTopColor: colors.border,
            paddingBottom: 20 + insets.bottom,
          },
        ]}
      >
        <Pressable
          style={[ui.button, styles.boardButton]}
          onPress={() => navigation.navigate('Leaderboard', { gameId })}
          accessibilityRole="button"
          testID="approve-see-board"
        >
          <Text style={ui.buttonText}>{APPROVE_TEXT.seeBoard}</Text>
        </Pressable>
        {/* Spillsiden, ikke `goBack`: kom du fra hjem-kortet, ville det vært Hjem. */}
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.navigate('GameHome', { gameId })}
          accessibilityRole="button"
          testID="approve-back-to-game"
        >
          <Text style={[styles.backText, { color: colors.primary }]}>
            {APPROVE_TEXT.backToGame}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** En rad under «Du har godkjent»: navn, klokkeslett, brutto og hake. */
function ApprovedRow({
  row,
  strokes,
  last,
}: {
  row: ApproveRow;
  strokes: number | null;
  last: boolean;
}) {
  const { colors, ui } = useTheme();
  return (
    <View
      style={[
        styles.row,
        last ? null : { borderBottomWidth: 1, borderBottomColor: colors.divider },
      ]}
      testID={`approve-approved-${row.key}`}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={[styles.rowSub, ui.num, { color: colors.muted }]}>
          {approvedLine(formatClock(row.clock))}
        </Text>
      </View>
      {strokes != null ? (
        <Text style={[styles.brutto, ui.num, { color: colors.text }]}>
          {strokes}{' '}
          <Text style={[styles.bruttoUnit, { color: colors.muted }]}>{APPROVE_TEXT.strokes}</Text>
        </Text>
      ) : null}
      <View
        style={[styles.disc, { backgroundColor: colors.primarySoft }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <HakeIcon color={colors.primary} size={14} strokeWidth={2.4} />
      </View>
    </View>
  );
}

/**
 * Kortets grid: hullene, slagene til `owner` og paren for tee-kjønnet hens.
 * Det ene stedet skjermen bygger et grid, så det åpne kortet og radene under
 * regner brutto likt (#2577).
 */
function gridFor(
  holes: readonly BundleHole[],
  scores: readonly LocalScore[],
  owner: RosterEntry | undefined,
): Grid {
  const byHole = owner ? scoresByHoleFor(scores, owner.user_id) : new Map();
  const teeGender = (owner?.player.teeGender ?? 'mens') as ScoringGender;
  return buildScorecardGrid({
    rows: holes.map((hole) => ({
      holeNumber: hole.holeNumber,
      par: parForPlayer(
        { mens: hole.parMens, ladies: hole.parLadies, juniors: hole.parJuniors },
        teeGender,
      ),
      strokes: byHole.get(hole.holeNumber)?.strokes ?? null,
      extra: null,
    })),
    pointsFn: null,
  });
}

// Linjeboksene har egne marger (`theme.ts`); designets luft legges oppå dem.
const INTRO_LINE = interLine(14, 20.3, { multiline: true });
const ROW_SUB_LINE = interLine(12, 15);
const DONE_TITLE_LINE = fraunces(500, 28, 33.6, { multiline: true });

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pendingScroll: { flexGrow: 1, paddingBottom: 32 },
  // Designet: 4 pt under toppen, 20 pt på sidene og 14 pt ned til navnet.
  headingBlock: { paddingTop: 4, paddingHorizontal: 20, paddingBottom: 14 },
  // #2580: arrangørens utslagslinjer, med skjermens 20 pt fra kanten.
  teeShotNotice: { paddingHorizontal: 20, paddingBottom: 14 },
  heading: { ...fraunces(500, 26, 31.2, { multiline: true }) },
  intro: { ...INTRO_LINE, fontFamily: FONTS.sans, marginTop: INTRO_LINE.marginTop + 4 },
  // Kortet har selv 4 pt over seg (`ScorecardGrid`), så raden tar 4 av designets 8.
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  cardName: { flexShrink: 1 },
  position: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
  // Kortet går 8 pt ut over sidene (`ScorecardGrid`), så det står 12 pt fra kanten.
  cardWrap: { paddingHorizontal: 20 },
  // Designet: stempelet henger 36 pt under kortet her, mot 34 på scorekortet.
  stampOffset: { transform: [{ translateY: 2 }] },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20 },
  action: { flex: 1, height: 48, marginTop: 0 },
  error: { paddingHorizontal: 20, marginTop: 12 },
  kicker: { ...interLine(10, 12), paddingHorizontal: 20, paddingBottom: 8 },
  waitingKicker: { paddingTop: 22 },
  waitingList: { gap: 8, marginHorizontal: 16 },
  rowCard: { borderWidth: 1, borderRadius: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 60,
  },
  rowText: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  rowName: { ...interLine(15, 19), fontFamily: FONTS.sansSemiBold },
  rowSub: { ...ROW_SUB_LINE, fontFamily: FONTS.sans, marginTop: ROW_SUB_LINE.marginTop + 2 },
  rowLink: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
  chevron: { fontSize: 18, fontFamily: FONTS.sans },
  doneScroll: { flexGrow: 1, paddingBottom: 24 },
  // Designet: 28 pt over og på sidene, 8 under, 10 mellom delene.
  doneHead: {
    alignItems: 'center',
    paddingTop: 28,
    paddingHorizontal: 28,
    paddingBottom: 8,
    gap: 10,
  },
  doneMark: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: {
    ...DONE_TITLE_LINE,
    marginTop: DONE_TITLE_LINE.marginTop + 4,
    textAlign: 'center',
  },
  doneLine: {
    ...interLine(15, 21.75, { multiline: true }),
    fontFamily: FONTS.sans,
    textAlign: 'center',
  },
  doneKicker: { paddingTop: 20 },
  listCard: { marginHorizontal: 16, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  brutto: { ...fraunces(600, 17) },
  bruttoUnit: { fontSize: 12, fontFamily: FONTS.sansMedium },
  disc: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusList: { marginTop: 0, marginHorizontal: 20 },
  // Designet: 12 pt over, 16 på sidene og 20 under knappene, over hjem-streken.
  bottomBar: { borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 16, gap: 6 },
  boardButton: { height: 52, marginTop: 0 },
  backButton: { height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
