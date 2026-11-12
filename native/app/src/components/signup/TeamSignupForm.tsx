// native/app/src/components/signup/TeamSignupForm.tsx
// #2840: lagskjemaet i appen. Du er kapteinen og velger vennene som skal være med.
//
// Tegningen v3.1, flate 1 (bevissiden til PR-en, lys og natt), er fasiten:
//  - Lagnavnet er overskriften, med forslaget fra ruta («Martins lag»). Et trykk gjør
//    det til et felt med teller. Er navnet for kort eller for langt, står feilen
//    under, og «Ferdig» gjør ingenting. Regelen er `validateTeamName`, den samme
//    nettsiden bruker (`lib/games/teamName.ts`).
//  - Oppstillingen: du med kapteinsmerket, så de ledige plassene. Vennene du trykker
//    på, fyller plassene fra venstre, og et trykk på en venn i oppstillingen tar
//    vennen ut (`lib/teamLineup.ts`).
//  - Søket og «Legg til venn» ved siden av, alltid, også når laget er fullt, når søket
//    ikke treffer og når lista er lang (eieren: «legg til en venn må alltid være
//    mulig»). Knappen åpner arket med QR-koden og delelenka.
//  - Én liste med vennene. Venner som alt er i runden, er bleke og kan ikke velges.
//    Er laget fullt, blir resten bleke.
//  - Knappen nederst teller ned, «Velg 3 til», og blir «Meld på <lagnavn>».
//  - Bevegelsen: skiva glir fra raden opp til plassen på et kvart sekund, og telefonen
//    gir et lite dunk når den lander. Med redusert bevegelse står den der med en gang.
//
// Bare venner kan være på laget (kontrakt v3, endring 1). Vennene kommer fra
// `/api/friends`, og hvem som alt er i runden fra påmeldingsvisningen. Ruta sjekker
// begge deler på nytt, så skjemaet er ikke porten.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppRoundInviteView, AppTeamSignupForm } from '../../../../../lib/games/appRoundInviteView';
import { TEAM_NAME_MAX } from '../../../../../lib/games/registration';
import { validateTeamName } from '../../../../../lib/games/teamName';
import { pickerRows } from '../../../../../lib/league/pickerRows';
import { nameInitials } from '../../../../../lib/names/initials';
import { fetchFriends, type FriendItem } from '../../data/friends';
import { registerTeam, type TeamSignupResult } from '../../data/roundInvite';
import { landingTap } from '../../lib/haptics';
import { ROUND_START_TEXT, showAllLine } from '../../lib/leagueCopy';
import { ROUND_INVITE_TEXT } from '../../lib/roundInviteCopy';
import {
  emptySlots,
  openSlotCount,
  pickedIds,
  placeInSlots,
  removeFromSlots,
  type TeamSlots,
} from '../../lib/teamLineup';
import {
  TEAM_SIGNUP_TEXT,
  type TeamSignupFailureWithText,
  describeTeamNameError,
  describeTeamSignupFailure,
  firstName,
  friendTeamLine,
  isRetryableTeamFailure,
  nameCounter,
  noHitLine,
  pickMoreLabel,
  removeFromTeamLabel,
  submitTeamLabel,
  teamFormMeta,
} from '../../lib/teamSignupCopy';
import { describeWebLinkFailure, friendLinkPath, webUrl } from '../../lib/webLink';
import { KEYBOARD_SCROLL_PROPS, useBottomInsetUnlessKeyboard } from '../KeyboardInset';
import { PickerMore } from '../PickerSearch';
import { BlyantIcon, SokIcon } from '../icons/Icons';
import { QrCode } from '../profile/QrCode';
import { FONTS, TAP, fraunces, interLine, sheetScrim, useTheme } from '../../theme';
import { Dock, DockButton, Lineup, LineupCell, TeamDisc, teamStyles, useOwnName } from './TeamParts';

/** Glidet fra raden til plassen: et kvart sekund (tegningen). */
const GLIDE_MS = 250;
/** Måles ikke skivene innen dette, lander vennen uten glid. */
const MEASURE_TIMEOUT_MS = 100;

/** Laget som ble sendt, til «Laget er sendt til arrangøren». */
export type SentTeam = {
  teamName: string;
  rows: { userId: string; name: string; result: Extract<TeamSignupResult, { status: 'team_registered' }>['slotResults'][number] }[];
};

type FriendsState =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; friends: FriendItem[]; friendCode: string | null };

type Box = { x: number; y: number; width: number; height: number };
type Flight = { id: string; index: number; dx: number; dy: number; left: number; top: number };

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduced(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** Hvor en skive står i vinduet, eller `null` når den ikke kan måles. */
function measure(node: View | null | undefined): Promise<Box | null> {
  return new Promise((resolve) => {
    if (!node || typeof node.measureInWindow !== 'function') {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => resolve(null), MEASURE_TIMEOUT_MS);
    node.measureInWindow((x, y, width, height) => {
      clearTimeout(timer);
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  });
}

export function TeamSignupForm({
  shortId,
  view,
  form,
  onRegistered,
  onStale,
}: {
  shortId: string;
  view: Pick<AppRoundInviteView, 'round' | 'seats'>;
  form: AppTeamSignupForm;
  /** Laget er sendt. Ruta har svart `team_registered`. */
  onRegistered: (joinEffect: 'instant' | 'approval', sent: SentTeam) => void;
  /** Runden er ikke lenger slik skjemaet tror: spør på nytt (`game_full` gir `true`). */
  onStale: (afterFull: boolean) => void;
}) {
  const { colors } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();
  const reducedMotion = useReducedMotion();
  const self = useOwnName();

  const [teamName, setTeamName] = useState(form.suggestedName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(form.suggestedName);
  const [slots, setSlots] = useState<TeamSlots>(() => emptySlots(form.teamSize));
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [friends, setFriends] = useState<FriendsState>({ state: 'loading' });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TeamSignupFailureWithText | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const sending = useRef(false);
  const alive = useRef(true);
  const latestFriends = useRef(0);
  const flightToken = useRef(0);
  // Ikke en ref: verdien leses i render (interpolasjonene under).
  const [progress] = useState(() => new Animated.Value(1));
  const rootRef = useRef<View>(null);
  const slotRefs = useRef<(View | null)[]>([]);
  const rowDiscRefs = useRef(new Map<string, View | null>());

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const loadFriends = useCallback(async () => {
    const thisLoad = ++latestFriends.current;
    const result = await fetchFriends();
    if (!alive.current || thisLoad !== latestFriends.current) return;
    if (result.ok) {
      setFriends({ state: 'ready', friends: result.data.friends, friendCode: result.data.friendCode });
    } else {
      // En henting som feiler etter at lista sto, lar lista stå.
      setFriends((current) => (current.state === 'ready' ? current : { state: 'failed' }));
    }
  }, []);

  // Også ved fokus: en ny venn fra delelenka dukker opp når du kommer tilbake.
  useFocusEffect(
    useCallback(() => {
      void loadFriends();
    }, [loadFriends]),
  );

  const unavailable = useMemo(() => new Set(form.unavailableFriendIds), [form.unavailableFriendIds]);
  const friendList = useMemo(() => (friends.state === 'ready' ? friends.friends : []), [friends]);
  const friendsById = useMemo(() => new Map(friendList.map((f) => [f.id, f])), [friendList]);
  const open = openSlotCount(slots);
  const picked = useMemo(() => new Set(pickedIds(slots)), [slots]);
  const nameError = editing ? validateTeamName(draft) : null;

  const rows = useMemo(
    () =>
      pickerRows(
        friendList.map((friend) => ({ userId: friend.id, friend })),
        { query, showAll, nameOf: (row) => row.friend.name, keepIds: picked },
      ),
    [friendList, picked, query, showAll],
  );

  const land = useCallback(() => {
    setFlight(null);
    landingTap();
  }, []);

  const pick = useCallback(
    (friendId: string) => {
      const placed = placeInSlots(slots, friendId);
      if (!placed) return;
      setSlots(placed.slots);
      setError(null);
      const token = ++flightToken.current;
      if (reducedMotion) {
        landingTap();
        return;
      }
      void Promise.all([
        measure(rootRef.current),
        measure(rowDiscRefs.current.get(friendId)),
        measure(slotRefs.current[placed.index]),
      ]).then(([root, from, to]) => {
        if (!alive.current || token !== flightToken.current) return;
        if (!root || !from || !to) {
          landingTap();
          return;
        }
        progress.stopAnimation();
        progress.setValue(0);
        setFlight({
          id: friendId,
          index: placed.index,
          dx: from.x + from.width / 2 - (to.x + to.width / 2),
          dy: from.y + from.height / 2 - (to.y + to.height / 2),
          left: to.x - root.x,
          top: to.y - root.y,
        });
        Animated.timing(progress, {
          toValue: 1,
          duration: GLIDE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          if (alive.current && token === flightToken.current) land();
        });
      });
    },
    [land, progress, reducedMotion, slots],
  );

  const unpick = useCallback((friendId: string) => {
    setSlots((current) => removeFromSlots(current, friendId));
    setFlight((current) => (current?.id === friendId ? null : current));
    setError(null);
  }, []);

  const finishEditing = useCallback(() => {
    if (validateTeamName(draft) !== null) return;
    setTeamName(draft.trim());
    setEditing(false);
  }, [draft]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    void loadFriends();
  }, [loadFriends]);

  const submit = useCallback(async () => {
    if (sending.current || open > 0) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const memberIds = pickedIds(slots);
    const result = await registerTeam(shortId, teamName, memberIds);
    sending.current = false;
    if (!alive.current) return;
    setBusy(false);
    if (result.ok) {
      if (result.status !== 'team_registered') return;
      onRegistered(result.joinEffect, {
        teamName,
        rows: result.slotResults.map((slot) => ({
          userId: slot.userId,
          name: slot.name ?? friendsById.get(slot.userId)?.name ?? '',
          result: slot,
        })),
      });
      return;
    }
    switch (result.reason) {
      case 'game_full':
        // Står skjemaet også etter ny henting (tellingen feilet, eller en plass
        // ble ledig igjen), skal trykket ikke ende i ingenting.
        setError('game_full');
        onStale(true);
        return;
      case 'game_locked':
      case 'signup_closed':
      case 'not_found':
        onStale(false);
        return;
      default:
        setError(result.reason);
    }
  }, [friendsById, onRegistered, onStale, open, shortId, slots, teamName]);

  const retryable = error !== null && isRetryableTeamFailure(error);
  const selfLabel = nameInitials(self.name);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} ref={rootRef} testID="team-form">
      <ScrollView
        {...KEYBOARD_SCROLL_PROPS}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        testID="team-form-scroll"
      >
        {editing ? (
          <>
            <View style={[styles.edit, { backgroundColor: colors.surface2 }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                autoFocus
                accessibilityLabel={TEAM_SIGNUP_TEXT.nameField}
                returnKeyType="done"
                onSubmitEditing={finishEditing}
                selectionColor={colors.primary}
                style={[styles.editInput, { color: colors.text }]}
                testID="team-form-name-input"
              />
              <Text style={[styles.counter, { color: colors.muted }]} testID="team-form-name-count">
                {nameCounter(draft.trim().length, TEAM_NAME_MAX)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: nameError !== null }}
                onPress={finishEditing}
                style={[styles.done, { backgroundColor: colors.primary }]}
                testID="team-form-name-done"
              >
                <Text style={[styles.doneText, { color: colors.onPrimary }]}>{TEAM_SIGNUP_TEXT.done}</Text>
              </Pressable>
            </View>
            {nameError ? (
              <Text style={[styles.error, { color: colors.danger }]} testID="team-form-name-error">
                {describeTeamNameError(nameError)}
              </Text>
            ) : null}
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${teamName}. ${TEAM_SIGNUP_TEXT.editName}`}
            onPress={() => {
              setDraft(teamName);
              setEditing(true);
            }}
            style={styles.name}
            testID="team-form-name"
          >
            <Text style={[teamStyles.heading, styles.nameText, { color: colors.text }]} accessibilityRole="header">
              {teamName}
            </Text>
            <BlyantIcon color={colors.muted} />
          </Pressable>
        )}
        <Text
          style={[teamStyles.meta, styles.meta, editing ? styles.metaAfterEdit : null, { color: colors.muted }]}
          testID="team-form-meta"
        >
          {teamFormMeta(view)}
        </Text>

        <Lineup testID="team-form-lineup">
          {[
            <LineupCell key="self" name={TEAM_SIGNUP_TEXT.you} accessibilityLabel={TEAM_SIGNUP_TEXT.selfCaptain} testID="team-form-self">
              <TeamDisc kind="me" label={selfLabel} size="lg" captain ground={colors.bg} />
            </LineupCell>,
            ...slots.map((id, index) => {
              const friend = id ? friendsById.get(id) : undefined;
              if (!id) {
                return (
                  <LineupCell key={`slot-${index}`} name={TEAM_SIGNUP_TEXT.free} muted accessibilityLabel={TEAM_SIGNUP_TEXT.freeSlot} testID={`team-form-slot-${index}`}>
                    <TeamDisc kind="empty" label="+" size="lg" ground={colors.bg} ref={(node) => { slotRefs.current[index] = node; }} />
                  </LineupCell>
                );
              }
              const name = friend?.name ?? '';
              return (
                <LineupCell
                  key={`slot-${index}`}
                  name={firstName(name)}
                  onPress={() => unpick(id)}
                  accessibilityLabel={removeFromTeamLabel(name)}
                  testID={`team-form-slot-${index}`}
                >
                  <View style={flight?.index === index ? styles.hidden : null}>
                    <TeamDisc kind="other" label={nameInitials(name)} size="lg" ground={colors.bg} ref={(node) => { slotRefs.current[index] = node; }} />
                  </View>
                </LineupCell>
              );
            }),
          ]}
        </Lineup>

        {editing ? null : friends.state === 'ready' && friends.friends.length === 0 ? (
          <>
            <Text style={[styles.emptyLine, { color: colors.muted }]} testID="team-form-no-friends">
              {TEAM_SIGNUP_TEXT.noFriends}
            </Text>
            <View style={styles.firstFriend}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSheetOpen(true)}
                style={[styles.lineButton, { borderColor: colors.primary }]}
                testID="team-form-add-first-friend"
              >
                <Text style={[styles.lineButtonText, { color: colors.primary }]}>{`+ ${TEAM_SIGNUP_TEXT.addFirstFriend}`}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.searchBar}>
              <View style={[styles.search, { backgroundColor: colors.surface2 }]}>
                <SokIcon color={colors.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={TEAM_SIGNUP_TEXT.search}
                  placeholderTextColor={colors.muted}
                  accessibilityLabel={TEAM_SIGNUP_TEXT.search}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                  style={[styles.searchInput, { color: colors.text }]}
                  testID="team-form-search"
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={TEAM_SIGNUP_TEXT.addFriend}
                onPress={() => setSheetOpen(true)}
                style={({ pressed }) => [styles.addFriend, { borderColor: colors.primary }, pressed ? styles.pressed : null]}
                testID="team-form-add-friend"
              >
                <Text style={[styles.addPlus, { color: colors.primary }]}>+</Text>
                <Text style={[styles.addText, { color: colors.primary }]}>{TEAM_SIGNUP_TEXT.addFriend}</Text>
              </Pressable>
            </View>

            {friends.state === 'loading' ? (
              <View style={styles.status} testID="team-form-friends-loading">
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.statusText, { color: colors.muted }]}>{TEAM_SIGNUP_TEXT.friendsLoading}</Text>
              </View>
            ) : friends.state === 'failed' ? (
              <View style={styles.status}>
                <Text style={[styles.statusText, { color: colors.danger }]} testID="team-form-friends-failed">
                  {TEAM_SIGNUP_TEXT.friendsFailed}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setFriends({ state: 'loading' });
                    void loadFriends();
                  }}
                  style={[styles.retry, { borderColor: colors.primary }]}
                  testID="team-form-friends-retry"
                >
                  <Text style={[styles.retryText, { color: colors.primary }]}>{ROUND_INVITE_TEXT.retry}</Text>
                </Pressable>
              </View>
            ) : rows.total === 0 ? (
              <Text style={[styles.emptyLine, { color: colors.muted }]} testID="team-form-no-hit">
                {noHitLine(query)}
              </Text>
            ) : (
              <>
                <View style={[styles.list, { backgroundColor: colors.surface }]} testID="team-form-friends">
                  {rows.rows.map(({ friend }) => {
                    const selected = picked.has(friend.id);
                    const taken = unavailable.has(friend.id);
                    const disabled = taken || (!selected && open === 0);
                    const line = taken ? TEAM_SIGNUP_TEXT.unavailable : friendTeamLine(friend);
                    return (
                      <Pressable
                        key={friend.id}
                        accessibilityRole="button"
                        accessibilityLabel={line ? `${friend.name}, ${line}` : friend.name}
                        accessibilityState={{ selected, disabled }}
                        disabled={disabled}
                        onPress={() => (selected ? unpick(friend.id) : pick(friend.id))}
                        style={({ pressed }) => [
                          styles.row,
                          disabled ? styles.dim : null,
                          pressed ? { backgroundColor: colors.primarySoft } : null,
                        ]}
                        testID={`team-form-friend-${friend.id}`}
                      >
                        <TeamDisc
                          kind="other"
                          label={nameInitials(friend.name)}
                          size="md"
                          selected={selected}
                          ground={colors.surface}
                          ref={(node) => {
                            rowDiscRefs.current.set(friend.id, node);
                          }}
                          testID={`team-form-friend-${friend.id}-disc`}
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
                  })}
                </View>
                {rows.canExpand ? (
                  <View style={styles.more}>
                    <PickerMore
                      label={showAll ? ROUND_START_TEXT.showFewer : showAllLine(rows.total)}
                      expanded={showAll}
                      onPress={() => setShowAll((value) => !value)}
                      testID="team-form-show-all"
                    />
                  </View>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>

      <Dock bottomInset={bottomInset}>
        {error ? (
          <Text style={[styles.dockError, { color: colors.danger }]} testID="team-form-error">
            {describeTeamSignupFailure(error)}
          </Text>
        ) : null}
        {open > 0 ? (
          <DockButton label={pickMoreLabel(open)} variant="wait" testID="team-form-submit" />
        ) : (
          <DockButton
            label={busy ? TEAM_SIGNUP_TEXT.submitting : retryable ? ROUND_INVITE_TEXT.retry : submitTeamLabel(teamName)}
            variant="primary"
            busy={busy}
            onPress={() => void submit()}
            testID="team-form-submit"
          />
        )}
      </Dock>

      {flight ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.flight,
            {
              left: flight.left,
              top: flight.top,
              transform: [
                { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [flight.dx, 0] }) },
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [flight.dy, 0] }) },
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [40 / 60, 1] }) },
              ],
            },
          ]}
          testID="team-form-flight"
        >
          <TeamDisc
            kind="other"
            label={nameInitials(friendsById.get(flight.id)?.name ?? '')}
            size="lg"
            selected
            ground={colors.bg}
          />
        </Animated.View>
      ) : null}

      <AddFriendSheet
        visible={sheetOpen}
        friendCode={friends.state === 'ready' ? friends.friendCode : null}
        onClose={closeSheet}
      />
    </View>
  );
}

/**
 * «Legg til en venn» (tegningen, «Arket: legg til en venn»): QR-koden for når dere står
 * sammen, og delelenka for resten. Den som åpner lenka, blir venn med deg med en gang,
 * og lista hentes på nytt når arket lukkes og når skjermen får fokus igjen.
 */
function AddFriendSheet({
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
      console.error('[TeamSignupForm] deling feilet', err);
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

const EDIT_LINE = fraunces(500, 24, 28.8);

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 20 },
  // `.tname`: 6 over, 20 fra kanten, 8 mellom navnet og blyanten, minst 44 høy.
  name: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: TAP, paddingTop: 6, paddingHorizontal: 20 },
  nameText: { flexShrink: 1 },
  meta: { paddingTop: 2, paddingHorizontal: 20 },
  metaAfterEdit: { paddingTop: 8 },
  // `.edit`: 6 over, 16 fra kanten, 4/6/4/14 inni, 14 i hjørnene, minst 56 høy.
  edit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 56,
    marginTop: 6,
    marginHorizontal: 16,
    paddingVertical: 4,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 14,
  },
  editInput: { flex: 1, fontSize: 24, fontFamily: EDIT_LINE.fontFamily, paddingVertical: 0 },
  counter: { fontSize: 13, fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  done: { minHeight: TAP, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center' },
  doneText: { fontSize: 14, fontFamily: FONTS.sansSemiBold },
  error: { ...interLine(13, 16, { multiline: true }), fontFamily: FONTS.sans, paddingTop: 6, paddingHorizontal: 20 },
  // `.sbar`: 14 over, 16 fra kanten, 8 mellom feltet og knappen.
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginHorizontal: 16 },
  // `.search`: 48 høy, 14 i hjørnene, fylt og uten kant.
  search: { flex: 1, minWidth: 0, height: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  searchInput: { flex: 1, height: 48, fontSize: 16, fontFamily: FONTS.sans, paddingVertical: 0 },
  // `.addf`: 48 høy, 14 fra kanten inni, 1,5 pt kant i `primary`.
  addFriend: { height: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 6 },
  addPlus: { fontSize: 18, fontFamily: FONTS.sansMedium },
  addText: { fontSize: 14, fontFamily: FONTS.sansSemiBold },
  // `.list`: 12 over, 16 fra kanten, 18 i hjørnene, 4 over og under radene.
  list: { marginTop: 12, marginHorizontal: 16, borderRadius: 18, paddingVertical: 4, overflow: 'hidden' },
  // `.r`: minst 60 høy, 8/14 inni, 12 mellom skiva og navnet.
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8, paddingHorizontal: 14 },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 16, fontFamily: FONTS.sansMedium },
  rowLine: { fontSize: 13, fontFamily: FONTS.sans, marginTop: 2, fontVariant: ['tabular-nums'] },
  dim: { opacity: 0.4 },
  more: { paddingHorizontal: 20, paddingTop: 4 },
  // `.empty-line`: 14 over, 20 fra kanten, 15 pt i `muted`.
  emptyLine: { ...interLine(15, 21.75, { multiline: true }), fontFamily: FONTS.sans, paddingTop: 14, paddingHorizontal: 20 },
  firstFriend: { paddingTop: 14, paddingHorizontal: 16 },
  lineButton: { minHeight: 52, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  lineButtonText: { fontSize: 16, fontFamily: FONTS.sansSemiBold },
  status: { alignItems: 'center', gap: 12, paddingTop: 20, paddingHorizontal: 20 },
  statusText: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, borderWidth: 1, borderRadius: 999, paddingHorizontal: 20, justifyContent: 'center' },
  retryText: { ...interLine(16, 19), fontFamily: FONTS.sansSemiBold },
  dockError: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  hidden: { opacity: 0 },
  flight: { position: 'absolute', width: 60, height: 60 },
  pressed: { opacity: 0.6 },
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
