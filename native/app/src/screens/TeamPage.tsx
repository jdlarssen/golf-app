// native/app/src/screens/TeamPage.tsx
// #2840 del 3: lagsiden i appen. Tegningen v3.1, «3. Lagsiden», er fasiten:
//  - Kapteinen: lagnavnet, linja under («Onsdagsgolfen · påmeldt · 2 av 3 har svart
//    ja»), oppstillingen med kapteinsmerket, og én rad per medspiller med skive, navn
//    og status. «•••» åpner et ark med det som gjelder for akkurat den spilleren. En som
//    har takket nei, får «Bytt med en venn», og en ledig plass «Velg en venn», synlig på
//    raden. «Fjern fra laget» og «Gi kapteinsrollen» går videre til hver sin
//    bekreftelse (destruktive flyter har egen skjerm, `TeamConfirm.tsx`).
//  - Medspilleren: oppstillingen og lista, uten «•••»: bare kapteinen kan endre laget.
//  - En gammel invitasjon på e-post: «Kari vil ha deg med på laget» og «Bli med på laget».
//  - Uten lag, et lag vi ikke finner eller en påmelding alene: et kort med en setning og
//    veien til påmeldingen.
//
// Alt kommer fra `GET /api/pamelding/[shortId]/lag` (`data/teamPage.ts`), og skjermen
// spør på nytt når den får fokus: etter en bekreftelse eller «Velg en venn» står laget
// slik serveren har det. Serveren avgjør hvem som får gjøre hva; skjermen viser bare
// kapteinens knapper til kapteinen.
//
// Lagvarslene peker hit, også «Kari vil ha deg med på laget». En medspiller som ikke
// har svart, sendes videre til svaret på påmeldingsskjermen (`backTo`), der det står.
//
// Tilbake (`docs/user-flows.md` §Tilbake): lagsiden ligger under Hjem, eller over
// skjermen som åpnet den (påmeldingen, runden, innboksen).
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  AppTeamPageMember,
  AppTeamPageResponse,
  AppTeamPageTeam,
} from '../../../../lib/games/appRoundInviteView';
import { nameInitials } from '../../../../lib/names/initials';
import { useBottomInsetUnlessKeyboard } from '../components/KeyboardInset';
import { Dock, DockButton, Lineup, LineupCell, TeamDisc, teamStyles } from '../components/signup/TeamParts';
import {
  attachToTeam,
  fetchTeamPage,
  resendInvite,
  type TeamPageActionFailure,
  type TeamPageLoadFailure,
} from '../data/teamPage';
import { backTo, openOrReturn } from '../lib/backTo';
import { ROUND_INVITE_TEXT } from '../lib/roundInviteCopy';
import {
  TEAM_PAGE_TEXT,
  attachBody,
  describeTeamPageFailure,
  describeTeamPageLoadFailure,
  isRetryableTeamPageFailure,
  memberStatusLine,
  moreLabel,
  resentLine,
  teamMetaLine,
  teamTitle,
} from '../lib/teamPageCopy';
import {
  canEditTeam,
  freeSlotCount,
  memberState,
  menuActions,
  orderedMembers,
  teamLineup,
  type MenuAction,
} from '../lib/teamPageModel';
import { TEAM_SIGNUP_TEXT, firstName, inviteTitle, teamRoundLine } from '../lib/teamSignupCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, TAP, fraunces, interLine, sheetScrim, useTheme } from '../theme';

export function TeamPage({ navigation, route }: ScreenProps<'TeamPage'>) {
  const { colors, ui } = useTheme();
  const { shortId } = route.params;
  const [view, setView] = useState<AppTeamPageResponse | null>(null);
  const [failure, setFailure] = useState<TeamPageLoadFailure | null>(null);
  const [loading, setLoading] = useState(false);
  const latestLoad = useRef(0);
  const loadedFor = useRef(shortId);

  const load = useCallback(async () => {
    const thisLoad = ++latestLoad.current;
    // Et varsel for en annen runde kan bytte koden på skjermen (`navigate` til skjermen
    // som står øverst): den forrige rundens lag skal ikke stå mens den nye hentes.
    if (loadedFor.current !== shortId) {
      loadedFor.current = shortId;
      setView(null);
      setFailure(null);
    }
    setLoading(true);
    const result = await fetchTeamPage(shortId);
    if (thisLoad !== latestLoad.current) return;
    setLoading(false);
    if (result.ok) {
      // Varselet «Kari vil ha deg med på laget» peker hit, men svaret står på
      // påmeldingsskjermen (tegningen, «2. Svaret på invitasjonen»). Er skjermen lukket,
      // ville `backTo` truffet skjermen du står på (#2757), så bare når den har fokus.
      if (result.view.kind === 'member' && result.view.myStatus === 'pending') {
        if (navigation.isFocused()) {
          backTo(navigation, 'RoundInvite', { shortId, src: null });
          return;
        }
      }
      setFailure(null);
      setView(result.view);
    } else {
      setFailure(result.reason);
    }
  }, [navigation, shortId]);

  // Også ved fokus: etter en bekreftelse eller «Velg en venn» står laget som det er nå.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toSignup = useCallback(
    () => openOrReturn(navigation, 'RoundInvite', { shortId, src: null }),
    [navigation, shortId],
  );

  if (failure === 'not_found') {
    return (
      <Calm
        text={ROUND_INVITE_TEXT.notFound}
        button={ROUND_INVITE_TEXT.toHome}
        onPress={() => navigation.popToTop()}
        testID="team-page-not-found"
      />
    );
  }
  if (view === null) {
    return failure === null ? (
      <View style={ui.centered} testID="team-page-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>{TEAM_PAGE_TEXT.loading}</Text>
      </View>
    ) : (
      <View style={[styles.state, { backgroundColor: colors.bg }]} testID="team-page-load-failed">
        <Text style={[styles.stateText, { color: colors.danger }]} testID="team-page-load-error">
          {describeTeamPageLoadFailure(failure)}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void load()}
          style={[styles.retry, { borderColor: colors.primary }]}
          testID="team-page-retry"
        >
          <Text style={[styles.retryText, { color: colors.primary }]}>
            {loading ? ROUND_INVITE_TEXT.retrying : ROUND_INVITE_TEXT.retry}
          </Text>
        </Pressable>
      </View>
    );
  }

  switch (view.kind) {
    case 'captain':
    case 'member':
      return (
        <TeamView
          shortId={shortId}
          team={view}
          unavailableFriendIds={view.unavailableFriendIds ?? []}
          onStale={() => void load()}
          navigation={navigation}
        />
      );
    case 'invited_unknown':
      return <AttachView shortId={shortId} view={view} onDone={() => void load()} />;
    case 'team_unknown':
      return (
        <Calm
          text={view.noCaptain ? TEAM_PAGE_TEXT.noCaptain : TEAM_PAGE_TEXT.teamUnknown}
          button={TEAM_PAGE_TEXT.toSignup}
          onPress={toSignup}
          testID="team-page-team-unknown"
        />
      );
    case 'solo':
      return <Calm text={TEAM_PAGE_TEXT.solo} button={TEAM_PAGE_TEXT.toSignup} onPress={toSignup} testID="team-page-solo" />;
    case 'no_team':
      return (
        <Calm text={TEAM_PAGE_TEXT.noTeam} button={TEAM_PAGE_TEXT.toSignup} onPress={toSignup} testID="team-page-no-team" />
      );
  }
}

/** Et rolig kort med én setning og veien videre. */
function Calm({ text, button, onPress, testID }: { text: string; button: string; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.scroll} testID={testID}>
      <View style={[teamStyles.block, { backgroundColor: colors.surface }]}>
        <Text style={[teamStyles.body, { color: colors.text }]} testID={`${testID}-text`}>
          {text}
        </Text>
        <DockButton label={button} variant="line" onPress={onPress} testID={`${testID}-button`} />
      </View>
    </ScrollView>
  );
}

type Navigation = ScreenProps<'TeamPage'>['navigation'];

function TeamView({
  shortId,
  team,
  unavailableFriendIds,
  onStale,
  navigation,
}: {
  shortId: string;
  team: AppTeamPageTeam;
  unavailableFriendIds: string[];
  onStale: () => void;
  navigation: Navigation;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [menuFor, setMenuFor] = useState<AppTeamPageMember | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const editable = canEditTeam(team);
  const title = teamTitle(team);
  const free = freeSlotCount(team);
  const lineup = teamLineup(team);
  const members = orderedMembers(team.members);

  const pick = (replaceRequestId: string | null) =>
    openOrReturn(navigation, 'TeamSlotPicker', {
      shortId,
      teamName: title,
      open: replaceRequestId ? 1 : Math.max(1, free),
      replaceRequestId,
      teamUserIds: [...(team.captain ? [team.captain.userId] : []), ...team.members.map((m) => m.userId)],
      unavailableFriendIds,
    });

  const onMenu = (member: AppTeamPageMember, action: Exclude<MenuAction, 'resend'>) => {
    setMenuFor(null);
    if (action === 'remove') {
      openOrReturn(navigation, 'TeamRemoveConfirm', {
        shortId,
        requestId: member.requestId,
        name: member.displayName,
        teamName: team.teamName,
        pending: member.status === 'pending',
      });
    } else {
      openOrReturn(navigation, 'TeamTransferConfirm', {
        shortId,
        requestId: member.requestId,
        name: member.displayName,
        teamName: team.teamName,
      });
    }
  };

  // Listas rader: kapteinen ser medspillerne og de ledige plassene. Medspilleren ser
  // kapteinen og de andre, ikke seg selv.
  const rows: { person: AppTeamPageMember; captain: boolean }[] =
    team.kind === 'captain'
      ? members.map((person) => ({ person, captain: false }))
      : [
          ...(team.captain ? [{ person: { ...team.captain, isGuest: false }, captain: true }] : []),
          ...members.filter((m) => m.requestId !== team.myRowId).map((person) => ({ person, captain: false })),
        ];

  const note =
    team.kind === 'member'
      ? TEAM_PAGE_TEXT.memberNote
      : team.game.signupsClosed
        ? ROUND_INVITE_TEXT.closed
        : TEAM_PAGE_TEXT.captainNote;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} testID={`team-page-${team.kind}`}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.head}>
          <Text style={[teamStyles.heading, { color: colors.text }]} accessibilityRole="header" testID="team-page-title">
            {title}
          </Text>
          <Text style={[teamStyles.meta, { color: colors.muted }]} testID="team-page-meta">
            {teamMetaLine(team)}
          </Text>
        </View>

        <Lineup testID="team-page-lineup">
          {lineup.map((entry, index) =>
            entry.kind === 'free' ? (
              <LineupCell
                key={entry.key}
                name={TEAM_SIGNUP_TEXT.free}
                muted
                accessibilityLabel={TEAM_SIGNUP_TEXT.freeSlot}
                testID={`team-page-slot-${index}`}
              >
                <TeamDisc kind="empty" label="+" size="lg" ground={colors.bg} testID={`team-page-slot-${index}-free`} />
              </LineupCell>
            ) : (
              <LineupCell
                key={entry.key}
                name={entry.isYou ? TEAM_SIGNUP_TEXT.you : firstName(entry.name)}
                muted={entry.faded}
                accessibilityLabel={entry.isYou ? TEAM_SIGNUP_TEXT.you : (entry.name ?? undefined)}
                testID={`team-page-slot-${index}`}
              >
                <TeamDisc
                  kind={entry.isYou ? 'me' : 'other'}
                  label={nameInitials(entry.name)}
                  size="lg"
                  captain={entry.captain}
                  faded={entry.faded}
                  ground={colors.bg}
                  testID={`team-page-slot-${index}-disc`}
                />
              </LineupCell>
            ),
          )}
        </Lineup>

        {rows.length > 0 || (editable && free > 0) ? (
          <View style={[styles.list, { backgroundColor: colors.surface }]} testID="team-page-list">
            {rows.map(({ person, captain }) => {
              const state = memberState(person.status);
              const actions = team.kind === 'captain' && editable ? menuActions(person) : [];
              return (
                <View key={person.requestId} style={styles.row} testID={`team-page-row-${person.requestId}`}>
                  <TeamDisc kind="other" label={nameInitials(person.displayName)} size="md" ground={colors.surface} />
                  <View style={styles.rowText}>
                    <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                      {person.displayName ?? TEAM_PAGE_TEXT.fallbackName}
                    </Text>
                    <Text
                      style={[styles.rowLine, { color: !captain && state === 'pending' ? colors.warningText : colors.muted }]}
                      testID={`team-page-row-${person.requestId}-status`}
                    >
                      {captain ? TEAM_PAGE_TEXT.captain : memberStatusLine(state)}
                    </Text>
                  </View>
                  {actions.length > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={moreLabel(person.displayName)}
                      onPress={() => {
                        setNotice(null);
                        setMenuFor(person);
                      }}
                      style={({ pressed }) => [styles.dots, pressed ? styles.pressed : null]}
                      testID={`team-page-row-${person.requestId}-menu`}
                    >
                      <Text style={[styles.dotsText, { color: colors.muted }]}>•••</Text>
                    </Pressable>
                  ) : team.kind === 'captain' && editable && state === 'declined' ? (
                    <RowAction label={TEAM_PAGE_TEXT.swap} onPress={() => pick(person.requestId)} testID={`team-page-row-${person.requestId}-swap`} />
                  ) : null}
                </View>
              );
            })}
            {editable
              ? Array.from({ length: free }, (_, i) => (
                  <View key={`free-${i}`} style={styles.row} testID={`team-page-free-${i}`}>
                    <TeamDisc kind="empty" label="+" size="md" ground={colors.surface} />
                    <View style={styles.rowText}>
                      <Text style={[styles.rowName, { color: colors.muted }]}>{TEAM_PAGE_TEXT.freeSlot}</Text>
                    </View>
                    <RowAction label={TEAM_PAGE_TEXT.pickFriend} onPress={() => pick(null)} testID={`team-page-free-${i}-pick`} />
                  </View>
                ))
              : null}
          </View>
        ) : null}

        {notice ? (
          <Text style={[styles.notice, { color: colors.text }]} testID="team-page-notice">
            {notice}
          </Text>
        ) : null}
        <View style={[styles.note, { backgroundColor: colors.surface }]}>
          <Text style={[styles.noteText, { color: colors.muted }]} testID="team-page-note">
            {note}
          </Text>
        </View>
      </ScrollView>

      <MemberSheet
        shortId={shortId}
        member={menuFor}
        onClose={() => setMenuFor(null)}
        onAction={onMenu}
        onResent={(member) => {
          setMenuFor(null);
          setNotice(resentLine(member.displayName));
        }}
        onStale={() => {
          setMenuFor(null);
          onStale();
        }}
      />
    </View>
  );
}

/** «Bytt med en venn» og «Velg en venn»: synlig på raden, med kant (`.act`). */
function RowAction({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.act, { borderColor: colors.primary }, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <Text style={[styles.actText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * «•••»-arket (tegningen, «…»-menyen): skiva og navnet, så det som gjelder for akkurat
 * den spilleren. «Send på nytt» skjer her; «Gi kapteinsrollen» og «Fjern fra laget» går
 * videre til bekreftelsen.
 */
function MemberSheet({
  shortId,
  member,
  onClose,
  onAction,
  onResent,
  onStale,
}: {
  shortId: string;
  member: AppTeamPageMember | null;
  onClose: () => void;
  onAction: (member: AppTeamPageMember, action: Exclude<MenuAction, 'resend'>) => void;
  onResent: (member: AppTeamPageMember) => void;
  onStale: () => void;
}) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TeamPageActionFailure | null>(null);
  const sending = useRef(false);
  const actions = member ? menuActions(member) : [];

  const close = () => {
    if (sending.current) return;
    setError(null);
    onClose();
  };

  const resend = async () => {
    if (!member || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const result = await resendInvite(shortId, member.requestId);
    sending.current = false;
    setBusy(false);
    if (result.ok) {
      onResent(member);
      return;
    }
    // Medspilleren er borte fra laget, eller har svart imens: vis laget som det er nå.
    if (result.reason === 'not_found') {
      onStale();
      return;
    }
    setError(result.reason);
  };

  const retry = error !== null && isRetryableTeamPageFailure(error);

  return (
    <Modal transparent visible={member !== null} animationType="slide" onRequestClose={close}>
      <View style={styles.sheetRoot}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: sheetScrim(colors, scheme) }]}
          onPress={close}
          accessible={false}
          testID="team-menu-scrim"
        />
        {member ? (
          <View
            style={[styles.menu, { backgroundColor: colors.surface, paddingBottom: 18 + insets.bottom }]}
            accessibilityViewIsModal
            onAccessibilityEscape={close}
            testID="team-menu"
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <View style={styles.who}>
              <TeamDisc kind="other" label={nameInitials(member.displayName)} size="md" ground={colors.surface} />
              <Text style={[styles.whoName, { color: colors.text }]} accessibilityRole="header" numberOfLines={1}>
                {member.displayName ?? TEAM_PAGE_TEXT.fallbackName}
              </Text>
            </View>
            {error ? (
              <Text style={[styles.menuError, { color: colors.danger }]} testID="team-menu-error">
                {describeTeamPageFailure(error)}
              </Text>
            ) : null}
            {actions.includes('resend') ? (
              <MenuItem
                label={busy ? TEAM_PAGE_TEXT.resending : retry ? ROUND_INVITE_TEXT.retry : TEAM_PAGE_TEXT.resend}
                color={colors.text}
                disabled={busy}
                onPress={() => void resend()}
                testID="team-menu-resend"
              />
            ) : null}
            {actions.includes('transfer') ? (
              <MenuItem
                label={TEAM_PAGE_TEXT.transfer}
                color={colors.text}
                disabled={busy}
                onPress={() => onAction(member, 'transfer')}
                testID="team-menu-transfer"
              />
            ) : null}
            {actions.includes('remove') ? (
              <MenuItem
                label={TEAM_PAGE_TEXT.remove}
                color={colors.danger}
                disabled={busy}
                onPress={() => onAction(member, 'remove')}
                testID="team-menu-remove"
              />
            ) : null}
            <MenuItem label={TEAM_PAGE_TEXT.close} color={colors.muted} disabled={busy} onPress={close} testID="team-menu-close" />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function MenuItem({
  label,
  color,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  color: string;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed ? { backgroundColor: colors.primarySoft } : null]}
      testID={testID}
    >
      <Text style={[styles.itemText, { color }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * En gammel invitasjon på e-post (tegningen, «En gammel invitasjon på e-post»): den som
 * logger inn med adressen, finner invitasjonen her og blir med på kapteinens lag.
 */
function AttachView({
  shortId,
  view,
  onDone,
}: {
  shortId: string;
  view: Extract<AppTeamPageResponse, { kind: 'invited_unknown' }>;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TeamPageActionFailure | null>(null);
  const sending = useRef(false);

  const join = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const result = await attachToTeam(shortId, view.invitationId);
    sending.current = false;
    setBusy(false);
    // Med på laget, eller invitasjonen er borte: vis det som gjelder nå.
    if (result.ok || result.reason === 'not_found' || result.reason === 'team_unknown') {
      onDone();
      return;
    }
    setError(result.reason);
  };

  const retry = error !== null && isRetryableTeamPageFailure(error);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} testID="team-page-attach">
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.head}>
          <Text style={[teamStyles.heading, { color: colors.text }]} accessibilityRole="header" testID="team-page-title">
            {view.teamName ?? view.game.name}
          </Text>
          <Text style={[teamStyles.meta, { color: colors.muted }]} testID="team-page-meta">
            {teamRoundLine({ name: view.game.name, teeOffAt: view.game.teeOffAt })}
          </Text>
        </View>
        <View style={[teamStyles.block, { backgroundColor: colors.surface }]}>
          <Text style={[teamStyles.big, { color: colors.text }]} testID="team-page-attach-ask">
            {inviteTitle(view.captainName)}
          </Text>
          <Text style={[teamStyles.body, { color: colors.text }]} testID="team-page-attach-effect">
            {attachBody(view.game.joinEffect)}
          </Text>
        </View>
      </ScrollView>
      <Dock bottomInset={bottomInset}>
        {error ? (
          <Text style={[styles.dockError, { color: colors.danger }]} testID="team-page-attach-error">
            {describeTeamPageFailure(error)}
          </Text>
        ) : null}
        <DockButton
          label={busy ? TEAM_SIGNUP_TEXT.joining : retry ? ROUND_INVITE_TEXT.retry : TEAM_SIGNUP_TEXT.joinTeam}
          variant="primary"
          busy={busy}
          onPress={() => void join()}
          testID="team-page-attach-join"
        />
      </Dock>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 20 },
  // `.head`: 6 over, 20 fra kanten, 4 mellom tittelen og linja.
  head: { paddingTop: 6, paddingHorizontal: 20, gap: 4 },
  // `.list`: 12 over, 16 fra kanten, 18 i hjørnene, 4 over og under radene.
  list: { marginTop: 12, marginHorizontal: 16, borderRadius: 18, paddingVertical: 4 },
  // `.r`: minst 60 høy, 8/14 inni, 12 mellom skiva og navnet.
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8, paddingHorizontal: 14 },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 16, fontFamily: FONTS.sansMedium },
  rowLine: { fontSize: 13, fontFamily: FONTS.sans, marginTop: 2, fontVariant: ['tabular-nums'] },
  // `.dots`: 44 × 44, «•••» i `muted`, 10 ut mot kanten.
  dots: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  dotsText: { fontSize: 20, letterSpacing: 1 },
  // `.act`: minst 44 høy, 14 inni, helt runde ender, kant i `primary`.
  act: { minHeight: TAP, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
  actText: { fontSize: 14, fontFamily: FONTS.sansSemiBold },
  // `.note`: 12 over, 16 fra kanten, 12/14 inni, 16 i hjørnene.
  note: { marginTop: 12, marginHorizontal: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16 },
  noteText: { ...interLine(14, 19.6, { multiline: true }), fontFamily: FONTS.sans },
  notice: { ...interLine(14, 19.6, { multiline: true }), fontFamily: FONTS.sans, marginTop: 12, marginHorizontal: 20 },
  pressed: { opacity: 0.6 },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  // `.menu`: 22 i de øvre hjørnene, 10 over, 18 under.
  menu: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 10 },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 6 },
  // `.who`: 8/20/12, 12 mellom skiva og navnet, navnet i Fraunces 20.
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, paddingHorizontal: 20, paddingBottom: 12 },
  whoName: { ...fraunces(500, 20, 24), flexShrink: 1 },
  // `.it`: minst 52 høy, 20 fra kanten, 16 pt.
  item: { minHeight: 52, paddingHorizontal: 20, justifyContent: 'center' },
  itemText: { fontSize: 16, fontFamily: FONTS.sans },
  menuError: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, paddingHorizontal: 20, paddingBottom: 8 },
  dockError: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  state: { flex: 1, alignItems: 'center', gap: 12, paddingTop: 26, paddingHorizontal: 24 },
  stateText: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, borderWidth: 1, borderRadius: 999, paddingHorizontal: 20, justifyContent: 'center' },
  retryText: { ...interLine(16, 19), fontFamily: FONTS.sansSemiBold },
});
