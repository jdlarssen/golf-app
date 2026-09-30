// native/app/src/screens/Friends.tsx
// #2256: «Venner» i appen, etter designet (Venner-forslag): heltekortet «Få
// med gjengen» med delelenka og e-postfeltet, forespørslene til deg, folk du
// har spilt med som kort i en rad, vennene dine (sist spilt først) og til
// slutt det du har sendt og venter svar på.
//
// Alt går gjennom `/api/friends/*` (`data/friends.ts`), som kjører den samme
// kjernen som webben. Etter hver handling hentes lista på nytt, så skjermen
// viser det som faktisk står i basen og ikke det den trodde den gjorde.
//
// **Tallene i underlinjene** (runder sammen, sist spilt, handicap) kommer fra
// ruta. Mangler de (`stats: null`), står radene med navnet alene.
//
// **Uten nett** står en linje om at venner krever tilkobling, med «Prøv
// igjen». Handlingene legges aldri i en kø.
//
// **En venn åpner et lite ark** med tallene og «Fjern venn». «Fjern venn»
// spør først med en dialog; en egen venneside kommer senere i en egen sak.
//
// **Delingen** åpner telefonens delearke med lenka (`Share.share`, ingen ny
// modul). Adressen bygges med `webUrl`, så butikkbygget deler tornygolf.no.
//
// Toppen er designets: «PROFIL» i navigatorens header (`kickerHeader`), og
// «Venner» stort med undertittelen øverst i innholdet (`PageTitle`).
//
// **Profil v2: identisk med designlerretet.** Seksjonsetikettene er
// kicker-stilen (10 pt, sperret), med 18 pt over og 8 under. Kremen i
// heltekortet er den varme (`onStrongWarm`), den stiplede ringen er tegnet
// (iOS stipler en `border` grovere enn nettleseren), og tallene i
// underlinjene har vanlige, ikke faste, sifferbredder.
import { Children, Fragment, useCallback, useEffect, useState, type ReactNode } from 'react';
import Svg, { Circle } from 'react-native-svg';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { FriendStatus } from '../../../../lib/friends/friendStatus';
import { nameInitials } from '../../../../lib/names/initials';
import {
  addFriendByEmail,
  fetchFriends,
  inviteFriend,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
  type FriendActionResult,
  type FriendItem,
  type FriendsData,
} from '../data/friends';
import type { WebApiFailure } from '../data/webApi';
import {
  FRIENDS_TEXT,
  friendRowA11yLabel,
  friendSheetValues,
  friendStatusLine,
  friendSubline,
  friendsFailureLine,
  friendsSectionTitle,
  friendsSubtitle,
  incomingSubline,
  inviteButton,
  inviteFailureLine,
  invitePrompt,
  invitedLine,
  personActionA11yLabel,
  removeConfirmMessage,
  roundsSubline,
  type StatusLine,
} from '../lib/friendsCopy';
import { describeWebLinkFailure, webUrl } from '../lib/webLink';
import { PageTitle } from '../components/PageTitle';
import type { ScreenProps } from '../navigation';
import { FONTS, TAP, useTheme } from '../theme';

type LoadState =
  | { state: 'loading' }
  | { state: 'ready'; data: FriendsData }
  | { state: 'failed'; reason: WebApiFailure | 'load_failed' };

function toLoadState(result: Awaited<ReturnType<typeof fetchFriends>>): LoadState {
  return result.ok ? { state: 'ready', data: result.data } : { state: 'failed', reason: result.reason };
}

export function Friends({ route }: ScreenProps<'Friends'>) {
  const { ui, colors } = useTheme();
  const selfInitials = route.params?.selfInitials ?? null;
  const [load, setLoad] = useState<LoadState>({ state: 'loading' });
  const [line, setLine] = useState<StatusLine | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  // Nøkkelen til handlingen som er i gang. Alle knappene står stille til den
  // er ferdig, så et dobbelt trykk aldri sender to forespørsler.
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [sheetFriend, setSheetFriend] = useState<FriendItem | null>(null);

  // Første henting bor i effekten, med avbrudd hvis skjermen lukkes først.
  // Etter en handling og ved «Prøv igjen» hentes lista med `reload`.
  useEffect(() => {
    let cancelled = false;
    void fetchFriends().then((result) => {
      if (!cancelled) setLoad(toLoadState(result));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Feiler hentingen etter en handling, står lista og svarlinja som de var:
  // handlingen gikk gjennom, bare oppfriskingen uteble. Feilvisningen er for
  // når det ikke finnes noen liste å vise.
  const reload = useCallback(async () => {
    const next = toLoadState(await fetchFriends());
    setLoad((prev) => (next.state === 'failed' && prev.state === 'ready' ? prev : next));
  }, []);

  /** Kjør én handling, vis svarlinja og hent lista på nytt. */
  const run = useCallback(
    async (
      key: string,
      action: () => Promise<FriendActionResult<FriendStatus>>,
      onStatus?: (status: FriendStatus) => boolean,
    ) => {
      setBusy(key);
      setLine(null);
      setShareNote(null);
      const result = await action();
      setBusy(null);
      if (!result.ok) {
        setLine({ text: friendsFailureLine(result.reason), tone: 'error' });
        return;
      }
      // `onStatus` kan ta over svaret (e-post som ikke er på Tørny gir et
      // tilbud om invitasjon i stedet for en linje).
      if (!onStatus?.(result.status)) setLine(friendStatusLine(result.status));
      await reload();
    },
    [reload],
  );

  const onAddByEmail = useCallback(() => {
    // Retur-tasten på tastaturet er ikke en knapp og låses ikke av `disabled`.
    if (busy !== null) return;
    const address = email.trim().toLowerCase();
    setInviteEmail(null);
    void run('email', () => addFriendByEmail(address), (status) => {
      if (status === 'not_found') {
        setInviteEmail(address);
        return true;
      }
      if (status === 'requested' || status === 'accepted') setEmail('');
      return false;
    });
  }, [busy, email, run]);

  const onInvite = useCallback(async () => {
    if (!inviteEmail) return;
    setBusy('invite');
    setLine(null);
    const result = await inviteFriend(inviteEmail);
    setBusy(null);
    if (!result.ok) {
      setLine({ text: friendsFailureLine(result.reason), tone: 'error' });
    } else if (result.status === 'invited') {
      setLine({ text: invitedLine(inviteEmail), tone: 'ok' });
      setInviteEmail(null);
      setEmail('');
    } else {
      setLine({ text: inviteFailureLine(result.status), tone: 'error' });
    }
  }, [inviteEmail]);

  const onRemove = useCallback(
    (friend: FriendItem) => {
      // To knapper, og dialogen kan ikke avvises: svaret skal komme fra en av dem.
      // Arket står til svaret kommer, så «Avbryt» fører tilbake dit.
      Alert.alert(
        FRIENDS_TEXT.removeConfirmLabel,
        removeConfirmMessage(friend.name),
        [
          { text: FRIENDS_TEXT.cancelLabel, style: 'cancel' },
          {
            text: FRIENDS_TEXT.removeConfirmLabel,
            style: 'destructive',
            onPress: () => {
              setSheetFriend(null);
              void run(`remove:${friend.id}`, () => removeFriend(friend.id));
            },
          },
        ],
        { cancelable: false },
      );
    },
    [run],
  );

  const onShare = useCallback(async (code: string) => {
    setShareNote(null);
    const target = webUrl(`/venner/legg-til/${code}`);
    if (!target.ok) {
      setShareNote(describeWebLinkFailure(target.reason));
      return;
    }
    try {
      await Share.share({ message: target.url });
    } catch (err: unknown) {
      console.error('[Friends] deling feilet', err);
    }
  }, []);

  if (load.state === 'loading') {
    return (
      <View style={ui.centered} testID="friends-loading">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (load.state === 'failed') {
    return (
      <ScrollView contentContainerStyle={ui.scroll} testID="friends-screen">
        <Text style={ui.body} testID="friends-load-error">
          {load.reason === 'offline' ? FRIENDS_TEXT.offline : FRIENDS_TEXT.loadFailed}
        </Text>
        <Pressable
          accessibilityRole="button"
          style={ui.buttonSecondary}
          onPress={() => {
            setLoad({ state: 'loading' });
            void reload();
          }}
          testID="friends-retry"
        >
          <Text style={ui.buttonSecondaryText}>{FRIENDS_TEXT.retry}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const { friends, incoming, outgoing, suggestions, friendCode } = load.data;
  const locked = busy !== null;
  const now = new Date();
  // Serveren setter vennene etter siste runde når den har tallene.
  const sortedByLastPlayed = friends.length > 1 && friends.some((f) => f.stats?.lastPlayedAt);

  return (
    <>
      <ScrollView
        contentContainerStyle={[ui.scroll, styles.scroll]}
        keyboardShouldPersistTaps="handled"
        testID="friends-screen"
      >
        <PageTitle
          title={FRIENDS_TEXT.heading}
          subtitle={friendsSubtitle(friends.length)}
          subtitleTestID="friends-subtitle"
        />

        {line ? (
          line.tone === 'error' ? (
            <Text style={[ui.error, styles.inset]} testID="friends-status">
              {line.text}
            </Text>
          ) : (
            <View style={ui.banner}>
              <Text style={ui.body} testID="friends-status">
                {line.text}
              </Text>
            </View>
          )
        ) : null}

        <View style={[styles.hero, { backgroundColor: colors.surfaceStrong }]} testID="friends-hero">
          <View style={styles.heroTop}>
            {/* Pynt: deg og en ledig plass. Skjermleseren leser tittelen. */}
            <View
              style={styles.heroAvatars}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {selfInitials ? (
                // Kremen er 30 pt; ringen i kortets farge ligger utenfor den,
                // som designets `box-shadow`, og synes ikke.
                <View
                  style={[
                    styles.heroSelf,
                    { backgroundColor: colors.onStrongWarm, borderColor: colors.surfaceStrong },
                  ]}
                >
                  <Text style={[styles.heroAvatarText, { color: colors.surfaceStrong }]}>
                    {selfInitials}
                  </Text>
                </View>
              ) : null}
              <View style={[styles.heroPlus, selfInitials ? styles.heroPlusOverlap : null]}>
                <Svg width={HERO_AVATAR} height={HERO_AVATAR} style={StyleSheet.absoluteFill}>
                  <Circle
                    cx={HERO_AVATAR / 2}
                    cy={HERO_AVATAR / 2}
                    r={(HERO_AVATAR - 1.5) / 2}
                    fill={colors.surfaceStrong}
                    stroke={colors.onStrongWarm}
                    strokeOpacity={0.7}
                    strokeWidth={1.5}
                    strokeDasharray={HERO_DASH}
                  />
                </Svg>
                <Text style={[styles.heroPlusText, { color: colors.onStrongWarm }]}>+</Text>
              </View>
            </View>
            <View style={styles.flexText}>
              <Text accessibilityRole="header" style={[styles.heroTitle, { color: colors.onStrongWarm }]}>
                {FRIENDS_TEXT.heroTitle}
              </Text>
              <Text style={[styles.heroLine, { color: colors.onStrongWarm }]}>
                {friendCode ? FRIENDS_TEXT.shareLinkSubtitle : FRIENDS_TEXT.addByEmailSubtitle}
              </Text>
            </View>
          </View>
          <View style={styles.heroButtons}>
            {friendCode ? (
              <Pill
                tone="onStrongFilled"
                size="large"
                grow
                label={FRIENDS_TEXT.heroShareButton}
                onPress={() => void onShare(friendCode)}
                testID="friends-share-link"
              />
            ) : null}
            <Pill
              tone="onStrongOutline"
              size="large"
              smallText
              grow={!friendCode}
              label={FRIENDS_TEXT.heroEmailButton}
              expanded={emailOpen}
              onPress={() => setEmailOpen((open) => !open)}
              testID="friends-email-toggle"
            />
          </View>
          {shareNote ? (
            <Text style={[styles.heroLine, { color: colors.onStrongWarm }]} testID="friends-share-error">
              {shareNote}
            </Text>
          ) : null}
        </View>

        {emailOpen ? (
          <View style={[ui.card, styles.cardRound]} testID="friends-add-by-email">
            <Text style={ui.muted}>{FRIENDS_TEXT.addByEmailSubtitle}</Text>
            <Text style={ui.label}>{FRIENDS_TEXT.addEmailLabel}</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={FRIENDS_TEXT.addEmailPlaceholder}
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={onAddByEmail}
              accessibilityLabel={FRIENDS_TEXT.addEmailLabel}
              style={ui.input}
              testID="friends-email-input"
            />
            <Pill
              label={FRIENDS_TEXT.addEmailButton}
              pendingLabel={FRIENDS_TEXT.addEmailPending}
              pending={busy === 'email'}
              disabled={locked}
              onPress={onAddByEmail}
              testID="friends-email-submit"
            />
          </View>
        ) : null}

        {inviteEmail ? (
          <View style={[ui.card, styles.cardRound]} testID="friends-invite-offer">
            <Text style={ui.body}>{invitePrompt(inviteEmail)}</Text>
            <Pill
              label={inviteButton(inviteEmail)}
              pendingLabel={FRIENDS_TEXT.invitePending}
              pending={busy === 'invite'}
              disabled={locked}
              onPress={() => void onInvite()}
              testID="friends-invite"
            />
          </View>
        ) : null}

        {incoming.length > 0 ? (
          <View style={styles.section} testID="friends-incoming">
            <Text style={[ui.kicker, styles.label, { color: colors.accentText }]}>
              {FRIENDS_TEXT.incomingSection}
            </Text>
            {incoming.map((r) => (
              <View
                key={r.requestId}
                style={[styles.requestCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Avatar name={r.name} tone="soft" />
                <NameBlock name={r.name} sub={incomingSubline(r.stats)} />
                <Pill
                  label={FRIENDS_TEXT.acceptLabel}
                  pendingLabel={FRIENDS_TEXT.acceptPending}
                  pending={busy === `accept:${r.requestId}`}
                  disabled={locked}
                  onPress={() =>
                    void run(`accept:${r.requestId}`, () => respondToFriendRequest(r.requestId, true))
                  }
                  accessibilityLabel={personActionA11yLabel(FRIENDS_TEXT.acceptLabel, r.name)}
                  testID={`friends-accept-${r.id}`}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={personActionA11yLabel(FRIENDS_TEXT.declineLabel, r.name)}
                  accessibilityState={{ disabled: locked, busy: busy === `decline:${r.requestId}` }}
                  disabled={locked}
                  onPress={() =>
                    void run(`decline:${r.requestId}`, () => respondToFriendRequest(r.requestId, false))
                  }
                  // Designet: 39 × 44, en stående pille; trykkflaten er 44 × 44.
                  hitSlop={DECLINE_HIT_SLOP}
                  style={[
                    styles.roundButton,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    locked && busy !== `decline:${r.requestId}` ? styles.dimmed : null,
                  ]}
                  testID={`friends-decline-${r.id}`}
                >
                  {busy === `decline:${r.requestId}` ? (
                    <ActivityIndicator color={colors.muted} />
                  ) : (
                    <Text style={[styles.roundButtonText, { color: colors.muted }]}>✕</Text>
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {suggestions.length > 0 ? (
          <View style={styles.section} testID="friends-suggestions">
            <Text style={[ui.kicker, styles.label]}>{FRIENDS_TEXT.suggestionsSection}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.suggestionRow}
            >
              {suggestions.map((s) => {
                const sub = roundsSubline(s.stats);
                return (
                  <View
                    key={s.id}
                    style={[styles.suggestionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Avatar name={s.name} tone="warm" />
                    <View>
                      <Text style={[styles.suggestionName, { color: colors.text }]} numberOfLines={1}>
                        {s.name || FRIENDS_TEXT.someoneFallback}
                      </Text>
                      {sub ? (
                        <Text style={[styles.sub, { color: colors.muted }]} numberOfLines={1}>
                          {sub}
                        </Text>
                      ) : null}
                    </View>
                    <Pill
                      tone="outline"
                      label={`+ ${FRIENDS_TEXT.addEmailButton}`}
                      pendingLabel={FRIENDS_TEXT.addEmailPending}
                      pending={busy === `add:${s.id}`}
                      disabled={locked}
                      onPress={() => void run(`add:${s.id}`, () => sendFriendRequest(s.id))}
                      accessibilityLabel={personActionA11yLabel(FRIENDS_TEXT.addEmailButton, s.name)}
                      testID={`friends-add-${s.id}`}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.section} testID="friends-list">
          <View style={[styles.sectionHead, styles.label]}>
            <Text style={ui.kicker}>{friendsSectionTitle(friends.length)}</Text>
            {sortedByLastPlayed ? (
              <Text style={[styles.sortNote, { color: colors.muted }]}>
                {FRIENDS_TEXT.sortedByLastPlayed}
              </Text>
            ) : null}
          </View>
          {friends.length === 0 ? (
            <Text style={[ui.muted, styles.inset]} testID="friends-empty">
              {FRIENDS_TEXT.noFriendsYet}
            </Text>
          ) : (
            <RowsCard>
              {friends.map((f) => {
                const sub = friendSubline(f, now);
                return (
                  <Pressable
                    key={f.id}
                    accessibilityRole="button"
                    accessibilityLabel={friendRowA11yLabel(f.name, sub)}
                    disabled={locked}
                    onPress={() => setSheetFriend(f)}
                    style={({ pressed }) => [styles.personRow, pressed ? styles.pressed : null]}
                    testID={`friends-open-${f.id}`}
                  >
                    <Avatar name={f.name} tone="strong" />
                    <NameBlock name={f.name} sub={sub} />
                    {busy === `remove:${f.id}` ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text style={[styles.arrow, { color: colors.primary }]}>→</Text>
                    )}
                  </Pressable>
                );
              })}
            </RowsCard>
          )}
        </View>

        {outgoing.length > 0 ? (
          <View style={styles.section} testID="friends-outgoing">
            <Text style={[ui.kicker, styles.label]}>{FRIENDS_TEXT.outgoingSection}</Text>
            <RowsCard>
              {outgoing.map((r) => (
                <View key={r.requestId} style={styles.personRow}>
                  <Avatar name={r.name} tone="soft" />
                  <NameBlock name={r.name} sub={roundsSubline(r.stats)} />
                  <Pill
                    tone="outline"
                    label={FRIENDS_TEXT.withdrawLabel}
                    pendingLabel={FRIENDS_TEXT.withdrawPending}
                    pending={busy === `withdraw:${r.id}`}
                    disabled={locked}
                    onPress={() => void run(`withdraw:${r.id}`, () => removeFriend(r.id))}
                    accessibilityLabel={personActionA11yLabel(FRIENDS_TEXT.withdrawLabel, r.name)}
                    testID={`friends-withdraw-${r.id}`}
                  />
                </View>
              ))}
            </RowsCard>
          </View>
        ) : null}
      </ScrollView>

      <FriendSheet
        friend={sheetFriend}
        now={now}
        onClose={() => setSheetFriend(null)}
        onRemove={onRemove}
      />
    </>
  );
}

/**
 * Arket fra en venn: navnet, de tre tallene og «Fjern venn». Dras ned eller
 * lukkes med «Lukk» og med et trykk utenfor.
 */
function FriendSheet({
  friend,
  now,
  onClose,
  onRemove,
}: {
  friend: FriendItem | null;
  now: Date;
  onClose: () => void;
  onRemove: (friend: FriendItem) => void;
}) {
  const { ui, colors } = useTheme();
  const values = friend ? friendSheetValues(friend, now) : null;
  return (
    <Modal visible={friend !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={FRIENDS_TEXT.sheetClose}
          testID="friend-sheet-backdrop"
        />
        {friend && values ? (
          <View
            style={[styles.sheet, { backgroundColor: colors.bg, borderColor: colors.border }]}
            accessibilityViewIsModal
            testID="friend-sheet"
          >
            <View style={styles.sheetHead}>
              <Avatar name={friend.name} tone="strong" />
              <Text
                accessibilityRole="header"
                style={[styles.sheetName, { color: colors.text }]}
                numberOfLines={2}
              >
                {friend.name || FRIENDS_TEXT.someoneFallback}
              </Text>
            </View>
            <RowsCard>
              <SheetRow label={FRIENDS_TEXT.sheetHcp} value={values.hcp} testID="friend-sheet-hcp" />
              <SheetRow label={FRIENDS_TEXT.sheetRounds} value={values.rounds} testID="friend-sheet-rounds" />
              <SheetRow
                label={FRIENDS_TEXT.sheetLastPlayed}
                value={values.lastPlayed}
                testID="friend-sheet-last"
              />
            </RowsCard>
            <Pill
              tone="danger"
              size="large"
              label={FRIENDS_TEXT.removeConfirmLabel}
              onPress={() => onRemove(friend)}
              testID={`friends-remove-${friend.id}`}
            />
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={ui.buttonSecondary}
              testID="friend-sheet-close"
            >
              <Text style={ui.buttonSecondaryText}>{FRIENDS_TEXT.sheetClose}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function SheetRow({ label, value, testID }: { label: string; value: string; testID: string }) {
  const { ui, colors } = useTheme();
  return (
    <View style={styles.sheetRow} accessible accessibilityLabel={`${label}: ${value}`} testID={testID}>
      <Text style={[styles.sheetLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.sheetValue, ui.num, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** Radene i et kort, med streker mellom dem, ikke under den siste (som webben). */
function RowsCard({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.rowsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {Children.toArray(children).map((row, index) => (
        <Fragment key={index}>
          {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.divider }]} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

/** Navnet og underlinja, med plass til knappene til høyre. */
function NameBlock({ name, sub }: { name: string; sub: string | null }) {
  const { colors } = useTheme();
  return (
    <View style={styles.flexText}>
      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
        {name || FRIENDS_TEXT.someoneFallback}
      </Text>
      {sub ? (
        // To linjer, som designet: «Spilte med deg i …» bryter heller enn å kuttes.
        // Vanlige sifferbredder, som i designet.
        <Text style={[styles.sub, { color: colors.muted }]} numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Initialene i en sirkel. Skogen for venner, den lyse grønne for forespørsler
 * og kremtonen (`trackBg`) for forslag, som i designet. Pynt: navnet står ved
 * siden av.
 */
function Avatar({ name, tone }: { name: string; tone: 'strong' | 'soft' | 'warm' }) {
  const { colors } = useTheme();
  const look =
    tone === 'strong'
      ? { bg: colors.surfaceStrong, ink: colors.onStrong }
      : tone === 'soft'
        ? { bg: colors.primarySoft, ink: colors.primary }
        : { bg: colors.trackBg, ink: colors.muted };
  return (
    <View
      style={[styles.avatar, { backgroundColor: look.bg }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.avatarText, { color: look.ink }]}>{nameInitials(name)}</Text>
    </View>
  );
}

type PillTone = 'filled' | 'outline' | 'danger' | 'onStrongFilled' | 'onStrongOutline';

/** Knappene på siden: piller som i designet, ≥ 44 pt høye. */
function Pill({
  label,
  pendingLabel,
  pending = false,
  disabled = false,
  tone = 'filled',
  size = 'regular',
  smallText = false,
  grow = false,
  expanded,
  accessibilityLabel,
  onPress,
  testID,
}: {
  label: string;
  pendingLabel?: string;
  pending?: boolean;
  disabled?: boolean;
  tone?: PillTone;
  size?: 'regular' | 'large';
  /** Høyden fra `size`, men 13 pt tekst («På e-post» i heltekortet). */
  smallText?: boolean;
  grow?: boolean;
  expanded?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const look = {
    filled: { bg: colors.primary, border: colors.primary, ink: colors.onPrimary },
    outline: { bg: 'transparent', border: colors.primary, ink: colors.primary },
    danger: { bg: 'transparent', border: colors.danger, ink: colors.danger },
    onStrongFilled: { bg: colors.onStrongWarm, border: colors.onStrongWarm, ink: colors.surfaceStrong },
    onStrongOutline: { bg: 'transparent', border: `${colors.onStrongWarm}80`, ink: colors.onStrongWarm },
  }[tone];
  // Fylte piller har ingen kant i designet, så de blir ikke 2 pt bredere.
  const filled = tone === 'filled' || tone === 'onStrongFilled';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, busy: pending, ...(expanded === undefined ? {} : { expanded }) }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.pill,
        size === 'large' ? styles.pillLarge : null,
        grow ? styles.pillGrow : null,
        { backgroundColor: look.bg, borderColor: look.border },
        filled ? styles.pillFilled : null,
        disabled && !pending ? styles.dimmed : null,
      ]}
      testID={testID}
    >
      <Text
        style={[
          styles.pillText,
          size === 'large' && !smallText ? styles.pillTextLarge : null,
          { color: look.ink },
        ]}
        numberOfLines={1}
      >
        {pending && pendingLabel ? pendingLabel : label}
      </Text>
    </Pressable>
  );
}

const AVATAR = 36;
const HERO_AVATAR = 30;
/** Ringen rundt deg i heltekortet, utenfor kremen (designets `box-shadow`). */
const HERO_RING = 2;
/** Stiplene i «+»-ringen: 14 rundt, som nettleserens 1,5 pt `dashed`. */
const HERO_DASH = `${(Math.PI * (HERO_AVATAR - 1.5)) / 28} ${(Math.PI * (HERO_AVATAR - 1.5)) / 28}`;
const DECLINE_WIDTH = 39;
const DECLINE_HIT_SLOP = { left: (TAP - DECLINE_WIDTH) / 2, right: (TAP - DECLINE_WIDTH) / 2 };

const styles = StyleSheet.create({
  // Designet: tittelen 6 pt under toppen.
  scroll: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 32 },
  inset: { paddingHorizontal: 4 },
  // Seksjonsetiketten: 18 pt over (10 + gapet på 8), 8 under (seksjonens gap).
  label: { paddingHorizontal: 4, marginTop: 10 },
  section: { gap: 8 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  sortNote: { fontSize: 12, fontFamily: FONTS.sans },
  cardRound: { borderRadius: 16 },
  flexText: { flex: 1, minWidth: 0 },

  hero: { borderRadius: 18, padding: 16, gap: 12, marginTop: 6 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroAvatars: { flexDirection: 'row' },
  // Ringen ligger utenfor de 30 pt, så boksen tar ikke mer plass enn kremen.
  heroSelf: {
    width: HERO_AVATAR + HERO_RING * 2,
    height: HERO_AVATAR + HERO_RING * 2,
    borderRadius: HERO_AVATAR / 2 + HERO_RING,
    borderWidth: HERO_RING,
    margin: -HERO_RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarText: { fontSize: 10, fontFamily: FONTS.sansSemiBold },
  heroPlus: {
    width: HERO_AVATAR,
    height: HERO_AVATAR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlusOverlap: { marginLeft: -6 },
  heroPlusText: { fontSize: 16, fontFamily: FONTS.sans },
  // Linjehøydene er nettleserens «normal» for størrelsene i designet.
  heroTitle: { fontSize: 18, lineHeight: 22, fontFamily: FONTS.serifDisplay },
  heroLine: { fontSize: 12, lineHeight: 14.5, fontFamily: FONTS.sans, opacity: 0.85 },
  heroButtons: { flexDirection: 'row', gap: 8 },

  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  roundButton: {
    width: DECLINE_WIDTH,
    height: TAP,
    borderRadius: TAP / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonText: { fontSize: 16, fontFamily: FONTS.sans },

  suggestionRow: { gap: 10, paddingHorizontal: 0 },
  // Designet: 150 pt innhold + 2 × 12 luft + 2 × 1 kant.
  suggestionCard: {
    width: 176,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  suggestionName: { fontSize: 14, fontFamily: FONTS.sansSemiBold },

  rowsCard: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  pressed: { opacity: 0.6 },
  separator: { height: 1 },
  name: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  sub: { fontSize: 12, lineHeight: 14.5, fontFamily: FONTS.sans },
  arrow: { fontSize: 16, fontFamily: FONTS.sans },

  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 12, fontFamily: FONTS.sansSemiBold },

  pill: {
    minHeight: TAP,
    minWidth: TAP,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pillLarge: { minHeight: 48 },
  pillGrow: { flexGrow: 1 },
  pillFilled: { borderWidth: 0 },
  pillText: { fontSize: 13, fontFamily: FONTS.sansSemiBold },
  pillTextLarge: { fontSize: 15 },
  dimmed: { opacity: 0.5 },

  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 20,
    paddingBottom: 36,
    gap: 14,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetName: { flex: 1, fontSize: 22, fontFamily: FONTS.serifDisplay },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: TAP,
    paddingHorizontal: 14,
  },
  sheetLabel: { fontSize: 14, fontFamily: FONTS.sans },
  sheetValue: { flexShrink: 1, fontSize: 15, fontFamily: FONTS.sansSemiBold, textAlign: 'right' },
});
