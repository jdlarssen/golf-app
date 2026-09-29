// native/app/src/screens/Friends.tsx
// #2256: «Venner» i appen — det webbens `/profile/venner` viser, i samme
// rekkefølge: svarlinja etter en handling, tilbudet om å invitere en ukjent
// adresse, forespørslene, vennene, de sendte, forslagene fra folk du har
// spilt med, «Legg til på e-post» og «Del en lenke».
//
// Alt går gjennom `/api/friends/*` (`data/friends.ts`), som kjører den samme
// kjernen som webben. Etter hver handling hentes lista på nytt, så skjermen
// viser det som faktisk står i basen og ikke det den trodde den gjorde.
//
// **Uten nett** står en linje om at venner krever tilkobling, med «Prøv
// igjen». Handlingene legges aldri i en kø.
//
// **«Fjern» spør først** med en dialog. Webben har en to-trinns knapp; på en
// telefon er dialogen den vanlige formen for «er du sikker».
//
// **Delingen** åpner telefonens delearke med lenka (`Share.share`, ingen ny
// modul). Adressen bygges med `webUrl`, så butikkbygget deler tornygolf.no.
import { Children, Fragment, useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { FriendStatus } from '../../../../lib/friends/friendStatus';
import {
  addFriendByEmail,
  fetchFriends,
  inviteFriend,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
  type FriendActionResult,
  type FriendsData,
} from '../data/friends';
import type { WebApiFailure } from '../data/webApi';
import {
  FRIENDS_TEXT,
  friendStatusLine,
  friendsFailureLine,
  inviteButton,
  inviteFailureLine,
  invitePrompt,
  invitedLine,
  removeConfirmMessage,
  type StatusLine,
} from '../lib/friendsCopy';
import { describeWebLinkFailure, webUrl } from '../lib/webLink';
import type { ScreenProps } from '../navigation';
import { FONTS, TAP, useTheme } from '../theme';

type LoadState =
  | { state: 'loading' }
  | { state: 'ready'; data: FriendsData }
  | { state: 'failed'; reason: WebApiFailure | 'load_failed' };

function toLoadState(result: Awaited<ReturnType<typeof fetchFriends>>): LoadState {
  return result.ok ? { state: 'ready', data: result.data } : { state: 'failed', reason: result.reason };
}

// Skjermen tar ingen props fra navigasjonen; typen står for å låse ruta.
export function Friends(_props: ScreenProps<'Friends'>) {
  const { ui, colors } = useTheme();
  const [load, setLoad] = useState<LoadState>({ state: 'loading' });
  const [line, setLine] = useState<StatusLine | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  // Nøkkelen til handlingen som er i gang. Alle knappene står stille til den
  // er ferdig, så et dobbelt trykk aldri sender to forespørsler.
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [shareNote, setShareNote] = useState<string | null>(null);

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
    (id: string, name: string) => {
      // To knapper, og dialogen kan ikke avvises: svaret skal komme fra en av dem.
      Alert.alert(
        FRIENDS_TEXT.removeConfirmLabel,
        removeConfirmMessage(name),
        [
          { text: FRIENDS_TEXT.cancelLabel, style: 'cancel' },
          {
            text: FRIENDS_TEXT.removeConfirmLabel,
            style: 'destructive',
            onPress: () => void run(`remove:${id}`, () => removeFriend(id)),
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

  return (
    <ScrollView
      contentContainerStyle={ui.scroll}
      keyboardShouldPersistTaps="handled"
      testID="friends-screen"
    >
      <Text style={ui.muted}>{FRIENDS_TEXT.subtitle}</Text>

      {line ? (
        line.tone === 'error' ? (
          <Text style={ui.error} testID="friends-status">
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

      {inviteEmail ? (
        <View style={ui.card} testID="friends-invite-offer">
          <Text style={ui.body}>{invitePrompt(inviteEmail)}</Text>
          <SmallButton
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
        <Section title={FRIENDS_TEXT.incomingSection} testID="friends-incoming">
          <PeopleList>
          {incoming.map((r) => (
            <PersonRow key={r.requestId} name={r.name}>
              <SmallButton
                variant="ghost"
                label={FRIENDS_TEXT.declineLabel}
                pendingLabel={FRIENDS_TEXT.declinePending}
                pending={busy === `decline:${r.requestId}`}
                disabled={locked}
                onPress={() =>
                  void run(`decline:${r.requestId}`, () => respondToFriendRequest(r.requestId, false))
                }
                testID={`friends-decline-${r.id}`}
              />
              <SmallButton
                label={FRIENDS_TEXT.acceptLabel}
                pendingLabel={FRIENDS_TEXT.acceptPending}
                pending={busy === `accept:${r.requestId}`}
                disabled={locked}
                onPress={() =>
                  void run(`accept:${r.requestId}`, () => respondToFriendRequest(r.requestId, true))
                }
                testID={`friends-accept-${r.id}`}
              />
            </PersonRow>
          ))}
          </PeopleList>
        </Section>
      ) : null}

      <Section title={FRIENDS_TEXT.friendsSection} testID="friends-list">
        {friends.length === 0 ? (
          <Text style={ui.muted} testID="friends-empty">
            {FRIENDS_TEXT.noFriendsYet}
          </Text>
        ) : (
          <PeopleList>
          {friends.map((f) => (
            <PersonRow key={f.id} name={f.name}>
              <SmallButton
                variant="ghost"
                label={FRIENDS_TEXT.removeIdleLabel}
                pendingLabel={FRIENDS_TEXT.removePending}
                pending={busy === `remove:${f.id}`}
                disabled={locked}
                onPress={() => onRemove(f.id, f.name)}
                testID={`friends-remove-${f.id}`}
              />
            </PersonRow>
          ))}
          </PeopleList>
        )}
      </Section>

      {outgoing.length > 0 ? (
        <Section title={FRIENDS_TEXT.outgoingSection} testID="friends-outgoing">
          <PeopleList>
          {outgoing.map((r) => (
            <PersonRow key={r.requestId} name={r.name}>
              <SmallButton
                variant="ghost"
                label={FRIENDS_TEXT.withdrawLabel}
                pendingLabel={FRIENDS_TEXT.withdrawPending}
                pending={busy === `withdraw:${r.id}`}
                disabled={locked}
                onPress={() => void run(`withdraw:${r.id}`, () => removeFriend(r.id))}
                testID={`friends-withdraw-${r.id}`}
              />
            </PersonRow>
          ))}
          </PeopleList>
        </Section>
      ) : null}

      {suggestions.length > 0 ? (
        <Section title={FRIENDS_TEXT.suggestionsSection} testID="friends-suggestions">
          <PeopleList>
          {suggestions.map((s) => (
            <PersonRow key={s.id} name={s.name}>
              <SmallButton
                variant="secondary"
                label={FRIENDS_TEXT.addEmailButton}
                pendingLabel={FRIENDS_TEXT.addEmailPending}
                pending={busy === `add:${s.id}`}
                disabled={locked}
                onPress={() => void run(`add:${s.id}`, () => sendFriendRequest(s.id))}
                testID={`friends-add-${s.id}`}
              />
            </PersonRow>
          ))}
          </PeopleList>
        </Section>
      ) : null}

      <Section title={FRIENDS_TEXT.addByEmailSection} testID="friends-add-by-email">
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
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={onAddByEmail}
          accessibilityLabel={FRIENDS_TEXT.addEmailLabel}
          style={ui.input}
          testID="friends-email-input"
        />
        <SmallButton
          label={FRIENDS_TEXT.addEmailButton}
          pendingLabel={FRIENDS_TEXT.addEmailPending}
          pending={busy === 'email'}
          disabled={locked}
          onPress={onAddByEmail}
          testID="friends-email-submit"
        />
      </Section>

      {friendCode ? (
        <Section title={FRIENDS_TEXT.shareLinkSection} testID="friends-share">
          <Text style={ui.muted}>{FRIENDS_TEXT.shareLinkSubtitle}</Text>
          <SmallButton
            variant="secondary"
            label={FRIENDS_TEXT.shareLinkButton}
            onPress={() => void onShare(friendCode)}
            testID="friends-share-link"
          />
          {shareNote ? (
            <Text style={ui.error} testID="friends-share-error">
              {shareNote}
            </Text>
          ) : null}
        </Section>
      ) : null}
    </ScrollView>
  );
}

/** Radene i et kort, med streker mellom dem, ikke under den siste (som webben). */
function PeopleList({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <>
      {Children.toArray(children).map((row, index) => (
        <Fragment key={index}>
          {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.border }]} /> : null}
          {row}
        </Fragment>
      ))}
    </>
  );
}

function Section({ title, children, testID }: { title: string; children: ReactNode; testID: string }) {
  const { ui } = useTheme();
  return (
    <View testID={testID}>
      <Text style={ui.sectionTitle}>{title}</Text>
      <View style={[ui.card, styles.sectionCard]}>{children}</View>
    </View>
  );
}

/** Navnet til venstre, knappene til høyre, som webbens rader. */
function PersonRow({ name, children }: { name: string; children: ReactNode }) {
  const { ui } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[ui.body, styles.name]} numberOfLines={1}>
        {name || FRIENDS_TEXT.someoneFallback}
      </Text>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost';

function SmallButton({
  label,
  pendingLabel,
  pending = false,
  disabled = false,
  variant = 'primary',
  onPress,
  testID,
}: {
  label: string;
  pendingLabel?: string;
  pending?: boolean;
  disabled?: boolean;
  variant?: Variant;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const filled = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: pending }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        filled
          ? { backgroundColor: colors.primary }
          : variant === 'secondary'
            ? { borderWidth: 1, borderColor: colors.primary }
            : null,
        disabled && !pending ? styles.dimmed : null,
      ]}
      testID={testID}
    >
      <Text style={[styles.buttonText, { color: filled ? colors.onPrimary : colors.primary }]}>
        {pending && pendingLabel ? pendingLabel : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionCard: { marginTop: 8, paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: TAP,
    paddingVertical: 6,
  },
  separator: { height: StyleSheet.hairlineWidth },
  name: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  button: {
    minHeight: TAP,
    minWidth: TAP,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  buttonText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  dimmed: { opacity: 0.5 },
});
