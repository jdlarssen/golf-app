// native/app/src/screens/TeamSlotPicker.tsx
// #2840 del 3: «Velg en venn» og «Bytt med en venn» fra lagsiden. Tegningen v3.1,
// «Ledig plass og velgeren»: «Hvem skal med?», den samme lista og det samme søket som
// lagskjemaet, med «Legg til venn» alltid synlig (kontrakt v3, endring 6). Du velger én
// venn; vennen får ring og hake, og knappen nederst sier «Legg Ingrid til på laget».
// Venner som alt er på laget eller i runden, står bleke med grunnen.
//
// «Bytt» sender raden som byttes ut (`replaceRequestId`): serveren skriver den nye og
// sletter den gamle. Ruta sjekker at vennen er din og at laget har plass, så lista er
// ikke porten. Etterpå går skjermen tilbake til lagsiden (`backTo`), som spør på nytt.
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { pickerRows } from '../../../../lib/league/pickerRows';
import { useBottomInsetUnlessKeyboard, KEYBOARD_SCROLL_PROPS } from '../components/KeyboardInset';
import { PickerMore } from '../components/PickerSearch';
import {
  AddFriendSheet,
  FriendRow,
  FriendSearchBar,
  FriendsStatus,
  NoFriends,
  friendListStyle,
  useFriends,
} from '../components/signup/FriendPicker';
import { Dock, DockButton, teamStyles } from '../components/signup/TeamParts';
import { addTeammate, type TeamPageActionFailure } from '../data/teamPage';
import { backTo } from '../lib/backTo';
import { ROUND_START_TEXT, showAllLine } from '../lib/leagueCopy';
import { ROUND_INVITE_TEXT } from '../lib/roundInviteCopy';
import {
  TEAM_PAGE_TEXT,
  addFriendLabel,
  describeTeamPageFailure,
  isRetryableTeamPageFailure,
  pickerMeta,
} from '../lib/teamPageCopy';
import { TEAM_SIGNUP_TEXT, friendTeamLine, noHitLine } from '../lib/teamSignupCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, interLine, useTheme } from '../theme';

export function TeamSlotPicker({ navigation, route }: ScreenProps<'TeamSlotPicker'>) {
  const { shortId, teamName, open, replaceRequestId, teamUserIds, unavailableFriendIds } = route.params;
  const { colors } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();
  const { friends, reload, retry: retryFriends } = useFriends();
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TeamPageActionFailure | null>(null);
  const sending = useRef(false);

  const onTeam = useMemo(() => new Set(teamUserIds), [teamUserIds]);
  const taken = useMemo(() => new Set(unavailableFriendIds), [unavailableFriendIds]);
  const friendList = useMemo(() => (friends.state === 'ready' ? friends.friends : []), [friends]);
  const keepIds = useMemo(() => new Set(selected ? [selected] : []), [selected]);
  const rows = useMemo(
    () =>
      pickerRows(
        friendList.map((friend) => ({ userId: friend.id, friend })),
        { query, showAll, nameOf: (row) => row.friend.name, keepIds },
      ),
    [friendList, keepIds, query, showAll],
  );
  const chosen = selected ? friendList.find((f) => f.id === selected) ?? null : null;

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    reload();
  }, [reload]);

  const submit = async () => {
    if (!chosen || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const result = await addTeammate(shortId, chosen.id, replaceRequestId);
    sending.current = false;
    setBusy(false);
    if (result.ok) {
      // Har du gått tilbake mens svaret var på vei, står du alt på lagsiden.
      if (navigation.isFocused()) backTo(navigation, 'TeamPage', { shortId });
      return;
    }
    setError(result.reason);
  };

  const retry = error !== null && isRetryableTeamPageFailure(error);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} testID="team-slot">
      <ScrollView
        {...KEYBOARD_SCROLL_PROPS}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        testID="team-slot-scroll"
      >
        <View style={styles.head}>
          <Text style={[teamStyles.heading, { color: colors.text }]} accessibilityRole="header" testID="team-slot-title">
            {TEAM_PAGE_TEXT.pickerTitle}
          </Text>
          <Text style={[teamStyles.meta, { color: colors.muted }]} testID="team-slot-meta">
            {pickerMeta(teamName, open)}
          </Text>
        </View>

        {friends.state === 'ready' && friends.friends.length === 0 ? (
          <NoFriends onAddFriend={() => setSheetOpen(true)} idPrefix="team-slot" />
        ) : (
          <>
            <FriendSearchBar query={query} onQuery={setQuery} onAddFriend={() => setSheetOpen(true)} idPrefix="team-slot" />
            {friends.state !== 'ready' ? (
              <FriendsStatus friends={friends} onRetry={retryFriends} idPrefix="team-slot" />
            ) : rows.total === 0 ? (
              <Text style={[friendListStyle.emptyLine, { color: colors.muted }]} testID="team-slot-no-hit">
                {noHitLine(query)}
              </Text>
            ) : (
              <>
                <View style={[friendListStyle.list, { backgroundColor: colors.surface }]} testID="team-slot-friends">
                  {rows.rows.map(({ friend }) => {
                    const isSelected = friend.id === selected;
                    const reason = onTeam.has(friend.id)
                      ? TEAM_PAGE_TEXT.onTeam
                      : taken.has(friend.id)
                        ? TEAM_SIGNUP_TEXT.unavailable
                        : null;
                    return (
                      <FriendRow
                        key={friend.id}
                        friend={friend}
                        line={reason ?? friendTeamLine(friend)}
                        selected={isSelected}
                        disabled={reason !== null}
                        onPress={() => {
                          setError(null);
                          setSelected(isSelected ? null : friend.id);
                        }}
                        idPrefix="team-slot"
                      />
                    );
                  })}
                </View>
                {rows.canExpand ? (
                  <View style={friendListStyle.more}>
                    <PickerMore
                      label={showAll ? ROUND_START_TEXT.showFewer : showAllLine(rows.total)}
                      expanded={showAll}
                      onPress={() => setShowAll((value) => !value)}
                      testID="team-slot-show-all"
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
          <Text style={[styles.dockError, { color: colors.danger }]} testID="team-slot-error">
            {describeTeamPageFailure(error)}
          </Text>
        ) : null}
        {chosen ? (
          <DockButton
            label={busy ? TEAM_PAGE_TEXT.adding : retry ? ROUND_INVITE_TEXT.retry : addFriendLabel(chosen.name)}
            variant="primary"
            busy={busy}
            onPress={() => void submit()}
            testID="team-slot-submit"
          />
        ) : (
          <DockButton label={TEAM_PAGE_TEXT.pickFriend} variant="wait" testID="team-slot-submit" />
        )}
      </Dock>

      <AddFriendSheet
        visible={sheetOpen}
        friendCode={friends.state === 'ready' ? friends.friendCode : null}
        onClose={closeSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 20 },
  // `.head`: 6 over, 20 fra kanten, 4 mellom tittelen og linja.
  head: { paddingTop: 6, paddingHorizontal: 20, gap: 4 },
  dockError: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
});
