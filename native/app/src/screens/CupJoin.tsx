// #2752: skjermen cup-lenka åpner, `/cup/bli-med/<kode>`. Tilstandene er nettsidens, fra
// samme regel (`evaluateCupJoin`): du kan melde deg på, du er påmeldt, påmeldingen er
// stengt eller full, cupen er for klubben, eller du mangler handicap. Samme språk som
// «Bli med i liga» og påmeldingen til en runde: navnet stort og skogkortet med knappen.
//
// Alt kommer fra `GET /api/cup/join/[shortId]`, og `POST` og `DELETE` på samme sti melder
// deg på og av. Lenka ER gaten, som på nettet. Ingenting legges i kø: uten nett står
// feilen, og ingenting er skrevet.
//
// Tilbake (`docs/user-flows.md` §Tilbake): åpnet lenka appen, går tilbake til Hjem. Sto du
// på en annen skjerm, går tilbake dit.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppCupJoinView } from '../../../../lib/cup/appCupSetupView';
import { WebLinkButton } from '../components/WebLinkButton';
import { fetchCupJoin, joinCup, leaveCup } from '../data/cupSetup';
import { openOrReturn } from '../lib/backTo';
import {
  JOIN_TEXT,
  SETUP_APP_TEXT,
  joinDecisionText,
  joinFailureText,
  joinLoadFailureText,
  joinStatusText,
} from '../lib/cupSetupCopy';
import { formatMessage } from '../lib/kavalkadeCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, TAP, useTheme, withAlpha } from '../theme';

export function CupJoin({ route, navigation }: ScreenProps<'CupJoin'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { shortId } = route.params;
  const [view, setView] = useState<AppCupJoinView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  // Knappen er deaktivert først når `busy` er tegnet. Refen stopper trykk nummer to før det.
  const sending = useRef(false);

  const load = useCallback(async () => {
    const result = await fetchCupJoin(shortId);
    if (result.ok) {
      setView(result.view);
      setFailure(null);
    } else {
      setFailure(result.reason);
    }
  }, [shortId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (view === null && failure === null) {
    return (
      <View style={ui.centered} testID="cup-join-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>{SETUP_APP_TEXT.loading}</Text>
      </View>
    );
  }
  if (view === null) {
    const final = failure === 'not_found';
    return (
      <View style={ui.centered} testID="cup-join-failed">
        <Text style={[styles.failure, { color: final ? colors.text : colors.danger }]}>
          {joinLoadFailureText(failure ?? 'load_failed')}
        </Text>
        {final ? null : (
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button"
            style={[styles.retry, { borderColor: colors.primary }]}
            testID="cup-join-retry"
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>{SETUP_APP_TEXT.retry}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const { decision, cup, courseName, when, cap, club, canOpenCup } = view;
  const planLine =
    [courseName, when ? formatMessage(JOIN_TEXT.teeOffLine, when) : null].filter(Boolean).join(' · ') || null;
  const sentence = joinDecisionText(decision, { cap, clubName: club?.name ?? null });
  const goToCup = () => openOrReturn(navigation, 'Cup', { cupId: cup.id });

  const answer = async (send: typeof joinCup) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    setReceipt(null);
    const result = await send(shortId);
    if (result.ok) setReceipt(joinStatusText(result.status));
    else setError(joinFailureText(result.reason, cap));
    await load();
    sending.current = false;
    setBusy(false);
  };

  const head = (
    <View style={styles.head}>
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" testID="cup-join-name">
        {cup.name}
      </Text>
      <Text style={[styles.line, { color: colors.muted }]}>
        {formatMessage(JOIN_TEXT.teams, { team1: cup.team1Name, team2: cup.team2Name })}
      </Text>
    </View>
  );
  const scroll = [styles.scroll, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 24 }];
  const errorLine = error ? (
    <Text style={[styles.error, { color: colors.danger }]} testID="cup-join-error">
      {error}
    </Text>
  ) : null;
  const receiptLine = receipt ? (
    <View
      style={[
        styles.note,
        { backgroundColor: withAlpha(colors.accent, 0.14), borderColor: withAlpha(colors.accent, 0.5) },
      ]}
      testID="cup-join-receipt"
    >
      <Text style={[styles.body, { color: colors.text }]}>{receipt}</Text>
    </View>
  ) : null;

  if (decision === 'can_join') {
    const onStrong = colors.onStrong;
    return (
      <ScrollView contentContainerStyle={scroll} testID="cup-join-screen">
        {head}
        {receiptLine}
        {errorLine}
        <View style={[styles.hero, { backgroundColor: colors.surfaceStrong }]} testID="cup-join-can_join">
          {planLine ? <Text style={[styles.fact, { color: withAlpha(onStrong, 0.85) }]}>{planLine}</Text> : null}
          <Text style={[styles.body, { color: onStrong }]}>{sentence}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            onPress={() => void answer(joinCup)}
            style={[styles.cta, { backgroundColor: onStrong }, busy ? styles.dimmed : null]}
            testID="cup-join-button"
          >
            <Text style={[styles.ctaText, { color: colors.surfaceStrong }]}>{JOIN_TEXT.join}</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={scroll} testID="cup-join-screen">
      {head}
      {receiptLine}
      {errorLine}
      <View
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        testID={`cup-join-${decision}`}
      >
        <Text style={[styles.body, { color: colors.text }]}>{sentence}</Text>
        {planLine ? <Text style={[styles.fact, { color: colors.muted }]}>{planLine}</Text> : null}
      </View>
      <View style={styles.actions}>
        {decision === 'profile_incomplete' ? (
          <Pressable
            accessibilityRole="button"
            style={ui.button}
            onPress={() => openOrReturn(navigation, 'EditProfile')}
            testID="cup-join-profile"
          >
            <Text style={ui.buttonText}>{JOIN_TEXT.completeProfile}</Text>
          </Pressable>
        ) : null}
        {decision === 'not_member' && club ? (
          <WebLinkButton
            label={JOIN_TEXT.joinClub}
            path={`/klubber/bli-med/${encodeURIComponent(club.shortId)}`}
            testID="cup-join-club"
          />
        ) : null}
        {canOpenCup && (decision === 'already_joined' || decision === 'closed' || decision === 'full') ? (
          <Pressable accessibilityRole="button" style={ui.button} onPress={goToCup} testID="cup-join-open-cup">
            <Text style={ui.buttonText}>{JOIN_TEXT.goToCup}</Text>
          </Pressable>
        ) : null}
        {decision === 'already_joined' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            style={[ui.buttonSecondary, busy ? styles.dimmed : null]}
            onPress={() => void answer(leaveCup)}
            testID="cup-join-leave"
          >
            <Text style={ui.buttonSecondaryText}>{JOIN_TEXT.leave}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 16 },
  head: { paddingTop: 10, gap: 6, paddingBottom: 10 },
  title: { ...fraunces(500, 26, 30, { multiline: true }) },
  line: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  hero: { borderRadius: 16, padding: 14, gap: 10 },
  fact: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  body: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans },
  cta: { minHeight: TAP, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  ctaText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  dimmed: { opacity: 0.6 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  note: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8 },
  error: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, paddingBottom: 8 },
  actions: { paddingTop: 14, gap: 8 },
  failure: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderRadius: 22 },
  retryText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
