// native/app/src/screens/RoundInvite.tsx
// #2748: skjermen den delte påmeldingslenka åpner, lenka og QR-koden arrangøren
// deler. Tilstandene er nettsidens (`/signup/[shortId]`), fra samme regel
// (`signupOffer`): du kan melde deg på, du kan be om plass, forespørselen er sendt,
// runden er i gang eller stengt, eller det må gjøres på nettsiden (lag, valg av side,
// en invitasjon som venter). Står du alt på lista, går du rett til runden uten noen
// mellomskjerm.
//
// Tegningen står på bevissiden til PR-en (lys og natt, én per tilstand): samme språk
// som «Bli med i liga», med rundens navn stort og skogkortet med den kremfargede
// knappen.
//
// Alt kommer fra `GET /api/pamelding/[shortId]`. Skrivingen er `POST` på samme sti.
// Ingenting legges i kø: uten nett står feilen, og ingenting er skrevet.
//
// Tilbake (`docs/user-flows.md` §Tilbake): åpnet lenka appen, går tilbake til Hjem.
// Sto du på en annen skjerm, går tilbake dit (unntaket i regel 1). «Meld meg på» er
// et sendt skjema, så skjermen er borte fra tilbake-veien etterpå (`backTo`).
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppRoundInviteView } from '../../../../lib/games/appRoundInviteView';
import { REGISTRATION_MESSAGE_MAX } from '../../../../lib/games/registration';
import { WebLinkButton } from '../components/WebLinkButton';
import {
  fetchRoundInvite,
  joinRound,
  requestToJoin,
  type RoundInviteAnswerFailure,
  type RoundInviteAnswerResult,
  type RoundInviteLoadFailure,
} from '../data/roundInvite';
import { backTo, openOrReturn } from '../lib/backTo';
import { joinPlayersLine } from '../lib/leagueCopy';
import {
  ROUND_INVITE_TEXT,
  describeRoundInviteFailure,
  describeRoundInviteLoadFailure,
  roundFeeLine,
  roundPlaceLine,
  roundWhenLine,
} from '../lib/roundInviteCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, useTheme, withAlpha } from '../theme';

/** Svarene som stopper skjemaet: et nytt forsøk gir det samme. */
type StopReason = 'wrong_mode' | 'game_full' | 'profile_incomplete';

export function RoundInvite({ navigation, route }: ScreenProps<'RoundInvite'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { shortId, src } = route.params;
  const [view, setView] = useState<AppRoundInviteView | null>(null);
  const [failure, setFailure] = useState<RoundInviteLoadFailure | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [stop, setStop] = useState<StopReason | null>(null);
  const [error, setError] = useState<RoundInviteAnswerFailure | null>(null);
  // Knappen er deaktivert først når `busy` er tegnet. Refen stopper trykk nummer to før det.
  const sending = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchRoundInvite(shortId);
    setLoading(false);
    if (!result.ok) {
      setFailure(result.reason);
      return;
    }
    setFailure(null);
    setStop(null);
    setError(null);
    if (result.view.offer === 'in_game' && result.view.gameId) {
      backTo(navigation, 'GameHome', { gameId: result.view.gameId });
      return;
    }
    setView(result.view);
  }, [navigation, shortId]);

  // Også ved fokus: kommer du tilbake fra profilen eller nettsiden, kan svaret være et annet.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onSend = useCallback(
    async (send: () => Promise<RoundInviteAnswerResult>) => {
      if (sending.current || !view) return;
      sending.current = true;
      setBusy(true);
      setError(null);
      const result = await send();
      sending.current = false;
      setBusy(false);
      if (result.ok) {
        if (result.status === 'joined') backTo(navigation, 'GameHome', { gameId: result.gameId });
        else setView({ ...view, offer: 'pending' });
        return;
      }
      switch (result.reason) {
        case 'game_locked':
          setView({ ...view, offer: 'locked' });
          return;
        case 'signup_closed':
          setView({ ...view, offer: 'closed' });
          return;
        case 'use_web':
          setView({ ...view, offer: 'web' });
          return;
        case 'not_found':
          setFailure('not_found');
          return;
        case 'wrong_mode':
        case 'game_full':
        case 'profile_incomplete':
          setStop(result.reason);
          return;
        default:
          setError(result.reason);
      }
    },
    [navigation, view],
  );

  const scroll = [styles.scroll, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 20 }];

  if (failure === 'not_found') {
    return (
      <ScrollView contentContainerStyle={scroll} testID="round-invite-screen">
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.body, { color: colors.text }]} testID="round-invite-not-found">
            {ROUND_INVITE_TEXT.notFound}
          </Text>
          <PrimaryButton label={ROUND_INVITE_TEXT.toHome} onPress={() => navigation.popToTop()} testID="round-invite-home" />
        </View>
      </ScrollView>
    );
  }
  if (view === null) {
    return failure === null ? (
      <View style={ui.centered} testID="round-invite-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>{ROUND_INVITE_TEXT.loading}</Text>
      </View>
    ) : (
      <View style={[styles.state, { backgroundColor: colors.bg }]} testID="round-invite-load-failed">
        <Text style={[styles.stateText, { color: colors.danger }]} testID="round-invite-load-error">
          {describeRoundInviteLoadFailure(failure)}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void load()}
          style={[styles.retry, { borderColor: colors.primary }]}
          testID="round-invite-retry"
        >
          <Text style={[styles.retryText, { color: colors.primary }]}>
            {loading ? ROUND_INVITE_TEXT.retrying : ROUND_INVITE_TEXT.retry}
          </Text>
        </Pressable>
      </View>
    );
  }

  const { offer, round } = view;
  const trimmed = message.trim();
  const webPath = src ? `${view.signupPath}?src=${encodeURIComponent(src)}` : view.signupPath;
  const errorText =
    error === null
      ? null
      : describeRoundInviteFailure(
          error as Parameters<typeof describeRoundInviteFailure>[0],
        );
  const retryable = error === 'network' || error === 'offline' || error === 'db_error';

  const head = (
    <View style={styles.head}>
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" testID="round-invite-name">
        {round.name}
      </Text>
      <Text style={[styles.place, { color: colors.muted }]} testID="round-invite-place">
        {roundPlaceLine(round)}
      </Text>
    </View>
  );

  if (stop === null && (offer === 'join' || offer === 'request')) {
    const onStrong = colors.onStrongWarm;
    const label = busy
      ? offer === 'join'
        ? ROUND_INVITE_TEXT.joinPending
        : ROUND_INVITE_TEXT.requestPending
      : retryable
        ? ROUND_INVITE_TEXT.retry
        : offer === 'join'
          ? ROUND_INVITE_TEXT.joinButton
          : ROUND_INVITE_TEXT.requestButton;
    return (
      <ScrollView
        contentContainerStyle={scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        testID="round-invite-screen"
      >
        {head}
        <View style={[styles.hero, { backgroundColor: colors.surfaceStrong }]} testID={`round-invite-${offer}`}>
          <Facts view={view} color={withAlpha(onStrong, 0.85)} />
          <Text style={[styles.body, { color: onStrong }]}>
            {offer === 'join' ? ROUND_INVITE_TEXT.joinIntro : ROUND_INVITE_TEXT.requestIntro}
          </Text>
          {offer === 'request' ? (
            <View style={styles.field}>
              <Text style={[styles.label, { color: withAlpha(onStrong, 0.85) }]} nativeID="round-invite-message-label">
                {ROUND_INVITE_TEXT.messageLabel}
              </Text>
              <TextInput
                accessibilityLabel={ROUND_INVITE_TEXT.messageLabel}
                accessibilityLabelledBy="round-invite-message-label"
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={REGISTRATION_MESSAGE_MAX}
                placeholder={ROUND_INVITE_TEXT.messagePlaceholder}
                placeholderTextColor={withAlpha(onStrong, 0.6)}
                textAlignVertical="top"
                style={[
                  styles.input,
                  {
                    color: onStrong,
                    borderColor: withAlpha(onStrong, 0.35),
                    backgroundColor: withAlpha(onStrong, 0.08),
                  },
                ]}
                testID="round-invite-message"
              />
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            onPress={() =>
              void onSend(() =>
                offer === 'join' ? joinRound(shortId, src) : requestToJoin(shortId, trimmed === '' ? null : trimmed),
              )
            }
            style={[styles.button, { backgroundColor: onStrong }, busy ? styles.dimmed : null]}
            testID="round-invite-button"
          >
            <Text style={[styles.buttonText, { color: colors.surfaceStrong }]}>{label}</Text>
          </Pressable>
          {errorText ? (
            <Text style={[styles.body, { color: onStrong }]} testID="round-invite-error">
              {errorText}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={scroll} testID="round-invite-screen">
      {head}
      <View
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        testID={`round-invite-${stop ?? offer}`}
      >
        <Facts view={view} color={colors.muted} />
        {stop !== null ? (
          <>
            <Text style={[styles.body, { color: colors.text }]} testID="round-invite-stop">
              {describeRoundInviteFailure(stop)}
            </Text>
            {stop === 'profile_incomplete' ? (
              <PrimaryButton
                label={ROUND_INVITE_TEXT.completeProfile}
                onPress={() => openOrReturn(navigation, 'EditProfile')}
                testID="round-invite-profile"
              />
            ) : (
              <PrimaryButton label={ROUND_INVITE_TEXT.toHome} onPress={() => navigation.popToTop()} testID="round-invite-home" />
            )}
          </>
        ) : offer === 'pending' ? (
          <>
            <Text style={[styles.sentTitle, { color: colors.text }]} testID="round-invite-sent">
              {ROUND_INVITE_TEXT.sentTitle}
            </Text>
            <Text style={[styles.body, { color: colors.text }]}>{ROUND_INVITE_TEXT.sentBody}</Text>
          </>
        ) : offer === 'web' ? (
          <>
            <Text style={[styles.body, { color: colors.text }]}>{ROUND_INVITE_TEXT.webIntro}</Text>
            <WebLinkButton label={ROUND_INVITE_TEXT.webButton} path={webPath} testID="round-invite-open-web" />
          </>
        ) : (
          <Text style={[styles.body, { color: colors.text }]}>
            {offer === 'closed' ? ROUND_INVITE_TEXT.closed : ROUND_INVITE_TEXT.locked}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

function PrimaryButton({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, { backgroundColor: colors.primary }]}
      testID={testID}
    >
      <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

/** Når, hvor mange og hva det koster, med tall i like bredder. Aldri navn. */
function Facts({ view, color }: { view: AppRoundInviteView; color: string }) {
  const when = roundWhenLine(view.round.teeOffAt);
  const fee = roundFeeLine(view.round.entryFeeKr);
  return (
    <View style={styles.facts}>
      {when ? (
        <Text style={[styles.fact, { color }]} testID="round-invite-when">
          {when}
        </Text>
      ) : null}
      <Text style={[styles.fact, { color }]} testID="round-invite-count">
        {joinPlayersLine(view.playerCount)}
      </Text>
      {fee ? (
        <Text style={[styles.fact, { color }]} testID="round-invite-fee">
          {fee}
        </Text>
      ) : null}
    </View>
  );
}

// Målene er «Bli med i liga»: 6 under toppen og 20 fra kanten, kortene 16 fra kanten
// og 16 inni, knappen 52 pt høy.
const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  head: { paddingTop: 6, paddingHorizontal: 20 },
  title: { ...fraunces(500, 28, 34, { multiline: true }) },
  place: { ...interLine(13, 16), fontFamily: FONTS.sans, marginTop: 6 + interLine(13, 16).marginTop },
  hero: { borderRadius: 18, padding: 16, gap: 14, marginTop: 16, marginHorizontal: 16 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 14, marginTop: 16, marginHorizontal: 16 },
  facts: { gap: 4 },
  fact: { ...interLine(14, 20), fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  body: { ...interLine(15, 21.75, { multiline: true }), fontFamily: FONTS.sans },
  sentTitle: { ...fraunces(500, 20, 26, { multiline: true }) },
  field: { gap: 8 },
  label: { ...interLine(13, 16), fontFamily: FONTS.sans },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.sans,
  },
  button: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  dimmed: { opacity: 0.5 },
  state: { flex: 1, alignItems: 'center', gap: 12, paddingTop: 26, paddingHorizontal: 24 },
  stateText: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: 44, borderWidth: 1, borderRadius: 999, paddingHorizontal: 20, justifyContent: 'center' },
  retryText: { ...interLine(16, 19), fontFamily: FONTS.sansSemiBold },
});
