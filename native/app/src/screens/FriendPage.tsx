// native/app/src/screens/FriendPage.tsx
// #2381: vennesiden, tegning C «Dere to». Åpnes fra Venner (alle radene) og
// fra et navn i ligatabellen, og erstatter arket fra #2256 og #2878.
//
// **Hva siden viser.** For en venn: «Mot hverandre» (stillingen, streken og
// lederlinja), «Runder sammen» med de fire siste og «Fjern venn». For en som
// ikke er venn: aldri mer enn ligaarket viste (navn, handicap fra ligaen,
// runder sammen og sist spilt), og knappen eller linja for forholdet.
//
// **To lesinger samtidig.** Forholdet kommer fra `fetchFriends()` (samme liste
// som Venner), rundene fra `fetchFriendRounds()`. Serveren svarer bare på
// rundene for godtatte venner, og et 403 er «ikke venner», aldri en feil.
// Rundene brukes bare når forholdet er «venn».
//
// **Uten nett.** Navnet, handicapet og forholdet fra lista du trykket i står i
// ruta, så toppen er riktig med en gang. Der stillingen skulle stått, står
// kortet med linja og «Prøv igjen».
//
// Handlingene har ingen kø, som i Venner: uten nett står linja og knappen
// igjen. Knappen er låst mens handlingen går.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FriendStatus } from '../../../../lib/friends/friendStatus';
import {
  fetchFriendRounds,
  fetchFriends,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
  type FriendActionResult,
  type FriendRecord,
  type FriendRound,
  type FriendRoundBadge,
  type FriendStats,
  type FriendsData,
} from '../data/friends';
import type { WebApiFailure } from '../data/webApi';
import { Avatar, Pill, RowsCard, SheetRow, type AvatarTone } from '../components/friends/FriendParts';
import { BetaltHakeIcon, ChevronIcon } from '../components/icons/Icons';
import { openOrReturn } from '../lib/backTo';
import { friendRelationFor } from '../lib/friendRelation';
import {
  FRIEND_PAGE_TEXT,
  FRIENDS_TEXT,
  firstNameOf,
  friendPageSubline,
  friendPageValues,
  friendStatusLine,
  friendsFailureLine,
  headToHeadA11yLabel,
  headToHeadLine,
  removeConfirmMessage,
  roundBadgeLabel,
  roundRowSubline,
  roundsListTitle,
  showAllRounds,
} from '../lib/friendsCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, useTheme } from '../theme';

/** Forholdet slik siden tegner det. `outgoing` er også «sendt nå». */
export type FriendPageRelation = 'friend' | 'incoming' | 'outgoing' | 'none';

type FriendsLoad =
  | { state: 'loading' }
  | { state: 'ready'; data: FriendsData }
  | { state: 'failed'; reason: WebApiFailure | 'load_failed' };

type RoundsLoad =
  | { state: 'loading' }
  | { state: 'ready'; rounds: FriendRound[]; record: FriendRecord }
  | { state: 'not_friends' }
  | { state: 'failed'; reason: WebApiFailure | 'load_failed' };

/** De fire siste står, resten folder seg ut under «Vis alle». */
const ROUNDS_SHOWN = 4;

/** En som ikke står i noen liste, har ingen runder sammen med deg. */
const NO_ROUNDS: FriendStats = { roundsTogether: 0, lastPlayedAt: null, lastGameName: null };

/** «Fikk ikke kontakt …» også når serveren svarte med en feil (tegning 12). */
function failureLine(reason: WebApiFailure | 'load_failed'): string {
  return friendsFailureLine(reason === 'load_failed' ? 'network' : reason);
}

export function FriendPage({ navigation, route }: ScreenProps<'FriendPage'>) {
  const { userId, name, hcp, relation: hint, selfInitials = null } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [friendsLoad, setFriendsLoad] = useState<FriendsLoad>({ state: 'loading' });
  const [roundsLoad, setRoundsLoad] = useState<RoundsLoad>({ state: 'loading' });
  // Hver økning henter begge på nytt: «Prøv igjen» og etter en handling.
  const [attempt, setAttempt] = useState(0);
  // Det siden viser etter en handling, før lista er hentet på nytt.
  const [outcome, setOutcome] = useState<'sent' | 'friend' | null>(null);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  // `busy` er først låst når den er tegnet; refen stopper trykk nummer to før det.
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchFriends(), fetchFriendRounds(userId)]).then(([friends, rounds]) => {
      if (cancelled) return;
      setFriendsLoad(friends.ok ? { state: 'ready', data: friends.data } : { state: 'failed', reason: friends.reason });
      setRoundsLoad(
        rounds.ok
          ? { state: 'ready', rounds: rounds.rounds, record: rounds.record }
          : rounds.reason === 'not_friends'
            ? { state: 'not_friends' }
            : { state: 'failed', reason: rounds.reason },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  const retry = useCallback(() => {
    setFriendsLoad({ state: 'loading' });
    setRoundsLoad({ state: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const run = useCallback(async (act: () => Promise<FriendActionResult<FriendStatus>>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setLine(null);
    const result = await act();
    if (!result.ok) {
      setLine(friendsFailureLine(result.reason));
    } else if (result.status === 'requested' || result.status === 'already_pending') {
      setOutcome('sent');
    } else if (result.status === 'accepted' || result.status === 'already_friends') {
      setOutcome('friend');
      setRoundsLoad({ state: 'loading' });
    } else {
      // `already_decided` og `not_found` har ingen linje: lista viser hvordan det står.
      setLine(friendStatusLine(result.status)?.text ?? null);
    }
    if (result.ok) setAttempt((n) => n + 1);
    inFlight.current = false;
    setBusy(false);
  }, []);

  const remove = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setLine(null);
    const result = await removeFriend(userId);
    inFlight.current = false;
    setBusy(false);
    if (!result.ok) {
      setLine(friendsFailureLine(result.reason));
    } else if (result.status === 'removed' || result.status === 'not_found') {
      // Et sent svar skal ikke flytte en annen skjerm (#2757): bare når siden fortsatt har fokus.
      if (navigation.isFocused()) navigation.goBack();
    } else {
      setLine(friendStatusLine(result.status)?.text ?? null);
    }
  }, [navigation, userId]);

  const onRemove = useCallback(() => {
    // To knapper, og dialogen kan ikke avvises: svaret skal komme fra en av dem.
    Alert.alert(
      FRIENDS_TEXT.removeConfirmLabel,
      removeConfirmMessage(name),
      [
        { text: FRIENDS_TEXT.cancelLabel, style: 'cancel' },
        { text: FRIENDS_TEXT.removeConfirmLabel, style: 'destructive', onPress: () => void remove() },
      ],
      { cancelable: false },
    );
  }, [name, remove]);

  const data = friendsLoad.state === 'ready' ? friendsLoad.data : null;
  const relation = data ? friendRelationFor(data, userId) : null;
  // Lista vinner når den er lest. Uten den: et svar med runder betyr at
  // serveren fant dere som venner, ellers står forholdet fra lista du trykket i.
  const known: FriendPageRelation | null =
    relation?.kind ?? (roundsLoad.state === 'ready' ? 'friend' : (hint ?? null));
  const kind: FriendPageRelation | null =
    outcome === 'friend' ? 'friend' : outcome === 'sent' && known !== 'friend' ? 'outgoing' : known;
  const now = new Date();

  const tone: AvatarTone =
    kind === 'friend' ? 'strong' : kind === 'incoming' || kind === 'outgoing' ? 'soft' : 'warm';
  const friendHcp = relation?.kind === 'friend' ? relation.person.hcp : hcp;
  const subline =
    kind === 'friend' ? friendPageSubline(friendHcp) : kind === 'incoming' ? FRIENDS_TEXT.incomingSection : null;

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
      testID="friend-page"
    >
      <View style={styles.head}>
        <Avatar name={name} tone={tone} size={56} />
        <View style={styles.headText}>
          <Text accessibilityRole="header" style={[styles.name, { color: colors.text }]} testID="friend-page-name">
            {name || FRIENDS_TEXT.someoneFallback}
          </Text>
          {subline ? (
            <Text style={[styles.subline, { color: colors.muted }]} testID="friend-page-subline">
              {subline}
            </Text>
          ) : null}
        </View>
      </View>

      {kind === 'friend' ? (
        <>
          {roundsLoad.state === 'ready' ? (
            <FriendRounds
              rounds={roundsLoad.rounds}
              record={roundsLoad.record}
              name={name}
              selfInitials={selfInitials}
              expanded={expanded}
              onExpand={() => setExpanded(true)}
              onOpenRound={(gameId) => openOrReturn(navigation, 'Leaderboard', { gameId })}
              now={now}
            />
          ) : roundsLoad.state === 'failed' ? (
            <FailureCard line={failureLine(roundsLoad.reason)} onRetry={retry} />
          ) : roundsLoad.state === 'loading' ? (
            <Loading />
          ) : null}
          {line ? <ErrorLine text={line} /> : null}
          <View style={line ? styles.afterError : styles.removeSlot}>
            <Pill
              tone="danger"
              size="large"
              label={FRIENDS_TEXT.removeConfirmLabel}
              pendingLabel={FRIENDS_TEXT.removePending}
              pending={busy}
              disabled={busy}
              onPress={onRemove}
              testID="friend-page-remove"
            />
          </View>
        </>
      ) : kind === null ? (
        friendsLoad.state === 'failed' ? (
          <FailureCard line={failureLine(friendsLoad.reason)} onRetry={retry} />
        ) : (
          <Loading />
        )
      ) : friendsLoad.state === 'failed' && outcome === null ? (
        <FailureCard line={failureLine(friendsLoad.reason)} onRetry={retry} />
      ) : (
        <NotFriendYet
          values={friendPageValues(
            {
              hcp,
              stats: relation ? (relation.person ? relation.person.stats : NO_ROUNDS) : null,
            },
            now,
          )}
          noRounds={
            relation !== null && (relation.person === null || relation.person.stats?.roundsTogether === 0)
          }
          line={line}
          action={
            kind === 'outgoing' ? (
              <SentLine />
            ) : kind === 'incoming' && relation?.kind === 'incoming' ? (
              <Pill
                size="large"
                label={FRIENDS_TEXT.acceptLabel}
                pendingLabel={FRIENDS_TEXT.acceptPending}
                pending={busy}
                // Låst mens handlingen går, men ikke dempet: «Godtar …» skal leses.
                disabled={busy}
                onPress={() => void run(() => respondToFriendRequest(relation.requestId, true))}
                testID="friend-page-accept"
              />
            ) : kind === 'none' ? (
              <Pill
                size="large"
                label={FRIENDS_TEXT.addFriendLabel}
                pendingLabel={FRIENDS_TEXT.addFriendPending}
                pending={busy}
                disabled={busy}
                onPress={() => void run(() => sendFriendRequest(userId))}
                testID="friend-page-add"
              />
            ) : null
          }
        />
      )}
    </ScrollView>
  );
}

/** Stillingen og rundene for en venn. */
function FriendRounds({
  rounds,
  record,
  name,
  selfInitials,
  expanded,
  onExpand,
  onOpenRound,
  now,
}: {
  rounds: FriendRound[];
  record: FriendRecord;
  name: string;
  selfInitials: string | null;
  expanded: boolean;
  onExpand: () => void;
  onOpenRound: (gameId: string) => void;
  now: Date;
}) {
  const { colors } = useTheme();
  const hasMore = !expanded && rounds.length > ROUNDS_SHOWN;
  const shown = hasMore ? rounds.slice(0, ROUNDS_SHOWN) : rounds;
  return (
    <>
      <HeadToHead
        record={record}
        name={name}
        selfInitials={selfInitials}
        hasTeamRounds={rounds.some((r) => r.badge === 'same_team')}
      />
      {rounds.length > 0 ? (
        <>
          <Text style={[styles.listTitle, { color: colors.muted }]} testID="friend-page-rounds-title">
            {roundsListTitle(rounds.length)}
          </Text>
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {shown.map((round, i) => (
              <RoundRow
                key={round.gameId}
                round={round}
                name={name}
                now={now}
                divider={i < shown.length - 1 || hasMore}
                onPress={() => onOpenRound(round.gameId)}
              />
            ))}
            {hasMore ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: false }}
                onPress={onExpand}
                style={({ pressed }) => [styles.showAll, pressed ? styles.pressed : null]}
                testID="friend-page-show-all"
              >
                <Text style={[styles.showAllText, { color: colors.primary }]}>{showAllRounds(rounds.length)}</Text>
                <ChevronIcon direction="down" size={16} strokeWidth={2} color={colors.primary} />
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}
    </>
  );
}

/** «Mot hverandre»: deg og vennen, stillingen, streken og lederlinja. */
function HeadToHead({
  record,
  name,
  selfInitials,
  hasTeamRounds,
}: {
  record: FriendRecord;
  name: string;
  selfInitials: string | null;
  hasTeamRounds: boolean;
}) {
  const { colors, ui } = useTheme();
  const played = record.played > 0;
  const text = played
    ? headToHeadLine(record, name)
    : hasTeamRounds
      ? `${FRIEND_PAGE_TEXT.noHeadToHead} ${FRIEND_PAGE_TEXT.teamRoundsDontCount}`
      : FRIEND_PAGE_TEXT.noHeadToHead;
  // Streken: dine runder i skog, de like grå og vennens i gull, i rekkefølge.
  const segments = [
    { key: 'you', flex: record.youAhead, color: colors.primary, opacity: 1 },
    { key: 'tied', flex: record.tied, color: colors.muted, opacity: 0.5 },
    { key: 'them', flex: record.themAhead, color: colors.accent, opacity: 1 },
  ].filter((s) => s.flex > 0);
  return (
    <View style={[styles.h2hCard, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="friend-page-h2h">
      <Text style={[styles.cardTitle, { color: colors.muted }]}>{FRIEND_PAGE_TEXT.headToHead}</Text>
      <View
        style={styles.scoreRow}
        accessible
        accessibilityRole="image"
        accessibilityLabel={headToHeadA11yLabel(record, name)}
        testID="friend-page-score"
      >
        <View style={styles.side}>
          <Avatar name="" initials={selfInitials ?? ''} tone="soft" size={44} />
          <Text style={[styles.sideName, { color: colors.text }]} numberOfLines={1}>
            {FRIEND_PAGE_TEXT.you}
          </Text>
        </View>
        {played ? (
          <View style={styles.score}>
            <Text style={[styles.scoreText, ui.num, { color: colors.text }]}>{record.youAhead}</Text>
            <Text style={[styles.scoreText, styles.scoreDash, { color: colors.muted }]}>–</Text>
            <Text style={[styles.scoreText, ui.num, { color: colors.text }]}>{record.themAhead}</Text>
          </View>
        ) : (
          <Text style={[styles.scoreText, { color: colors.muted }]}>–</Text>
        )}
        <View style={styles.side}>
          <Avatar name={name} tone="strong" size={44} />
          <Text style={[styles.sideName, { color: colors.text }]} numberOfLines={1}>
            {firstNameOf(name)}
          </Text>
        </View>
      </View>
      {segments.length > 0 ? (
        <View style={styles.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {segments.map((s) => (
            <View
              key={s.key}
              style={[styles.barPart, { flex: s.flex, backgroundColor: s.color, opacity: s.opacity }]}
              testID={`friend-page-bar-${s.key}`}
            />
          ))}
        </View>
      ) : null}
      <Text style={[styles.leader, { color: colors.muted }]} testID="friend-page-leader">
        {text}
      </Text>
    </View>
  );
}

/** Én runde i lista: navnet, dato og format, og merket. Et trykk åpner resultatet. */
function RoundRow({
  round,
  name,
  now,
  divider,
  onPress,
}: {
  round: FriendRound;
  name: string;
  now: Date;
  divider: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const sub = roundRowSubline(round, now);
  const badge = round.badge ? roundBadgeLabel(round.badge, name) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[round.name, sub, badge].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.roundRow,
        divider ? { borderBottomWidth: 1, borderBottomColor: colors.divider } : null,
        pressed ? styles.pressed : null,
      ]}
      testID={`friend-page-round-${round.gameId}`}
    >
      <View style={styles.roundText}>
        <Text style={[styles.roundName, { color: colors.text }]} numberOfLines={1}>
          {round.name}
        </Text>
        {sub ? (
          <Text style={[styles.roundSub, { color: colors.muted }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {round.badge && badge ? <Badge badge={round.badge} label={badge} /> : null}
    </Pressable>
  );
}

function Badge({ badge, label }: { badge: FriendRoundBadge; label: string }) {
  const { colors } = useTheme();
  const look = {
    you_ahead: { bg: colors.primarySoft, border: 'transparent', ink: colors.primary },
    them_ahead: { bg: colors.trackBg, border: 'transparent', ink: colors.text },
    same_team: { bg: 'transparent', border: colors.border, ink: colors.muted },
    tied: { bg: 'transparent', border: colors.muted, ink: colors.text },
  }[badge];
  return (
    <View style={[styles.badge, { backgroundColor: look.bg, borderColor: look.border }]}>
      <Text style={[styles.badgeText, { color: look.ink }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** For en som ikke er venn: radene (eller setningen uten runder), knappen og linja om hva du får se. */
function NotFriendYet({
  values,
  noRounds,
  line,
  action,
}: {
  values: ReturnType<typeof friendPageValues>;
  noRounds: boolean;
  line: string | null;
  action: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <>
      {noRounds ? (
        <>
          {values.hcp !== null ? (
            <View style={styles.rowsSlot}>
              <RowsCard>
                <SheetRow label={FRIENDS_TEXT.sheetHcp} value={values.hcp} testID="friend-page-hcp" />
              </RowsCard>
            </View>
          ) : null}
          <Text style={[styles.noRounds, { color: colors.muted }]} testID="friend-page-no-rounds">
            {FRIEND_PAGE_TEXT.noRoundsTogether}
          </Text>
        </>
      ) : (
        <View style={styles.rowsSlot}>
          <RowsCard>
            {values.hcp !== null ? (
              <SheetRow label={FRIENDS_TEXT.sheetHcp} value={values.hcp} testID="friend-page-hcp" />
            ) : null}
            <SheetRow label={FRIENDS_TEXT.sheetRounds} value={values.rounds} testID="friend-page-rounds" />
            <SheetRow label={FRIENDS_TEXT.sheetLastPlayed} value={values.lastPlayed} testID="friend-page-last" />
          </RowsCard>
        </View>
      )}
      {line ? <ErrorLine text={line} /> : null}
      <View style={line ? styles.afterError : styles.actionSlot}>{action}</View>
      <Text style={[styles.hint, { color: colors.muted }]} testID="friend-page-hint">
        {FRIEND_PAGE_TEXT.becomeFriendsHint}
      </Text>
    </>
  );
}

/** «Venneforespørsel sendt.» der knappen var, som i ligaarket. */
function SentLine() {
  const { colors } = useTheme();
  return (
    <View style={styles.sent} testID="friend-page-sent">
      <BetaltHakeIcon size={18} color={colors.successText} />
      <Text style={[styles.sentText, { color: colors.successText }]}>{friendStatusLine('requested')?.text}</Text>
    </View>
  );
}

/** Uten nett eller uten svar: linja og «Prøv igjen» der innholdet skulle stått (tegning 6 og 12). */
function FailureCard({ line, onRetry }: { line: string; onRetry: () => void }) {
  const { colors, ui } = useTheme();
  return (
    <View style={[styles.failureCard, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="friend-page-failure">
      <Text style={[styles.failureText, { color: colors.text }]}>{line}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={[ui.buttonSecondary, styles.retry]}
        testID="friend-page-retry"
      >
        <Text style={ui.buttonSecondaryText}>{FRIENDS_TEXT.retry}</Text>
      </Pressable>
    </View>
  );
}

function ErrorLine({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.errorLine, { color: colors.danger }]} testID="friend-page-error">
      {text}
    </Text>
  );
}

function Loading() {
  const { colors } = useTheme();
  return (
    <View style={styles.loading} testID="friend-page-loading">
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

// Målene er tegningens (`project/Venneside-C-*.dc.html`).
const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  pressed: { opacity: 0.6 },

  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 14, paddingHorizontal: 20 },
  headText: { flex: 1, minWidth: 0 },
  // Navnet kan gå over to linjer (320 bredt).
  name: { ...fraunces(500, 28, 34, { multiline: true }) },
  subline: { fontSize: 13, lineHeight: 16, fontFamily: FONTS.sans, marginTop: 2 },

  h2hCard: {
    marginTop: 18,
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 14,
  },
  cardTitle: { fontSize: 12, lineHeight: 15, fontFamily: FONTS.sansSemiBold },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  side: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6 },
  sideName: { maxWidth: '100%', fontSize: 13, lineHeight: 16, fontFamily: FONTS.sansSemiBold },
  score: { flexDirection: 'row', alignItems: 'center' },
  scoreText: { ...fraunces(600, 48, 52) },
  scoreDash: { paddingHorizontal: 10 },
  bar: { flexDirection: 'row', gap: 3, height: 6 },
  barPart: { borderRadius: 999 },
  leader: { fontSize: 13, lineHeight: 18, fontFamily: FONTS.sans, textAlign: 'center' },

  listTitle: {
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 8,
    fontSize: 12,
    lineHeight: 15,
    fontFamily: FONTS.sansSemiBold,
  },
  listCard: { marginHorizontal: 16, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  roundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  roundText: { flex: 1, minWidth: 0 },
  roundName: { fontSize: 15, lineHeight: 20, fontFamily: FONTS.sansSemiBold },
  roundSub: { fontSize: 12, lineHeight: 16, fontFamily: FONTS.sans, marginTop: 2 },
  badge: {
    flexShrink: 0,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
  },
  badgeText: { fontSize: 12, lineHeight: 15, fontFamily: FONTS.sansSemiBold },
  showAll: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 14 },
  showAllText: { fontSize: 15, lineHeight: 20, fontFamily: FONTS.sansSemiBold },

  removeSlot: { marginTop: 24, marginHorizontal: 16 },
  rowsSlot: { marginTop: 18, marginHorizontal: 16 },
  actionSlot: { marginTop: 18, marginHorizontal: 16 },
  // Med en feillinje over står knappen 12 under den (tegning 7).
  afterError: { marginTop: 12, marginHorizontal: 16 },
  noRounds: { marginTop: 18, marginHorizontal: 20, fontSize: 15, lineHeight: 20, fontFamily: FONTS.sans },
  hint: { marginTop: 14, marginHorizontal: 20, fontSize: 13, lineHeight: 18, fontFamily: FONTS.sans },
  errorLine: { marginTop: 18, marginHorizontal: 20, fontSize: 15, lineHeight: 20, fontFamily: FONTS.sans },
  sent: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sentText: { fontSize: 15, lineHeight: 19, fontFamily: FONTS.sansSemiBold },

  failureCard: { marginTop: 18, marginHorizontal: 16, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  failureText: { fontSize: 15, lineHeight: 20, fontFamily: FONTS.sans },
  retry: { marginTop: 0 },
  loading: { marginTop: 18, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
