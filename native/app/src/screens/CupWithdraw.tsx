// #2752: bekreftelsen for trekk fra en cup, det nettets `/cup/[id]/trekk` og
// `/admin/cup/[id]/trekk/[userId]` viser. Tre varianter fra samme data:
//
//  - uten `userId`: spilleren trekker seg selv. Raden slettes ikke (#1937), og bare
//    arrangøren kan angre.
//  - med `userId`: arrangøren trekker en spiller, med makkervalget der det finnes.
//  - med `userId`, og spilleren er alt trukket: angringen.
//
// Konsekvensene regnes av samme regelmodul som skrivingen, på serveren. Husregelen
// for destruktive flyter: egen skjerm, aldri en dialog.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppCupWithdrawalView } from '../../../../lib/cup/appCupManageView';
import { CupOption } from '../components/cup/CupOption';
import {
  fetchCupWithdrawal,
  undoCupWithdrawal,
  withdrawCupPlayer,
  withdrawSelfFromCup,
} from '../data/cupManage';
import { backTo } from '../lib/backTo';
import { CUP_TEXT } from '../lib/cupCopy';
import {
  MANAGE_APP_TEXT,
  WITHDRAW_TEXT,
  manageLoadFailureText,
  withdrawFailureText,
  withdrawalMatchLine,
} from '../lib/cupManageCopy';
import { formatMessage } from '../lib/kavalkadeCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, TAP, useTheme, withAlpha } from '../theme';

export function CupWithdraw({ route, navigation }: ScreenProps<'CupWithdraw'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { cupId, userId } = route.params;
  const [view, setView] = useState<AppCupWithdrawalView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchCupWithdrawal(cupId, userId);
    if (result.ok) {
      setView(result.view);
      setFailure(null);
      // Forhåndsvalget er det som alt er registrert, ellers «etter regelen» (E4).
      setChoices(
        Object.fromEntries(
          result.view.matches
            .filter((match) => match.canPlayOn)
            .map((match) => [match.gameId, match.playOn]),
        ),
      );
    } else {
      setFailure(result.reason);
    }
  }, [cupId, userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const leave = () => {
    if (userId) backTo(navigation, 'CupManage', { cupId });
    else backTo(navigation, 'Cup', { cupId });
  };

  const run = async (action: () => ReturnType<typeof withdrawSelfFromCup>, done: (partial: boolean) => void) => {
    setBusy(true);
    setError(null);
    const result = await action();
    if (result.ok) {
      done(result.partial === true);
      return;
    }
    setError(withdrawFailureText(result.reason));
    setBusy(false);
    // Reglene kan ha endret seg siden skjermen ble tegnet.
    void load();
  };

  if (view === null) {
    if (failure === null) {
      return (
        <View style={ui.centered} testID="cup-withdraw-loading">
          <ActivityIndicator color={colors.primary} />
          <Text style={ui.muted}>{MANAGE_APP_TEXT.loading}</Text>
        </View>
      );
    }
    return (
      <View style={ui.centered} testID="cup-withdraw-failed">
        <Text style={[styles.failure, { color: colors.text }]}>{manageLoadFailureText(failure)}</Text>
        <Pressable
          onPress={() => void load()}
          accessibilityRole="button"
          style={[styles.retry, { borderColor: colors.primary }]}
          testID="cup-withdraw-retry"
        >
          <Text style={[styles.retryText, { color: colors.primary }]}>{MANAGE_APP_TEXT.retry}</Text>
        </Pressable>
      </View>
    );
  }

  const { cup, player, matches, untouched, alreadyWithdrawn } = view;
  const isSelf = player.isSelf;
  const active = cup.status === 'active';
  const isUndo = !isSelf && alreadyWithdrawn;
  const canWrite = active && !isUndo && matches.length > 0;
  const offered = matches.filter((match) => match.canPlayOn);

  const heading = isUndo
    ? formatMessage(WITHDRAW_TEXT.undoHeading, { name: player.name })
    : isSelf
      ? formatMessage(WITHDRAW_TEXT.headingSelf, { cup: cup.name })
      : formatMessage(WITHDRAW_TEXT.headingAdmin, { name: player.name, cup: cup.name });
  const info = !active
    ? withdrawFailureText('wrong_status')
    : isUndo
      ? WITHDRAW_TEXT.undoBody
      : matches.length > 0
        ? null
        : isSelf && alreadyWithdrawn
          ? WITHDRAW_TEXT.alreadyWithdrawnSelf
          : WITHDRAW_TEXT.nothingPending;

  const submit = () => {
    if (isSelf) {
      void run(
        () => withdrawSelfFromCup(cupId),
        () => backTo(navigation, 'Cup', { cupId }),
      );
      return;
    }
    if (isUndo) {
      void run(
        () => undoCupWithdrawal(cupId, player.userId),
        () => backTo(navigation, 'CupManage', { cupId, notice: 'withdrawal_undone' }),
      );
      return;
    }
    void run(
      () =>
        withdrawCupPlayer(cupId, player.userId, {
          offeredGameIds: offered.map((match) => match.gameId),
          playOnGameIds: offered.filter((match) => choices[match.gameId]).map((match) => match.gameId),
        }),
      (partial) =>
        backTo(navigation, 'CupManage', {
          cupId,
          notice: partial ? 'player_withdrawn_partial' : 'player_withdrawn',
        }),
    );
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 24 }]}
      testID="cup-withdraw-screen"
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" testID="cup-withdraw-heading">
          {heading}
        </Text>
        {isUndo ? null : (
          <Text style={[styles.line, { color: colors.muted }]}>
            {cup.team1Name} {CUP_TEXT.mot} {cup.team2Name}
          </Text>
        )}
      </View>

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]} testID="cup-withdraw-error">
          {error}
        </Text>
      ) : null}

      {canWrite ? (
        <View
          style={[
            styles.warning,
            { backgroundColor: withAlpha(colors.accent, 0.14), borderColor: withAlpha(colors.accent, 0.45) },
          ]}
          testID="cup-withdraw-warning"
        >
          <Text style={[styles.body, { color: colors.text }]}>{WITHDRAW_TEXT.warning}</Text>
        </View>
      ) : null}

      {info ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="cup-withdraw-info">
          <Text style={[styles.body, { color: colors.text }]}>{info}</Text>
        </View>
      ) : null}

      {canWrite ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="cup-withdraw-consequences">
          <Text style={[styles.cardLabel, { color: colors.muted }]}>{WITHDRAW_TEXT.matchesHeading}</Text>
          {matches.map((match) => (
            <Text key={match.gameId} style={[styles.body, { color: colors.text }]}>
              {withdrawalMatchLine(match)}
            </Text>
          ))}
          {isSelf ? <Text style={[styles.small, { color: colors.muted }]}>{WITHDRAW_TEXT.selfNote}</Text> : null}
        </View>
      ) : null}

      {canWrite && !isSelf
        ? offered.map((match) => {
            const partner = match.partnerName ?? '';
            return (
              <View
                key={match.gameId}
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                testID={`cup-withdraw-choice-${match.gameId}`}
              >
                <Text style={[styles.cardLabel, styles.choiceLabel, { color: colors.muted }]}>
                  {`${match.label ?? CUP_TEXT.matchFallback} · ${formatMessage(WITHDRAW_TEXT.playOnLegend, { partner })}`}
                </Text>
                <CupOption
                  label={formatMessage(WITHDRAW_TEXT.playOnYes, { partner })}
                  selected={choices[match.gameId] === true}
                  disabled={busy}
                  onPress={() => setChoices((all) => ({ ...all, [match.gameId]: true }))}
                  testID={`cup-withdraw-choice-yes-${match.gameId}`}
                />
                <CupOption
                  label={WITHDRAW_TEXT.playOnNo}
                  selected={choices[match.gameId] !== true}
                  disabled={busy}
                  onPress={() => setChoices((all) => ({ ...all, [match.gameId]: false }))}
                  testID={`cup-withdraw-choice-no-${match.gameId}`}
                />
                <Text style={[styles.small, { color: colors.muted }]}>{WITHDRAW_TEXT.playOnHelp}</Text>
              </View>
            );
          })
        : null}

      {untouched.length > 0 && !isUndo ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="cup-withdraw-untouched">
          <Text style={[styles.cardLabel, { color: colors.muted }]}>{WITHDRAW_TEXT.untouchedHeading}</Text>
          {untouched.map((match) => (
            <Text key={match.gameId} style={[styles.body, { color: colors.muted }]}>
              {match.label ?? CUP_TEXT.matchFallback}
            </Text>
          ))}
          <Text style={[styles.small, { color: colors.muted }]}>{WITHDRAW_TEXT.untouchedNote}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {canWrite ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={[ui.button, { backgroundColor: colors.danger }]}
            onPress={submit}
            testID="cup-withdraw-submit"
          >
            <Text style={ui.buttonText}>
              {busy
                ? WITHDRAW_TEXT.withdrawPending
                : isSelf
                  ? WITHDRAW_TEXT.withdrawButtonSelf
                  : WITHDRAW_TEXT.withdrawButtonAdmin}
            </Text>
          </Pressable>
        ) : null}
        {isUndo && active ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={ui.button}
            onPress={submit}
            testID="cup-withdraw-undo"
          >
            <Text style={ui.buttonText}>{busy ? WITHDRAW_TEXT.undoPending : WITHDRAW_TEXT.undoButton}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={ui.buttonSecondary}
          onPress={leave}
          testID="cup-withdraw-cancel"
        >
          <Text style={ui.buttonSecondaryText}>{WITHDRAW_TEXT.cancelButton}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 16 },
  head: { paddingTop: 10, gap: 6, paddingBottom: 8 },
  title: { ...fraunces(500, 26, 30, { multiline: true }) },
  line: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  error: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, paddingTop: 4 },
  warning: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 8 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6, marginTop: 8 },
  cardLabel: { fontSize: 12, fontFamily: FONTS.sansSemiBold },
  choiceLabel: { marginBottom: 2 },
  body: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  small: { ...interLine(12, 16, { multiline: true }), fontFamily: FONTS.sans },
  actions: { paddingTop: 14 },
  failure: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderRadius: 22 },
  retryText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
