// native/app/src/screens/FriendLink.tsx
// #2627: «Bli venn med …» — skjermen QR-koden på bag-taggen og venne-lenka
// åpner i appen. Tilstandene er nettsidens (`/venner/legg-til/[code]`, #369):
// ukjent kode, din egen kode, allerede venner, og «Bli venner» med én knapp.
// Etter trykket står «Dere er venner nå!» og veien til vennesiden.
//
// Tegningene står på bevissiden til PR-en (lys og natt, én per tilstand): «LEGG
// TIL VENN» i toppen, eierens navn stort, og skogkortet fra Venner med
// initialene, nettsidens setning og den kremfargede knappen.
//
// Navnet og forholdet kommer fra `GET /api/friends/link/[code]` (navnet er
// maskert på serveren, #2271), koblingen fra `POST` på samme sti. Ingenting
// legges i kø: uten nett står vennesidens linje og «Prøv igjen».
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { FriendLinkRelation } from '../../../../lib/friends/friendStatus';
import { nameInitials } from '../../../../lib/names/initials';
import { KEYBOARD_SCROLL_PROPS, useBottomInsetUnlessKeyboard } from '../components/KeyboardInset';
import { PageTitle } from '../components/PageTitle';
import { HakeIcon } from '../components/icons/Icons';
import { connectFriendLink, fetchFriendLink, type FriendLinkLoadResult } from '../data/friends';
import { fetchOwnProfile } from '../data/profile';
import type { WebApiFailure } from '../data/webApi';
import {
  FRIEND_LINK_TEXT,
  FRIENDS_TEXT,
  friendLinkConnectCard,
  friendStatusLine,
  friendsFailureLine,
} from '../lib/friendsCopy';
import { bagTagModel } from '../lib/bagTag';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, interLine, useTheme, withAlpha } from '../theme';

/** Det skjermen viser. `connected` er etter trykket på «Bli venner». */
type Shown =
  | { state: 'loading' }
  | { state: 'failed'; reason: WebApiFailure | 'load_failed' }
  | { state: 'unknown' }
  | { state: 'ready'; name: string; relation: FriendLinkRelation | 'connected' };

/** Svaret fra ruta → det skjermen viser. En ukjent kode er en egen tilstand, ikke en feil. */
function shownFor(result: FriendLinkLoadResult): Shown {
  if (result.ok) return { state: 'ready', name: result.name, relation: result.relation };
  if (result.reason === 'not_found') return { state: 'unknown' };
  return { state: 'failed', reason: result.reason };
}

/** Initialene uten kallenavnet, som står i «…» bak navnet. */
function initialsOf(name: string): string {
  return nameInitials(name.replace(/\s*«[^»]*»\s*$/, ''));
}

export function FriendLink({ navigation, route }: ScreenProps<'FriendLink'>) {
  const { colors, ui } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();
  const { code } = route.params;
  const { userId, email } = useSession();
  const [view, setView] = useState<Shown>({ state: 'loading' });
  // Dine initialer til heltekortet på Venner, som Profil sender med. Etter
  // bag-taggens regel (`bagTagModel`). Best effort: uten dem står bare
  // «+»-ringen der.
  const [selfInitials, setSelfInitials] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);

  // `attempt` teller «Prøv igjen»: hvert trykk henter på nytt.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchFriendLink(code);
      if (!cancelled) setView(shownFor(result));
    })();
    return () => {
      cancelled = true;
    };
  }, [code, attempt]);

  useEffect(() => {
    let cancelled = false;
    fetchOwnProfile(userId)
      .then((profile) => {
        if (!cancelled) setSelfInitials(bagTagModel(profile, null, new Date(), email).initials);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, email]);

  const onConnect = useCallback(async () => {
    if (busy || view.state !== 'ready') return;
    setBusy(true);
    setLine(null);
    const result = await connectFriendLink(code);
    setBusy(false);
    if (!result.ok) {
      setLine(friendsFailureLine(result.reason));
      return;
    }
    if (result.status === 'accepted') setView({ ...view, relation: 'connected' });
    else if (result.status === 'already_friends' || result.status === 'self') {
      setView({ ...view, relation: result.status });
    } else setLine(FRIEND_LINK_TEXT.errorBanner);
  }, [busy, code, view]);

  // Vennesiden erstatter denne, så «tilbake» derfra ikke lander her igjen.
  // `from` gjør at pila der heter «Tilbake», ikke «Tilbake til profil».
  const toFriends = useCallback(
    () => navigation.replace('Friends', { selfInitials, from: 'friendLink' }),
    [navigation, selfInitials],
  );

  if (view.state === 'loading') {
    return (
      <View style={ui.centered} testID="friend-link-loading">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const scroll = [ui.scroll, styles.scroll, { paddingBottom: 32 + bottomInset }];
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];
  const bodyText = [styles.body, { color: colors.text }];

  if (view.state === 'failed') {
    return (
      <ScrollView {...KEYBOARD_SCROLL_PROPS} contentContainerStyle={scroll} testID="friend-link-screen">
        <View style={card}>
          <Text style={bodyText} testID="friend-link-load-error">
            {view.reason === 'load_failed' ? FRIEND_LINK_TEXT.loadFailed : friendsFailureLine(view.reason)}
          </Text>
          <Pressable
            accessibilityRole="button"
            style={[ui.buttonSecondary, styles.buttonFlush]}
            onPress={() => {
              setView({ state: 'loading' });
              setAttempt((n) => n + 1);
            }}
            testID="friend-link-retry"
          >
            <Text style={ui.buttonSecondaryText}>{FRIENDS_TEXT.retry}</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (view.state === 'unknown') {
    return (
      <ScrollView {...KEYBOARD_SCROLL_PROPS} contentContainerStyle={scroll} testID="friend-link-screen">
        <PageTitle title={FRIEND_LINK_TEXT.unknownTitle} />
        <View style={card} testID="friend-link-unknown">
          <Text style={bodyText}>{FRIEND_LINK_TEXT.unknownBody}</Text>
        </View>
      </ScrollView>
    );
  }

  const { name, relation } = view;
  return (
    <ScrollView {...KEYBOARD_SCROLL_PROPS} contentContainerStyle={scroll} testID="friend-link-screen">
      <PageTitle title={name} />

      {relation === 'connectable' ? (
        <View style={[styles.hero, { backgroundColor: colors.surfaceStrong }]} testID="friend-link-connect">
          <View style={styles.heroRow}>
            {/* Pynt: navnet står som sidens overskrift. */}
            <View
              style={[styles.initials, { backgroundColor: colors.onStrongWarm }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={[styles.initialsText, { color: colors.surfaceStrong }]}>{initialsOf(name)}</Text>
            </View>
            <Text style={[styles.body, styles.heroText, { color: withAlpha(colors.onStrongWarm, 0.85) }]}>
              {friendLinkConnectCard(name)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            onPress={() => void onConnect()}
            style={[styles.button, { backgroundColor: colors.onStrongWarm }, busy ? styles.dimmed : null]}
            testID="friend-link-connect-button"
          >
            <Text style={[styles.buttonText, { color: colors.surfaceStrong }]}>
              {busy ? FRIEND_LINK_TEXT.connectPending : FRIEND_LINK_TEXT.connectButton}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={card} testID={`friend-link-${relation}`}>
          {relation === 'connected' ? (
            <View style={styles.okLine}>
              <View
                style={[styles.okDot, { backgroundColor: colors.primarySoft }]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <HakeIcon color={colors.primary} size={16} strokeWidth={2.5} />
              </View>
              <Text style={[styles.okText, { color: colors.text }]}>{friendStatusLine('accepted')?.text}</Text>
            </View>
          ) : (
            <Text style={bodyText}>
              {relation === 'self' ? FRIEND_LINK_TEXT.selfCard : FRIEND_LINK_TEXT.alreadyFriendsCard}
            </Text>
          )}
          {relation === 'self' ? null : (
            <Pressable
              accessibilityRole="button"
              onPress={toFriends}
              style={[styles.button, { backgroundColor: colors.primary }]}
              testID="friend-link-to-friends"
            >
              <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{FRIEND_LINK_TEXT.toFriendsLink}</Text>
            </Pressable>
          )}
        </View>
      )}

      {line ? (
        <Text style={[ui.error, styles.inset]} testID="friend-link-status">
          {line}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const INITIALS = 40;

// Målene er tegningenes (Venner-forslag): tittelen 6 pt under topp-raden og
// 20 pt fra kanten, kortet 16 pt fra kanten og 16 pt under tittelen, knappen
// 52 pt høy.
const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingTop: 6 },
  inset: { paddingHorizontal: 4 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 14, marginTop: 8 },
  body: { ...interLine(15, 21.75, { multiline: true }), fontFamily: FONTS.sans },
  hero: { borderRadius: 18, padding: 16, gap: 14, marginTop: 8 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroText: { flexShrink: 1 },
  initials: {
    width: INITIALS,
    height: INITIALS,
    borderRadius: INITIALS / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: { fontSize: 13, fontFamily: FONTS.sansSemiBold },
  button: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  buttonFlush: { marginTop: 0 },
  buttonText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  dimmed: { opacity: 0.5 },
  okLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  okDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  okText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
