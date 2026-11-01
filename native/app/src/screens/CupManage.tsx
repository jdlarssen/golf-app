// #2752: «Styr cupen», det nettets `CupManagement` og `CupMatchList` gir arrangøren
// underveis: valg som venter, spillerne med trekk og angring, og kampene som ikke
// har startet med «Bytt spiller».
//
// Alt kommer fra `GET /api/cup/[id]/manage`, og skjermen regner ingenting selv.
// Trekk, angring og bytte har egne skjermer med konsekvensene før du trykker. Alt
// krever nett: uten nett står det skjermen alt har hentet, uten lenkene.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  AppCupManageMatch,
  AppCupManagePlayer,
  AppCupManageView,
} from '../../../../lib/cup/appCupManageView';
import { fetchCupManage, setCupPlayOn } from '../data/cupManage';
import { openOrReturn } from '../lib/backTo';
import { CUP_TEXT } from '../lib/cupCopy';
import {
  MANAGE_APP_TEXT,
  MANAGE_TEXT,
  WITHDRAW_TEXT,
  manageLoadFailureText,
  manageMatchStatus,
  manageNoticeText,
  withdrawFailureText,
} from '../lib/cupManageCopy';
import { formatMessage } from '../lib/kavalkadeCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../theme';

export function CupManage(props: ScreenProps<'CupManage'>) {
  return <CupManageRoom key={props.route.params.cupId} {...props} />;
}

function CupManageRoom({ route, navigation }: ScreenProps<'CupManage'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { cupId, notice } = route.params;
  const [view, setView] = useState<AppCupManageView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Kvitteringen etter et trekk eller et bytte, nullstilt når siden mister fokus.
  useEffect(
    () =>
      navigation.addListener('blur', () => {
        navigation.setParams({ notice: undefined });
        setSaved(false);
      }),
    [navigation],
  );

  const load = useCallback(async () => {
    const result = await fetchCupManage(cupId);
    if (result.ok) {
      setView(result.view);
      setFailure(null);
    } else {
      // Har du ikke lenger tilgang, skal det skjermen hadde, ikke stå igjen.
      if (result.reason === 'not_found' || result.reason === 'not_manager') setView(null);
      setFailure(result.reason);
    }
    setPulling(false);
  }, [cupId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const choose = async (gameId: string, playOn: boolean) => {
    setSaving(gameId);
    setSaveError(null);
    setSaved(false);
    const result = await setCupPlayOn(cupId, gameId, playOn);
    if (result.ok) {
      setSaved(true);
      await load();
    } else {
      setSaveError(withdrawFailureText(result.reason));
    }
    setSaving(null);
  };

  if (view === null && failure === null) {
    return (
      <View style={ui.centered} testID="cup-manage-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>{MANAGE_APP_TEXT.loading}</Text>
      </View>
    );
  }
  if (view === null) {
    const final = failure === 'not_found' || failure === 'not_manager';
    return (
      <View style={ui.centered} testID="cup-manage-failed">
        <Text style={[styles.failure, { color: final ? colors.text : colors.danger }]}>
          {manageLoadFailureText(failure ?? 'load_failed')}
        </Text>
        {final ? null : (
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button"
            style={[styles.retry, { borderColor: colors.primary }]}
            testID="cup-manage-retry"
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>{MANAGE_APP_TEXT.retry}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const stale = failure !== null;
  const pending = view.matches.filter((match) => match.choice?.pending === true);
  const noticeText = notice ? manageNoticeText(notice) : saved ? MANAGE_TEXT.playOnSaved : null;
  const teams = [
    { team: 1 as const, name: view.team1Name },
    { team: 2 as const, name: view.team2Name },
  ];

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 24 }]}
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={() => {
            setPulling(true);
            void load();
          }}
          tintColor={colors.primary}
        />
      }
      testID="cup-manage-screen"
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" testID="cup-manage-name">
          {view.name}
        </Text>
        <Text style={[styles.line, { color: colors.muted }]}>
          {view.team1Name} {CUP_TEXT.mot} {view.team2Name}
        </Text>
      </View>

      {noticeText ? <Note text={noticeText} testID="cup-manage-notice" /> : null}
      {stale ? <Note text={MANAGE_APP_TEXT.stale} testID="cup-manage-stale" /> : null}
      {saveError ? (
        <Text style={[styles.error, { color: colors.danger }]} testID="cup-manage-error">
          {saveError}
        </Text>
      ) : null}

      {pending.length > 0 ? (
        <View testID="cup-manage-pending">
          <Heading text={MANAGE_TEXT.playOnPendingHeading} />
          {pending.map((match) => (
            <PendingChoice
              key={match.gameId}
              match={match}
              disabled={stale || saving !== null}
              onChoose={(playOn) => void choose(match.gameId, playOn)}
            />
          ))}
        </View>
      ) : null}

      {teams.map(({ team, name }) => {
        const players = view.players.filter((player) => player.team === team);
        if (players.length === 0) return null;
        return (
          <View key={team} testID={`cup-manage-team-${team}`}>
            <Heading text={`${MANAGE_APP_TEXT.playersHeading} · ${name}`} />
            {players.map((player) => (
              <PlayerRow
                key={player.userId}
                player={player}
                showLink={!stale}
                onPress={() =>
                  openOrReturn(navigation, 'CupWithdraw', { cupId, userId: player.userId })
                }
              />
            ))}
          </View>
        );
      })}

      <Heading text={MANAGE_APP_TEXT.matchesHeading} />
      {view.matches.length === 0 ? (
        <Note text={MANAGE_APP_TEXT.noMatches} testID="cup-manage-no-matches" />
      ) : (
        view.matches.map((match) => (
          <MatchRow
            key={match.gameId}
            match={match}
            stale={stale}
            disabled={saving !== null}
            onSwap={() => openOrReturn(navigation, 'CupSwapPlayer', { cupId, gameId: match.gameId })}
            onToggle={(playOn) => void choose(match.gameId, playOn)}
          />
        ))
      )}
    </ScrollView>
  );
}

function PendingChoice({
  match,
  disabled,
  onChoose,
}: {
  match: AppCupManageMatch;
  disabled: boolean;
  onChoose: (playOn: boolean) => void;
}) {
  const { colors, ui } = useTheme();
  const partner = match.choice?.partnerName ?? '';
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={`cup-manage-choice-${match.gameId}`}
    >
      <Text style={[styles.cardLabel, { color: colors.muted }]}>{match.label ?? CUP_TEXT.matchFallback}</Text>
      <Text style={[styles.cardBody, { color: colors.text }]}>
        {formatMessage(MANAGE_APP_TEXT.playOnQuestion, { partner })}
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        style={ui.buttonSecondary}
        onPress={() => onChoose(true)}
        testID={`cup-manage-choice-yes-${match.gameId}`}
      >
        <Text style={ui.buttonSecondaryText}>{formatMessage(WITHDRAW_TEXT.playOnYes, { partner })}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        style={ui.buttonSecondary}
        onPress={() => onChoose(false)}
        testID={`cup-manage-choice-no-${match.gameId}`}
      >
        <Text style={ui.buttonSecondaryText}>{WITHDRAW_TEXT.playOnNo}</Text>
      </Pressable>
      <Text style={[styles.small, { color: colors.muted }]}>{WITHDRAW_TEXT.playOnHelp}</Text>
    </View>
  );
}

function PlayerRow({
  player,
  showLink,
  onPress,
}: {
  player: AppCupManagePlayer;
  showLink: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const link = player.withdrawn ? MANAGE_TEXT.undoWithdrawLink : MANAGE_TEXT.withdrawLink;
  return (
    <View
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={`cup-manage-player-${player.userId}`}
    >
      <Text style={[styles.name, { color: colors.text }]}>{player.name}</Text>
      {player.withdrawn ? (
        <View style={[styles.chip, { borderColor: colors.border }]}>
          <Text style={[styles.chipText, { color: colors.muted }]}>{MANAGE_TEXT.withdrawnChip}</Text>
        </View>
      ) : null}
      {player.canAct && showLink ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${link}: ${player.name}`}
          onPress={onPress}
          style={styles.link}
          testID={`cup-manage-withdraw-${player.userId}`}
        >
          <Text style={[styles.linkText, { color: colors.primary }]}>{link}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MatchRow({
  match,
  stale,
  disabled,
  onSwap,
  onToggle,
}: {
  match: AppCupManageMatch;
  stale: boolean;
  disabled: boolean;
  onSwap: () => void;
  onToggle: (playOn: boolean) => void;
}) {
  const { colors } = useTheme();
  const decided = match.choice && !match.choice.pending ? match.choice : null;
  return (
    <View
      style={[styles.matchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={`cup-manage-match-${match.gameId}`}
    >
      <View style={styles.matchTop}>
        <View style={styles.text}>
          <Text style={[styles.cardLabel, { color: colors.muted }]}>{match.label ?? CUP_TEXT.matchFallback}</Text>
          <Text style={[styles.name, { color: colors.text }]}>
            {match.side1} <Text style={[styles.mot, { color: colors.muted }]}>{CUP_TEXT.mot}</Text> {match.side2}
          </Text>
          {match.status === 'notStarted' ? null : (
            <Text style={[styles.small, { color: colors.muted }]} testID={`cup-manage-status-${match.gameId}`}>
              {manageMatchStatus(match)}
            </Text>
          )}
        </View>
        {match.canSwap && !stale ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSwap}
            style={styles.link}
            testID={`cup-manage-swap-${match.gameId}`}
          >
            <Text style={[styles.linkText, { color: colors.primary }]}>{MANAGE_APP_TEXT.swapLink}</Text>
          </Pressable>
        ) : null}
      </View>
      {decided && !stale ? (
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => onToggle(!decided.playOn)}
          style={styles.link}
          testID={`cup-manage-choice-toggle-${match.gameId}`}
        >
          <Text style={[styles.linkText, { color: colors.primary }]}>
            {decided.playOn
              ? WITHDRAW_TEXT.playOnNo
              : formatMessage(WITHDRAW_TEXT.playOnYes, { partner: decided.partnerName })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Heading({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.muted }]}>
      {text}
    </Text>
  );
}

function Note({ text, testID }: { text: string; testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.note, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={testID}>
      <Text style={[styles.noteText, { color: colors.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 16 },
  head: { paddingTop: 10, gap: 6, paddingBottom: 8 },
  title: { ...fraunces(500, 26, 30, { multiline: true }) },
  line: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  note: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 4, marginBottom: 4 },
  noteText: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  error: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, paddingTop: 4 },
  heading: { fontSize: 12, fontFamily: FONTS.sansSemiBold, marginTop: 16, marginBottom: 6 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4, marginBottom: 8 },
  cardLabel: { fontSize: 12, fontFamily: FONTS.sansSemiBold },
  cardBody: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  small: { ...interLine(12, 16, { multiline: true }), fontFamily: FONTS.sans, marginTop: 4 },
  row: {
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  matchRow: { minHeight: TAP, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  matchTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { flex: 1, gap: 2 },
  name: { flexShrink: 1, flexGrow: 1, ...fraunces(500, 15, 20, { multiline: true }) },
  mot: { fontSize: 12, fontFamily: FONTS.sans },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  chipText: { fontSize: 11, fontFamily: FONTS.sansSemiBold },
  link: { minHeight: TAP, justifyContent: 'center' },
  linkText: { fontSize: 13, fontFamily: FONTS.sansMedium, textDecorationLine: 'underline' },
  failure: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderRadius: 22 },
  retryText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
