// #2752: «Bytt spiller» i en cup-kamp, det nettets `SwapMatchPlayer` gjør. Hvem går
// ut, hvem går inn, og en linje som sier hva som skjer før du trykker. På en delt
// dag byttes hele bunten (#1441 D3). Lista er hjelp, vakta er `validateMatchSwap`
// på serveren, så en feil her er serverens ord.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AppCupSwapCandidates } from '../../../../lib/cup/appCupManageView';
import { PICKER_VISIBLE_ROWS, pickerRows } from '../../../../lib/league/pickerRows';
import { CupOption } from '../components/cup/CupOption';
import { KEYBOARD_SCROLL_PROPS, useBottomInsetUnlessKeyboard } from '../components/KeyboardInset';
import { PickerMore, PickerNoMatch, PickerSearchField } from '../components/PickerSearch';
import { fetchCupSwapCandidates, swapCupPlayer } from '../data/cupManage';
import { backTo } from '../lib/backTo';
import { CUP_TEXT } from '../lib/cupCopy';
import {
  MANAGE_APP_TEXT,
  SWAP_TEXT,
  manageLoadFailureText,
  swapFailureText,
} from '../lib/cupManageCopy';
import { formatMessage } from '../lib/kavalkadeCopy';
import { ROUND_START_TEXT, showAllLine } from '../lib/leagueCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../theme';

export function CupSwapPlayer({ route, navigation }: ScreenProps<'CupSwapPlayer'>) {
  const { colors, ui } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();
  const { cupId, gameId } = route.params;
  const [view, setView] = useState<AppCupSwapCandidates | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [outId, setOutId] = useState<string | null>(null);
  const [inId, setInId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchCupSwapCandidates(cupId, gameId);
    if (result.ok) {
      setView(result.view);
      setFailure(null);
      // Som nettets nedtrekk: den første står valgt, og et valg som er borte faller ut.
      setOutId((current) =>
        result.view.out.some((option) => option.userId === current)
          ? current
          : (result.view.out[0]?.userId ?? null),
      );
      setInId((current) =>
        result.view.in.some((option) => option.userId === current)
          ? current
          : (result.view.in[0]?.userId ?? null),
      );
    } else {
      setFailure(result.reason);
    }
  }, [cupId, gameId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (view === null) {
    if (failure === null) {
      return (
        <View style={ui.centered} testID="cup-swap-loading">
          <ActivityIndicator color={colors.primary} />
          <Text style={ui.muted}>{MANAGE_APP_TEXT.loading}</Text>
        </View>
      );
    }
    return (
      <View style={ui.centered} testID="cup-swap-failed">
        <Text style={[styles.failure, { color: colors.text }]}>{manageLoadFailureText(failure)}</Text>
        <Pressable
          onPress={() => void load()}
          accessibilityRole="button"
          style={[styles.retry, { borderColor: colors.primary }]}
          testID="cup-swap-retry"
        >
          <Text style={[styles.retryText, { color: colors.primary }]}>{MANAGE_APP_TEXT.retry}</Text>
        </Pressable>
      </View>
    );
  }

  const outPlayer = view.out.find((option) => option.userId === outId);
  const inPlayer = view.in.find((option) => option.userId === inId);
  const ready = view.canSwap && outPlayer !== undefined && inPlayer !== undefined;
  // En global admin kan velge blant alle, så lista er den samme velgeren som
  // medspillere og markør: noen rader, «Vis alle» og søk. Den valgte står i lista.
  const reserves = pickerRows(view.in, {
    query: search,
    showAll,
    nameOf: (option) => option.name,
    keepIds: new Set(inId ? [inId] : []),
  });

  const submit = async () => {
    if (!outId || !inId) return;
    setBusy(true);
    setError(null);
    const result = await swapCupPlayer(cupId, gameId, outId, inId);
    if (result.ok) {
      backTo(navigation, 'CupManage', { cupId, notice: 'player_swapped' });
      return;
    }
    setError(swapFailureText(result.reason));
    setBusy(false);
    void load();
  };

  return (
    <ScrollView
      {...KEYBOARD_SCROLL_PROPS}
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg, paddingBottom: bottomInset + 24 }]}
      testID="cup-swap-screen"
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" testID="cup-swap-label">
          {view.label ?? CUP_TEXT.matchFallback}
        </Text>
        <Text style={[styles.line, { color: colors.muted }]}>
          {view.side1} {CUP_TEXT.mot} {view.side2}
        </Text>
      </View>

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]} testID="cup-swap-error">
          {error}
        </Text>
      ) : null}

      {!view.canSwap ? (
        <View style={[styles.note, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="cup-swap-closed">
          <Text style={[styles.noteText, { color: colors.muted }]}>{swapFailureText('already_started')}</Text>
        </View>
      ) : view.in.length === 0 ? (
        <View style={[styles.note, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="cup-swap-no-reserves">
          <Text style={[styles.noteText, { color: colors.muted }]}>{SWAP_TEXT.noReserves}</Text>
        </View>
      ) : (
        <>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.muted }]}>
            {SWAP_TEXT.outLabel}
          </Text>
          {view.out.map((option) => (
            <CupOption
              key={option.userId}
              label={option.name}
              detail={option.teamName}
              selected={option.userId === outId}
              disabled={busy}
              onPress={() => setOutId(option.userId)}
              testID={`cup-swap-out-${option.userId}`}
            />
          ))}
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.muted }]}>
            {SWAP_TEXT.inLabel}
          </Text>
          {view.in.length > PICKER_VISIBLE_ROWS ? (
            <PickerSearchField
              value={search}
              onChange={setSearch}
              label={ROUND_START_TEXT.searchPlaceholder}
              placeholder={ROUND_START_TEXT.searchPlaceholder}
              testID="cup-swap-search"
            />
          ) : null}
          {reserves.rows.map((option) => (
            <CupOption
              key={option.userId}
              label={option.name}
              selected={option.userId === inId}
              disabled={busy}
              onPress={() => setInId(option.userId)}
              testID={`cup-swap-in-${option.userId}`}
            />
          ))}
          {reserves.searching && reserves.total === 0 ? (
            <PickerNoMatch text={ROUND_START_TEXT.noMatch} testID="cup-swap-no-match" />
          ) : null}
          {reserves.canExpand ? (
            <PickerMore
              label={showAll ? ROUND_START_TEXT.showFewer : showAllLine(reserves.total)}
              expanded={showAll}
              onPress={() => setShowAll((value) => !value)}
              testID="cup-swap-show-all"
            />
          ) : null}
          {ready ? (
            <View style={[styles.note, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="cup-swap-summary">
              <Text style={[styles.noteText, { color: colors.muted }]}>
                {formatMessage(MANAGE_APP_TEXT.swapSummary, { in: inPlayer.name, out: outPlayer.name })}
                {view.bundled ? ` ${MANAGE_APP_TEXT.swapBundled}` : ''}
              </Text>
            </View>
          ) : null}
        </>
      )}

      <View style={styles.actions}>
        {ready ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={ui.button}
            onPress={() => void submit()}
            testID="cup-swap-submit"
          >
            <Text style={ui.buttonText}>{busy ? SWAP_TEXT.submitPending : SWAP_TEXT.submitButton}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={ui.buttonSecondary}
          onPress={() => backTo(navigation, 'CupManage', { cupId })}
          testID="cup-swap-cancel"
        >
          <Text style={ui.buttonSecondaryText}>{SWAP_TEXT.cancelButton}</Text>
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
  heading: { fontSize: 12, fontFamily: FONTS.sansSemiBold, marginTop: 16, marginBottom: 6 },
  note: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 8 },
  noteText: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  actions: { paddingTop: 14 },
  failure: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderRadius: 22 },
  retryText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
