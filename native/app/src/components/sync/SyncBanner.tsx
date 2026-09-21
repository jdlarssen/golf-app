// native/app/src/components/sync/SyncBanner.tsx
// Native #1980: slag som strander i køen skal synes i butikkbygget.
//
// Karantene-radene (#668) og konfliktradene skrives av `syncWorker`/`realtime`,
// men den eneste flaten som leste dem var Sync-laben, som bare finnes i
// staging-bygget. Et slag som aldri kom fram var dermed usynlig for spilleren.
// Dette er speilet av webbens `components/sync/SyncBanner.tsx` i den scopede
// formen (ett spill): hullene navngis, feilteksten vises, «Prøv igjen» drainer,
// og «Fjern varselet» spør først. Konfliktvarslene avvises ett og ett.
//
// Oppsummeringen er webbens egen (`lib/sync/quarantineSummary.ts`) — én regel
// for hvilke hull som står fast, ett hjem. Aldri gatet på `isStagingBuild()`.
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { isActiveForGame } from '../../../../../lib/sync/queueScope';
import { summarizeQuarantine } from '../../../../../lib/sync/quarantineSummary';
import {
  deleteConflict,
  deleteQueueItem,
  getDb,
  listConflictsForGame,
  listQueue,
  type ConflictRecord,
  type SyncQueueItem,
} from '../../data/db';
import { drainQueue } from '../../data/syncWorker';
import {
  SYNC_BANNER_TEXT,
  abandonedText,
  conflictText,
  quarantineHolesText,
  quarantineOtherGameText,
} from '../../lib/syncBannerCopy';
import { FONTS, TAP, useTheme } from '../../theme';

/** Samme takt som hull-skjermens SQLite-lesing. */
const POLL_MS = 1500;
/** Webbens `RETRY_MIN_FEEDBACK_MS`: «Sender…» skal rekke å synes. */
const RETRY_MIN_FEEDBACK_MS = 500;

export function SyncBanner({ gameId }: { gameId: string }) {
  const { colors } = useTheme();
  const [queue, setQueue] = useState<SyncQueueItem[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [retrying, setRetrying] = useState(false);

  const reload = useCallback(async () => {
    try {
      const db = await getDb();
      // Sekvensielt: én forbindelse, én setning om gangen.
      const nextQueue = await listQueue(db);
      const nextConflicts = await listConflictsForGame(db, gameId);
      setQueue(nextQueue);
      setConflicts(nextConflicts);
    } catch {
      // En base som ikke svarer skal ikke velte skjermen; neste runde prøver igjen.
    }
  }, [gameId]);

  // Førstelesningen skrives inn her og ikke via `reload`, samme grep som
  // `useLocalScores`: en skjerm som er borte før SQLite svarer, får ingen state.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const db = await getDb();
        const nextQueue = await listQueue(db);
        const nextConflicts = await listConflictsForGame(db, gameId);
        if (cancelled) return;
        setQueue(nextQueue);
        setConflicts(nextConflicts);
      } catch {
        // Som i `reload`.
      }
    })();
    const interval = setInterval(() => {
      void reload();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [gameId, reload]);

  const abandoned = queue.filter((i) => i.abandonedAt != null);
  const active = queue.filter((i) => isActiveForGame(i, gameId));

  if (abandoned.length === 0 && conflicts.length === 0) return null;

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    await Promise.all([
      drainQueue('prøv igjen').catch(() => undefined),
      new Promise((r) => setTimeout(r, RETRY_MIN_FEEDBACK_MS)),
    ]);
    setRetrying(false);
    await reload();
  };

  // Bare id-ene som sto i karantene da varselet ble tegnet: et slag som
  // fortsatt prøver, blir aldri feid med.
  const dismissQuarantine = () => {
    const ids = abandoned.map((i) => i.id);
    Alert.alert(SYNC_BANNER_TEXT.quarantineDismiss, SYNC_BANNER_TEXT.quarantineDismissConfirm, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: SYNC_BANNER_TEXT.quarantineDismiss,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              const db = await getDb();
              for (const id of ids) await deleteQueueItem(db, id);
            } catch {
              // Varselet blir stående; neste trykk prøver igjen.
            }
            await reload();
          })();
        },
      },
    ]);
  };

  const dismissConflict = async (id: string) => {
    try {
      const db = await getDb();
      await deleteConflict(db, id);
    } catch {
      // Som over: varselet blir stående.
    }
    await reload();
  };

  const summary = abandoned.length > 0 ? summarizeQuarantine(queue, gameId) : null;
  const tone = { borderColor: colors.danger, backgroundColor: colors.surface };
  const actionStyle = [styles.action, { borderColor: colors.danger }];
  const actionText = [styles.actionText, { color: colors.danger }];

  return (
    <View style={styles.stack} accessibilityRole="alert" testID="sync-banner">
      {summary && (
        <View style={[styles.box, tone]} testID="quarantine-banner">
          {summary.currentGame && (
            <Text style={[styles.message, { color: colors.danger }]} testID="quarantine-holes">
              {quarantineHolesText(summary.currentGame.holes)}
            </Text>
          )}
          {summary.otherGames.map((game) => (
            <Text key={game.gameId} style={[styles.message, { color: colors.danger }]}>
              {quarantineOtherGameText(game.count)}
            </Text>
          ))}
          {!summary.currentGame && summary.otherGames.length === 0 && (
            <Text style={[styles.message, { color: colors.danger }]}>
              {abandonedText(summary.totalCount)}
            </Text>
          )}
          <Text style={[styles.hint, { color: colors.muted }]}>
            {SYNC_BANNER_TEXT.quarantineRecoveryHint}
          </Text>
          {summary.errors.length > 0 && (
            <View testID="quarantine-errors">
              <Text style={[styles.hint, { color: colors.muted, fontFamily: FONTS.sansSemiBold }]}>
                {SYNC_BANNER_TEXT.quarantineDetailsTitle}
              </Text>
              {summary.errors.map((error) => (
                <Text key={error} style={[styles.hint, { color: colors.muted }]}>
                  {error}
                </Text>
              ))}
            </View>
          )}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={dismissQuarantine}
              style={actionStyle}
              testID="quarantine-dismiss"
            >
              <Text style={actionText}>{SYNC_BANNER_TEXT.quarantineDismiss}</Text>
            </Pressable>
            {active.length > 0 && (
              <Pressable
                accessibilityRole="button"
                onPress={() => void retry()}
                disabled={retrying}
                style={[actionStyle, retrying && styles.disabled]}
                testID="quarantine-retry"
              >
                <Text style={actionText}>
                  {retrying ? SYNC_BANNER_TEXT.retrying : SYNC_BANNER_TEXT.retry}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
      {conflicts.map((conflict) => (
        <View
          key={conflict.id}
          style={[styles.box, styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}
          testID="conflict-notice"
        >
          <Text style={[styles.message, styles.flex, { color: colors.text }]}>
            {conflictText(conflict.holeNumber, conflict.forOwnScore)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void dismissConflict(conflict.id)}
            style={[styles.action, { borderColor: colors.text }]}
            testID="conflict-dismiss"
          >
            <Text style={[styles.actionText, { color: colors.text }]}>
              {SYNC_BANNER_TEXT.conflictDismiss}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 6, marginBottom: 8 },
  box: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  message: { fontSize: 14, fontFamily: FONTS.sansMedium },
  hint: { fontSize: 12, fontFamily: FONTS.sans },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  action: {
    minHeight: TAP,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  actionText: { fontSize: 12, fontFamily: FONTS.sansSemiBold, textTransform: 'uppercase' },
  disabled: { opacity: 0.5 },
});
