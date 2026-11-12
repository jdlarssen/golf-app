// native/app/src/components/signup/FriendPicker.tsx
// #2840: delene av vennevelgeren som lagskjemaet og «Velg en venn» på lagsiden deler,
// etter tegningen v3.1:
//  - `useFriends`: vennene fra `/api/friends`, hentet på nytt når skjermen får fokus
//    (en ny venn fra delelenka dukker opp når du kommer tilbake).
//  - `FriendSearchBar`: søket med «Legg til venn» ved siden av, alltid (kontrakt v3,
//    endring 6: «legg til en venn må alltid være mulig»).
//  - `FriendRow`: én venn i lista, med ring og hake når vennen er valgt, og blek med
//    en grunn når vennen ikke kan velges.
//  - `FriendsStatus`: «Henter vennene dine …» og feilen med «Prøv igjen».
//  - `AddFriendSheet`: arket med QR-koden og delelenka.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nameInitials } from '../../../../../lib/names/initials';
import { fetchFriends, type FriendItem } from '../../data/friends';
import { ROUND_INVITE_TEXT } from '../../lib/roundInviteCopy';
import { TEAM_SIGNUP_TEXT } from '../../lib/teamSignupCopy';
import { describeWebLinkFailure, friendLinkPath, webUrl } from '../../lib/webLink';
import { QrCode } from '../profile/QrCode';
import { SokIcon } from '../icons/Icons';
import { FONTS, TAP, fraunces, interLine, sheetScrim, useTheme } from '../../theme';
import { DockButton, TeamDisc } from './TeamParts';

export type FriendsState =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; friends: FriendItem[]; friendCode: string | null };

/**
 * Vennene dine. Hentes når skjermen får fokus, og `reload` når arket lukkes. En
 * henting som feiler etter at lista sto, lar lista stå.
 */
export function useFriends(): { friends: FriendsState; reload: () => void; retry: () => void } {
  const [friends, setFriends] = useState<FriendsState>({ state: 'loading' });
  const alive = useRef(true);
  const latest = useRef(0);

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const reload = useCallback(async () => {
    const thisLoad = ++latest.current;
    const result = await fetchFriends();
    if (!alive.current || thisLoad !== latest.current) return;
    if (result.ok) {
      setFriends({ state: 'ready', friends: result.data.friends, friendCode: result.data.friendCode });
    } else {
      setFriends((current) => (current.state === 'ready' ? current : { state: 'failed' }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const retry = useCallback(() => {
    setFriends({ state: 'loading' });
    void reload();
  }, [reload]);
  const reloadNow = useCallback(() => void reload(), [reload]);

  return { friends, reload: reloadNow, retry };
}

/** Søket og «Legg til venn» ved siden av. Knappen står alltid. */
export function FriendSearchBar({
  query,
  onQuery,
  onAddFriend,
  idPrefix,
}: {
  query: string;
  onQuery: (query: string) => void;
  onAddFriend: () => void;
  idPrefix: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.searchBar}>
      <View style={[styles.search, { backgroundColor: colors.surface2 }]}>
        <SokIcon color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={onQuery}
          placeholder={TEAM_SIGNUP_TEXT.search}
          placeholderTextColor={colors.muted}
          accessibilityLabel={TEAM_SIGNUP_TEXT.search}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[styles.searchInput, { color: colors.text }]}
          testID={`${idPrefix}-search`}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={TEAM_SIGNUP_TEXT.addFriend}
        onPress={onAddFriend}
        style={({ pressed }) => [styles.addFriend, { borderColor: colors.primary }, pressed ? styles.pressed : null]}
        testID={`${idPrefix}-add-friend`}
      >
        <Text style={[styles.addPlus, { color: colors.primary }]}>+</Text>
        <Text style={[styles.addText, { color: colors.primary }]}>{TEAM_SIGNUP_TEXT.addFriend}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Uten venner er det ingenting å søke i: linja og «Legg til en venn» som en hel knapp
 * (tegningen, «Ingen venner ennå»).
 */
export function NoFriends({ onAddFriend, idPrefix }: { onAddFriend: () => void; idPrefix: string }) {
  const { colors } = useTheme();
  return (
    <>
      <Text style={[friendListStyle.emptyLine, { color: colors.muted }]} testID={`${idPrefix}-no-friends`}>
        {TEAM_SIGNUP_TEXT.noFriends}
      </Text>
      <View style={styles.firstFriend}>
        <Pressable
          accessibilityRole="button"
          onPress={onAddFriend}
          style={[styles.lineButton, { borderColor: colors.primary }]}
          testID={`${idPrefix}-add-first-friend`}
        >
          <Text style={[styles.lineButtonText, { color: colors.primary }]}>{`+ ${TEAM_SIGNUP_TEXT.addFirstFriend}`}</Text>
        </Pressable>
      </View>
    </>
  );
}

/** «Henter vennene dine …», eller feilen med «Prøv igjen». `null` når lista står. */
export function FriendsStatus({
  friends,
  onRetry,
  idPrefix,
}: {
  friends: FriendsState;
  onRetry: () => void;
  idPrefix: string;
}) {
  const { colors } = useTheme();
  if (friends.state === 'loading') {
    return (
      <View style={styles.status} testID={`${idPrefix}-friends-loading`}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.statusText, { color: colors.muted }]}>{TEAM_SIGNUP_TEXT.friendsLoading}</Text>
      </View>
    );
  }
  if (friends.state === 'failed') {
    return (
      <View style={styles.status}>
        <Text style={[styles.statusText, { color: colors.danger }]} testID={`${idPrefix}-friends-failed`}>
          {TEAM_SIGNUP_TEXT.friendsFailed}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={[styles.retry, { borderColor: colors.primary }]}
          testID={`${idPrefix}-friends-retry`}
        >
          <Text style={[styles.retryText, { color: colors.primary }]}>{ROUND_INVITE_TEXT.retry}</Text>
        </Pressable>
      </View>
    );
  }
  return null;
}

/**
 * Én venn i lista: skiva, navnet og linja under. Valgt gir grønn ring og hake. En venn
 * som ikke kan velges, står blek, og linja sier hvorfor.
 */
export function FriendRow({
  friend,
  line,
  selected,
  disabled,
  onPress,
  idPrefix,
  discRef,
}: {
  friend: FriendItem;
  line: string | null;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  idPrefix: string;
  /** Skiva, til glidet i lagskjemaet. */
  discRef?: (node: View | null) => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={line ? `${friend.name}, ${line}` : friend.name}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        disabled ? styles.dim : null,
        pressed ? { backgroundColor: colors.primarySoft } : null,
      ]}
      testID={`${idPrefix}-friend-${friend.id}`}
    >
      <TeamDisc
        kind="other"
        label={nameInitials(friend.name)}
        size="md"
        selected={selected}
        ground={colors.surface}
        ref={discRef}
        testID={`${idPrefix}-friend-${friend.id}-disc`}
      />
      <View style={styles.rowText}>
        <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
          {friend.name}
        </Text>
        {line ? (
          <Text style={[styles.rowLine, { color: colors.muted }]} numberOfLines={1}>
            {line}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * «Legg til en venn» (tegningen, «Arket: legg til en venn»): QR-koden for når dere står
 * sammen, og delelenka for resten. Den som åpner lenka, blir venn med deg med en gang,
 * og lista hentes på nytt når arket lukkes og når skjermen får fokus igjen.
 */
export function AddFriendSheet({
  visible,
  friendCode,
  onClose,
}: {
  visible: boolean;
  friendCode: string | null;
  onClose: () => void;
}) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState<string | null>(null);
  const target = friendCode ? webUrl(friendLinkPath(friendCode)) : null;
  const url = target?.ok ? target.url : null;

  const share = useCallback(async () => {
    setNote(null);
    if (!target) {
      setNote(TEAM_SIGNUP_TEXT.noFriendLink);
      return;
    }
    if (!target.ok) {
      setNote(describeWebLinkFailure(target.reason));
      return;
    }
    try {
      await Share.share({ message: target.url });
    } catch (err: unknown) {
      console.error('[AddFriendSheet] deling feilet', err);
    }
  }, [target]);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: sheetScrim(colors, scheme) }]}
          onPress={onClose}
          accessible={false}
          testID="team-sheet-scrim"
        />
        <View
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: 22 + insets.bottom }]}
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          testID="team-sheet"
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.text }]} accessibilityRole="header">
            {TEAM_SIGNUP_TEXT.sheetTitle}
          </Text>
          <Text style={[styles.sheetText, { color: colors.muted }]}>{TEAM_SIGNUP_TEXT.sheetBody}</Text>
          {url ? (
            <View style={styles.qr} testID="team-sheet-qr">
              <QrCode value={url} size={152} color="#000000" />
            </View>
          ) : null}
          {note ? (
            <Text style={[styles.sheetText, { color: colors.danger }]} testID="team-sheet-note">
              {note}
            </Text>
          ) : null}
          <View style={styles.sheetButtons}>
            <DockButton label={TEAM_SIGNUP_TEXT.sheetShare} variant="primary" onPress={() => void share()} testID="team-sheet-share" />
            <DockButton label={TEAM_SIGNUP_TEXT.sheetClose} variant="line" onPress={onClose} testID="team-sheet-close" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Lista vennene står i: `.list` i tegningen. */
export const friendListStyle = StyleSheet.create({
  // `.list`: 12 over, 16 fra kanten, 18 i hjørnene, 4 over og under radene.
  list: { marginTop: 12, marginHorizontal: 16, borderRadius: 18, paddingVertical: 4, overflow: 'hidden' },
  // `.empty-line`: 14 over, 20 fra kanten, 15 pt i `muted`.
  emptyLine: { ...interLine(15, 21.75, { multiline: true }), fontFamily: FONTS.sans, paddingTop: 14, paddingHorizontal: 20 },
  more: { paddingHorizontal: 20, paddingTop: 4 },
});

const styles = StyleSheet.create({
  // `.sbar`: 14 over, 16 fra kanten, 8 mellom feltet og knappen.
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginHorizontal: 16 },
  // `.search`: 48 høy, 14 i hjørnene, fylt og uten kant.
  search: { flex: 1, minWidth: 0, height: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  searchInput: { flex: 1, height: 48, fontSize: 16, fontFamily: FONTS.sans, paddingVertical: 0 },
  // `.addf`: 48 høy, 14 fra kanten inni, 1,5 pt kant i `primary`.
  addFriend: { height: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 6 },
  addPlus: { fontSize: 18, fontFamily: FONTS.sansMedium },
  addText: { fontSize: 14, fontFamily: FONTS.sansSemiBold },
  // `.r`: minst 60 høy, 8/14 inni, 12 mellom skiva og navnet.
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8, paddingHorizontal: 14 },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 16, fontFamily: FONTS.sansMedium },
  rowLine: { fontSize: 13, fontFamily: FONTS.sans, marginTop: 2, fontVariant: ['tabular-nums'] },
  dim: { opacity: 0.4 },
  status: { alignItems: 'center', gap: 12, paddingTop: 20, paddingHorizontal: 20 },
  statusText: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, borderWidth: 1, borderRadius: 999, paddingHorizontal: 20, justifyContent: 'center' },
  retryText: { ...interLine(16, 19), fontFamily: FONTS.sansSemiBold },
  pressed: { opacity: 0.6 },
  firstFriend: { paddingTop: 14, paddingHorizontal: 16 },
  lineButton: { minHeight: 52, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  lineButtonText: { fontSize: 16, fontFamily: FONTS.sansSemiBold },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  // `.sheet`: 10 over, 20 fra kanten, 22 under, 22 i hjørnene, 12 mellom delene.
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 20,
    gap: 12,
    alignItems: 'center',
  },
  grabber: { width: 40, height: 5, borderRadius: 3 },
  sheetTitle: { ...fraunces(500, 22, 27.5, { multiline: true }), textAlign: 'center' },
  sheetText: { ...interLine(14, 19.6, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center', maxWidth: 260 },
  // `.qr`: 180 pt hvit flate med 14 pt luft rundt koden, 14 i hjørnene.
  qr: { width: 180, height: 180, borderRadius: 14, backgroundColor: '#FFFFFF', padding: 14 },
  sheetButtons: { alignSelf: 'stretch', gap: 12 },
});
