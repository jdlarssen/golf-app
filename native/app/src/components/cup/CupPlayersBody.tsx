// #2752: spillerlista i en cup, det nettets Spillere-rom gir: hvem som er påmeldt,
// lenka å dele og hvem du kan legge til. Samme liste i veiviseren og på skjermen
// `cup_signup` åpner. Kandidatene er serverens (`getCupCandidatePlayers`), og det er
// serveren som sjekker dem. En startet cup har en låst liste.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import type { AppCupEnrolled, AppCupParticipantsView } from '../../../../../lib/cup/appCupSetupView';
import { PICKER_VISIBLE_ROWS, pickerRows } from '../../../../../lib/league/pickerRows';
import { addCupParticipant, fetchCupParticipants } from '../../data/cupSetup';
import {
  hcpLine,
  participantFailureText,
  PLAYERS_TEXT,
  playerCountLine,
  SETUP_APP_TEXT,
  setupLoadFailureText,
} from '../../lib/cupSetupCopy';
import { cupJoinUrl } from '../../lib/cupJoinUrl';
import { ROUND_START_TEXT, showAllLine } from '../../lib/leagueCopy';
import { FONTS, fraunces, interLine, TAP, useTheme, withAlpha } from '../../theme';
import { PickerMore, PickerNoMatch, PickerSearchField } from '../PickerSearch';

/** Telefonens delingsark med lenka. Å lukke arket er ikke en feil. */
function shareLink(url: string | null) {
  if (!url) return;
  Share.share({ message: url }).catch((err: unknown) => {
    console.error('[CupPlayers] deling feilet', err);
  });
}

export function CupPlayersBody({
  cupId,
  notice,
  onRemove,
}: {
  cupId: string;
  /** Kvitteringen fra skjermen over, når en spiller nettopp er fjernet. */
  notice: string | null;
  onRemove: (player: AppCupEnrolled, cupName: string) => void;
}) {
  const { colors, ui } = useTheme();
  const [view, setView] = useState<AppCupParticipantsView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchCupParticipants(cupId);
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
      <View style={styles.center} testID="cup-players-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>{SETUP_APP_TEXT.loading}</Text>
      </View>
    );
  }
  if (view === null) {
    const final = failure === 'not_found' || failure === 'not_manager';
    return (
      <View style={styles.center} testID="cup-players-failed">
        <Text style={[styles.failure, { color: final ? colors.text : colors.danger }]}>
          {setupLoadFailureText(failure ?? 'load_failed')}
        </Text>
        {final ? null : (
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button"
            style={[styles.retry, { borderColor: colors.primary }]}
            testID="cup-players-retry"
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>{SETUP_APP_TEXT.retry}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const stale = failure !== null;
  const open = view.status === 'draft' && !stale;
  const url = cupJoinUrl(view.shortId);
  const addable = pickerRows(view.candidates, {
    query: search,
    showAll,
    nameOf: (candidate) => candidate.name,
  });
  const receipt = added ? PLAYERS_TEXT.added : notice;

  const add = async (userId: string) => {
    setBusy(userId);
    setError(null);
    setAdded(false);
    const result = await addCupParticipant(cupId, userId);
    if (result.ok) {
      setAdded(true);
      // Den du søkte etter, er lagt til. Står søket igjen, står det at ingen heter det.
      setSearch('');
    } else {
      setError(participantFailureText(result.reason, view.cap ?? 0));
    }
    await load();
    setBusy(null);
  };

  return (
    <View testID="cup-players">
      {stale ? <Note text={SETUP_APP_TEXT.needsNet} testID="cup-players-stale" /> : null}
      {view.status !== 'draft' ? <Note text={SETUP_APP_TEXT.listLocked} testID="cup-players-locked" /> : null}
      {receipt ? <Note text={receipt} testID="cup-players-notice" /> : null}
      {error ? (
        <Text style={[styles.error, { color: colors.danger }]} testID="cup-players-error">
          {error}
        </Text>
      ) : null}

      <Text accessibilityRole="header" style={[styles.heading, { color: colors.muted }]} testID="cup-players-count">
        {playerCountLine(view.participants.length, view.cap)}
      </Text>
      {view.participants.length === 0 ? <Note text={PLAYERS_TEXT.empty} testID="cup-players-empty" /> : null}
      {view.participants.map((player) => (
        <View
          key={player.userId}
          style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
          testID={`cup-player-${player.userId}`}
        >
          <View style={styles.text}>
            <Text style={[styles.name, { color: colors.text }]}>{player.name}</Text>
            <Text style={[styles.small, { color: colors.muted }]}>{hcpLine(player.hcpIndex)}</Text>
          </View>
          {open ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${PLAYERS_TEXT.remove}: ${player.name}`}
              disabled={busy !== null}
              onPress={() => {
                // Kvitteringen gjelder det du gjorde sist, og det er snart fjerningen.
                setAdded(false);
                setError(null);
                onRemove(player, view.name);
              }}
              style={styles.link}
              testID={`cup-player-remove-${player.userId}`}
            >
              <Text style={[styles.linkText, { color: colors.primary }]}>{PLAYERS_TEXT.remove}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      {open && url ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="cup-share">
          <Text style={[styles.cardTitle, { color: colors.text }]}>{PLAYERS_TEXT.shareHeading}</Text>
          <Text style={[styles.body, { color: colors.muted }]}>{PLAYERS_TEXT.shareHelper}</Text>
          <Pressable
            accessibilityRole="button"
            style={ui.buttonSecondary}
            onPress={() => shareLink(url)}
            testID="cup-share-button"
          >
            <Text style={ui.buttonSecondaryText}>{SETUP_APP_TEXT.share}</Text>
          </Pressable>
        </View>
      ) : null}

      {open ? (
        <>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.muted }]}>
            {PLAYERS_TEXT.addHeading}
          </Text>
          {view.candidates.length === 0 ? (
            <Note
              text={view.participants.length > 0 ? PLAYERS_TEXT.allAdded : PLAYERS_TEXT.emptyCandidates}
              testID="cup-players-no-candidates"
            />
          ) : null}
          {view.candidates.length > PICKER_VISIBLE_ROWS ? (
            <PickerSearchField
              value={search}
              onChange={setSearch}
              label={ROUND_START_TEXT.searchPlaceholder}
              placeholder={ROUND_START_TEXT.searchPlaceholder}
              testID="cup-players-search"
            />
          ) : null}
          {addable.rows.map((candidate) => (
            <View
              key={candidate.userId}
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
              testID={`cup-candidate-${candidate.userId}`}
            >
              <View style={styles.text}>
                <Text style={[styles.name, { color: colors.text }]}>{candidate.name}</Text>
                <Text style={[styles.small, { color: colors.muted }]}>
                  {candidate.pending ? PLAYERS_TEXT.pendingBadge : hcpLine(candidate.hcpIndex)}
                </Text>
              </View>
              {candidate.pending ? null : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${PLAYERS_TEXT.add}: ${candidate.name}`}
                  disabled={busy !== null}
                  onPress={() => void add(candidate.userId)}
                  style={styles.link}
                  testID={`cup-candidate-add-${candidate.userId}`}
                >
                  <Text style={[styles.linkText, { color: colors.primary }]}>{PLAYERS_TEXT.add}</Text>
                </Pressable>
              )}
            </View>
          ))}
          {addable.searching && addable.total === 0 ? (
            <PickerNoMatch text={ROUND_START_TEXT.noMatch} testID="cup-players-no-match" />
          ) : null}
          {addable.canExpand ? (
            <PickerMore
              label={showAll ? ROUND_START_TEXT.showFewer : showAllLine(addable.total)}
              expanded={showAll}
              onPress={() => setShowAll((value) => !value)}
              testID="cup-players-show-all"
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function Note({ text, testID }: { text: string; testID: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.note,
        { backgroundColor: withAlpha(colors.accent, 0.14), borderColor: withAlpha(colors.accent, 0.5) },
      ]}
      testID={testID}
    >
      <Text style={[styles.noteText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 24, alignItems: 'center', gap: 10 },
  heading: { fontSize: 12, fontFamily: FONTS.sansSemiBold, marginTop: 16, marginBottom: 6 },
  note: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 4, marginBottom: 8 },
  noteText: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  error: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, paddingTop: 4 },
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
  text: { flex: 1, gap: 2 },
  name: { ...fraunces(500, 15, 20, { multiline: true }) },
  small: { ...interLine(12, 16), fontFamily: FONTS.sans },
  body: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  link: { minHeight: TAP, justifyContent: 'center' },
  linkText: { fontSize: 13, fontFamily: FONTS.sansMedium, textDecorationLine: 'underline' },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8, marginTop: 8 },
  cardTitle: { fontSize: 12, fontFamily: FONTS.sansSemiBold },
  failure: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderRadius: 22 },
  retryText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
