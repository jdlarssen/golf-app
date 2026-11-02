// #2752: registrering av sidepoeng, det nettets `SideAwardsPanel` gir etter runden.
// Vinner per plass, eller «Ingen kvalifiserte», og et tall per lag for GIR. Virker
// også etter at cupen er avsluttet, og da regner serveren vinneren på nytt. Alt
// krever nett, og reglene bor i kjernen (`lib/cup/sideAwardCore.ts`).
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AppCupManageView, AppCupSideAward } from '../../../../lib/cup/appCupManageView';
import { PICKER_VISIBLE_ROWS, pickerRows } from '../../../../lib/league/pickerRows';
import { CupOption } from '../components/cup/CupOption';
import { KEYBOARD_SCROLL_PROPS, useBottomInsetUnlessKeyboard } from '../components/KeyboardInset';
import { PickerMore, PickerNoMatch, PickerSearchField } from '../components/PickerSearch';
import { fetchCupManage, registerGirCounts, registerSideAwardWinner } from '../data/cupManage';
import {
  FINISH_APP_TEXT,
  MANAGE_APP_TEXT,
  SIDE_AWARD_TEXT,
  manageLoadFailureText,
  sideAwardFailureText,
  sideAwardTitle,
} from '../lib/cupManageCopy';
import { formatMessage } from '../lib/kavalkadeCopy';
import { ROUND_START_TEXT, showAllLine } from '../lib/leagueCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../theme';

type Candidate = { userId: string; name: string; teamName: string };
type WinnerAward = Extract<AppCupSideAward, { kind: 'ctp' | 'ld' }>;
type GirAward = Extract<AppCupSideAward, { kind: 'gir' }>;

/** «Ingen kvalifiserte». Kan aldri kollidere med en uuid, som på nettet. */
const NONE = 'none';

export function CupSideAwards({ route }: ScreenProps<'CupSideAwards'>) {
  const { colors, ui } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();
  const { cupId } = route.params;
  const [view, setView] = useState<AppCupManageView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchCupManage(cupId);
    if (result.ok) {
      setView(result.view);
      setFailure(null);
    } else {
      if (result.reason === 'not_found' || result.reason === 'not_manager') setView(null);
      setFailure(result.reason);
    }
  }, [cupId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (view === null && failure === null) {
    return (
      <View style={ui.centered} testID="cup-side-awards-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>{MANAGE_APP_TEXT.loading}</Text>
      </View>
    );
  }
  if (view === null) {
    const final = failure === 'not_found' || failure === 'not_manager';
    return (
      <View style={ui.centered} testID="cup-side-awards-failed">
        <Text style={[styles.failure, { color: final ? colors.text : colors.danger }]}>
          {manageLoadFailureText(failure ?? 'load_failed')}
        </Text>
        {final ? null : (
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button"
            style={[styles.retry, { borderColor: colors.primary }]}
            testID="cup-side-awards-retry"
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>{MANAGE_APP_TEXT.retry}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const stale = failure !== null;
  const candidates: Candidate[] = view.players.map((player) => ({
    userId: player.userId,
    name: player.name,
    teamName: player.team === 1 ? view.team1Name : view.team2Name,
  }));

  return (
    <ScrollView
      {...KEYBOARD_SCROLL_PROPS}
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg, paddingBottom: bottomInset + 24 }]}
      testID="cup-side-awards-screen"
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" testID="cup-side-awards-name">
          {view.name}
        </Text>
      </View>

      {stale ? <Note text={FINISH_APP_TEXT.stale} testID="cup-side-awards-stale" /> : null}
      {view.status === 'finished' ? (
        <Note text={SIDE_AWARD_TEXT.finishedHint} testID="cup-side-awards-finished" />
      ) : null}
      {view.sideAwards.length === 0 ? <Note text={SIDE_AWARD_TEXT.empty} testID="cup-side-awards-empty" /> : null}

      {view.sideAwards.map((award) =>
        award.kind === 'gir' ? (
          <GirCard
            key={award.id}
            cupId={cupId}
            award={award}
            team1Name={view.team1Name}
            team2Name={view.team2Name}
            stale={stale}
            onSaved={load}
          />
        ) : (
          <WinnerCard
            key={award.id}
            cupId={cupId}
            award={award}
            candidates={candidates}
            stale={stale}
            onSaved={load}
          />
        ),
      )}
    </ScrollView>
  );
}

function WinnerCard({
  cupId,
  award,
  candidates,
  stale,
  onSaved,
}: {
  cupId: string;
  award: WinnerAward;
  candidates: readonly Candidate[];
  stale: boolean;
  onSaved: () => Promise<void>;
}) {
  const { colors, ui } = useTheme();
  const [choice, setChoice] = useState(award.noWinner ? NONE : (award.winnerUserId ?? ''));
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const rows = pickerRows(candidates, {
    query: search,
    showAll,
    nameOf: (candidate) => candidate.name,
    keepIds: new Set(choice && choice !== NONE ? [choice] : []),
  });

  const pick = (value: string) => {
    setChoice(value);
    setSaved(false);
    setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await registerSideAwardWinner(cupId, award.id, choice === NONE ? null : choice);
    if (result.ok) {
      setSaved(true);
      await onSaved();
    } else {
      setError(sideAwardFailureText(result.reason));
    }
    setBusy(false);
  };

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={`side-award-${award.id}`}
    >
      <Text style={[styles.cardTitle, { color: colors.text }]} accessibilityRole="header">
        {sideAwardTitle(award)}
      </Text>
      {candidates.length > PICKER_VISIBLE_ROWS ? (
        <PickerSearchField
          value={search}
          onChange={setSearch}
          label={ROUND_START_TEXT.searchPlaceholder}
          placeholder={ROUND_START_TEXT.searchPlaceholder}
          testID={`side-award-search-${award.id}`}
        />
      ) : null}
      {rows.rows.map((candidate) => (
        <CupOption
          key={candidate.userId}
          label={candidate.name}
          detail={candidate.teamName}
          selected={choice === candidate.userId}
          disabled={busy}
          onPress={() => pick(candidate.userId)}
          testID={`side-award-option-${award.id}-${candidate.userId}`}
        />
      ))}
      {rows.searching && rows.total === 0 ? (
        <PickerNoMatch text={ROUND_START_TEXT.noMatch} testID={`side-award-no-match-${award.id}`} />
      ) : null}
      {rows.canExpand ? (
        <PickerMore
          label={showAll ? ROUND_START_TEXT.showFewer : showAllLine(rows.total)}
          expanded={showAll}
          onPress={() => setShowAll((value) => !value)}
          testID={`side-award-show-all-${award.id}`}
        />
      ) : null}
      <CupOption
        label={SIDE_AWARD_TEXT.none}
        selected={choice === NONE}
        disabled={busy}
        onPress={() => pick(NONE)}
        testID={`side-award-option-${award.id}-none`}
      />
      <Pressable
        accessibilityRole="button"
        disabled={!choice || busy || stale}
        style={[ui.buttonSecondary, !choice || stale ? styles.dimmed : null]}
        onPress={() => void submit()}
        testID={`side-award-register-${award.id}`}
      >
        <Text style={ui.buttonSecondaryText}>
          {busy ? SIDE_AWARD_TEXT.registerPending : SIDE_AWARD_TEXT.register}
        </Text>
      </Pressable>
      {error ? (
        <Text style={[styles.small, { color: colors.danger }]} testID={`side-award-error-${award.id}`}>
          {error}
        </Text>
      ) : null}
      {saved && !error ? (
        <Text style={[styles.small, { color: colors.primary }]} testID={`side-award-saved-${award.id}`}>
          {choice === NONE ? SIDE_AWARD_TEXT.registeredNone : SIDE_AWARD_TEXT.registered}
        </Text>
      ) : null}
    </View>
  );
}

function GirCard({
  cupId,
  award,
  team1Name,
  team2Name,
  stale,
  onSaved,
}: {
  cupId: string;
  award: GirAward;
  team1Name: string;
  team2Name: string;
  stale: boolean;
  onSaved: () => Promise<void>;
}) {
  const { colors, ui } = useTheme();
  const [team1, setTeam1] = useState(award.team1Count === null ? '' : String(award.team1Count));
  const [team2, setTeam2] = useState(award.team2Count === null ? '' : String(award.team2Count));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const filled = team1 !== '' && team2 !== '';

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await registerGirCounts(cupId, award.id, Number(team1), Number(team2));
    if (result.ok) {
      setSaved(true);
      await onSaved();
    } else {
      setError(sideAwardFailureText(result.reason, award.maxPerTeam));
    }
    setBusy(false);
  };

  const field = (team: 1 | 2, name: string, value: string, set: (next: string) => void) => {
    const label = formatMessage(SIDE_AWARD_TEXT.girCount, { team: name });
    return (
      <View style={styles.girField}>
        <Text style={[styles.girLabel, { color: colors.muted }]}>{label}</Text>
        <View style={styles.girRow}>
          <TextInput
            value={value}
            onChangeText={(next) => {
              set(next.replace(/\D/g, ''));
              setSaved(false);
              setError(null);
            }}
            editable={!busy}
            keyboardType="number-pad"
            accessibilityLabel={label}
            maxLength={3}
            style={[styles.girInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
            testID={`gir-count-${team}-${award.id}`}
          />
          <Text style={[styles.girOf, { color: colors.muted }]}>
            {formatMessage(FINISH_APP_TEXT.girOfMax, { max: award.maxPerTeam })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={`side-award-${award.id}`}
    >
      <Text style={[styles.cardTitle, { color: colors.text }]} accessibilityRole="header">
        {sideAwardTitle(award)}
      </Text>
      {field(1, team1Name, team1, setTeam1)}
      {field(2, team2Name, team2, setTeam2)}
      <Pressable
        accessibilityRole="button"
        disabled={!filled || busy || stale}
        style={[ui.buttonSecondary, !filled || stale ? styles.dimmed : null]}
        onPress={() => void submit()}
        testID={`side-award-register-${award.id}`}
      >
        <Text style={ui.buttonSecondaryText}>
          {busy ? SIDE_AWARD_TEXT.registerPending : SIDE_AWARD_TEXT.register}
        </Text>
      </Pressable>
      {error ? (
        <Text style={[styles.small, { color: colors.danger }]} testID={`side-award-error-${award.id}`}>
          {error}
        </Text>
      ) : null}
      {saved && !error ? (
        <Text style={[styles.small, { color: colors.primary }]} testID={`side-award-saved-${award.id}`}>
          {SIDE_AWARD_TEXT.girRegistered}
        </Text>
      ) : null}
    </View>
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
  note: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 4, marginBottom: 8 },
  noteText: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8, marginTop: 8 },
  cardTitle: { ...interLine(14, 20, { multiline: true }), fontFamily: FONTS.sansSemiBold },
  small: { ...interLine(12, 16, { multiline: true }), fontFamily: FONTS.sans },
  dimmed: { opacity: 0.45 },
  girField: { gap: 4 },
  girLabel: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  girRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  girInput: {
    minHeight: TAP,
    width: 72,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    fontFamily: FONTS.sans,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  girOf: { ...interLine(13, 18), fontFamily: FONTS.sans },
  failure: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderRadius: 22 },
  retryText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
