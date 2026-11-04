// native/app/src/screens/Inbox.tsx
// #2759: innboksen. Varslene dine og det som venter på deg, fra konvolutten på
// Hjem. Tegningen er `Innboks-forslag` på designlerretet, og natt følger appens
// tokens og nettets `/innboks` i mørk modus.
//
// Reglene bor på serveren. Hva som krever handling, hva som grupperes og hva hver
// rad sier, kommer ferdig fra `GET /api/inbox` (`lib/notifications/inboxSections.ts`),
// så ingen av dem finnes i to kopier. Filtrene er et rent filter på svaret.
//
// **Henting.** Ved fokus, med dra-for-å-oppdatere, og når appen kommer i
// forgrunnen eller nettet er tilbake. Fokus etter en handling viser det serveren
// nå mener, så ingen regler for lest gjentas her. En feilet henting lar lista
// stå: uten liste viser skjermen setningen og «Prøv igjen», og med liste står
// setningen over den. `load_failed` er aldri en tom innboks (#1392).
//
// **Trykk.** Et trykk merker lest uten å vente og navigerer. Feiler merkingen, står
// raden som ulest ved neste henting. «Marker alt lest», «Tøm leste» og
// «Godta/Avslå» venter på svar og endrer ingenting før det er kommet, så en feil
// lar lista stå med feillinja under seg (#1394).
//
// **Tilbake.** Et trykk åpner skjermen med `openScreenTarget`, aldri
// `popToTop`: innboksen blir liggende under (`docs/user-flows.md` §Tilbake).
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { filterInboxWire } from '../../../../lib/notifications/inboxFilter';
import type { InboxFilter, InboxSectionKey } from '../../../../lib/notifications/inboxSections';
import type { InboxWire, InboxWireEntry } from '../../../../lib/notifications/inboxWire';
import { InboxActionRow } from '../components/inbox/InboxActionRow';
import { InboxFilterChips } from '../components/inbox/InboxFilterChips';
import { InboxRow } from '../components/inbox/InboxRow';
import { MailEnvelope } from '../components/icons/Icons';
import { clearRead, decideRequest, loadInbox, markAllRead } from '../data/inbox';
import { markNotificationIdsRead } from '../data/markRead';
import type { WebApiFailure } from '../data/webApi';
import { INBOX_TEXT, decisionLine } from '../lib/inboxCopy';
import { inboxTarget } from '../lib/inboxTarget';
import { openScreenTarget } from '../lib/openPushTarget';
import { useOnResume } from '../lib/useOnResume';
import { describeWebLinkFailure, openWeb } from '../lib/webLink';
import type { ScreenProps } from '../navigation';
import { FONTS, TAP, fraunces, interLine, useTheme } from '../theme';

type Status = { tone: 'ok' | 'error'; text: string } | null;
type LoadFailure = WebApiFailure | 'load_failed';

const SECTION_ORDER: InboxSectionKey[] = ['action', 'today', 'earlier'];

/** Forespørselen venter ikke på svar herfra lenger. Raden blir lest, med grunnen. */
const SETTLED_REASONS = new Set(['not_pending', 'request_not_found', 'game_not_found', 'game_locked']);

function failedDecisionStatus(reason: string): NonNullable<Status> {
  if (reason === 'game_locked') return { tone: 'ok', text: INBOX_TEXT.signupErrors.game_locked };
  if (SETTLED_REASONS.has(reason)) return { tone: 'ok', text: INBOX_TEXT.status.alreadyDecided };
  if (reason === 'no_team_slot') return { tone: 'error', text: INBOX_TEXT.signupErrors.no_team_slot };
  if (reason === 'forbidden') return { tone: 'error', text: INBOX_TEXT.status.forbidden };
  return { tone: 'error', text: INBOX_TEXT.actionFailed };
}

/** Raden er lest her på skjermen, til neste henting sier hvor den hører hjemme. */
function withEntryRead(board: InboxWire, key: string): InboxWire {
  const read = (entry: InboxWireEntry) =>
    entry.key === key ? { ...entry, unread: false, unreadIds: [] } : entry;
  const sections = {
    action: board.sections.action.map(read),
    today: board.sections.today.map(read),
    earlier: board.sections.earlier.map(read),
  };
  const hasUnread = SECTION_ORDER.some((name) => sections[name].some((entry) => entry.unread));
  return { ...board, sections, hasUnread };
}

export function Inbox({ navigation }: ScreenProps<'Inbox'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const [board, setBoard] = useState<InboxWire | null>(null);
  const [loadError, setLoadError] = useState<LoadFailure | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [status, setStatus] = useState<Status>(null);
  /** Hvilken knapp som venter på svar: `all`, `clear` eller radens nøkkel. */
  const [busy, setBusy] = useState<string | null>(null);
  // Det nyeste kallet vinner: en henting fra før en handling skal ikke overskrive svaret etter den.
  const loadSeq = useRef(0);

  const reload = useCallback(async () => {
    const seq = ++loadSeq.current;
    const result = await loadInbox();
    if (seq !== loadSeq.current) return;
    if (result.ok) {
      setBoard(result.board);
      setLoadError(null);
    } else {
      setLoadError(result.reason);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  useOnResume(reload);

  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const open = (entry: InboxWireEntry, destination: string | null) => {
    setStatus(null);
    const ids = entry.unreadIds;
    const marked = ids.length > 0 ? markNotificationIdsRead(ids) : Promise.resolve();
    if (ids.length > 0) setBoard((current) => (current ? withEntryRead(current, entry.key) : current));

    const target = inboxTarget(destination);
    if (target.kind === 'screen') {
      openScreenTarget(navigation, target.target);
      return;
    }
    // Skjermen mister ikke fokus, så hentingen kommer her, når merkingen er ferdig.
    void marked.then(reload);
    if (target.kind === 'web') {
      void openWeb(target.path).then((result) => {
        if (!result.ok) setStatus({ tone: 'error', text: describeWebLinkFailure(result.reason) });
      });
    }
  };

  const runPill = async (which: 'all' | 'clear', action: () => Promise<boolean>) => {
    setStatus(null);
    setBusy(which);
    const ok = await action();
    if (ok) await reload();
    else setStatus({ tone: 'error', text: INBOX_TEXT.actionFailed });
    setBusy(null);
  };

  const decide = async (entry: InboxWireEntry, decision: 'approve' | 'reject') => {
    setStatus(null);
    setBusy(entry.key);
    const result = await decideRequest(entry.key, decision);
    if (result.ok) {
      setStatus({ tone: 'ok', text: decisionLine(result) });
      setBoard((current) =>
        current
          ? {
              ...current,
              actionCount: Math.max(0, current.actionCount - 1),
              sections: {
                ...current.sections,
                action: current.sections.action.filter((row) => row.key !== entry.key),
              },
            }
          : current,
      );
      await reload();
    } else {
      setStatus(failedDecisionStatus(result.reason));
      if (SETTLED_REASONS.has(result.reason)) await reload();
    }
    setBusy(null);
  };

  const loadErrorText =
    loadError === null ? null : loadError === 'offline' ? INBOX_TEXT.offline : INBOX_TEXT.loadFailed;
  const retry = (
    <Pressable
      accessibilityRole="button"
      style={ui.buttonSecondary}
      onPress={() => void reload()}
      testID="inbox-retry"
    >
      <Text style={ui.buttonSecondaryText}>{INBOX_TEXT.retry}</Text>
    </Pressable>
  );

  if (board === null) {
    return loadErrorText ? (
      <ScrollView
        contentContainerStyle={[ui.scroll, { paddingBottom: insets.bottom + 20 }]}
        testID="inbox-screen"
      >
        <Text style={ui.body} testID="inbox-load-error">
          {loadErrorText}
        </Text>
        {retry}
      </ScrollView>
    ) : (
      <View style={ui.centered} testID="inbox-loading">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const isEmpty = SECTION_ORDER.every((key) => board.sections[key].length === 0);
  const shown = filterInboxWire(board.sections, filter);
  const visible = SECTION_ORDER.filter((key) => shown[key].length > 0);
  const pillBusy = busy !== null;
  const pillMarksAll = busy === 'all' ? true : busy === 'clear' ? false : board.hasUnread;

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void pullToRefresh()} tintColor={colors.primary} />
      }
      testID="inbox-screen"
    >
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {INBOX_TEXT.kicker}
        </Text>
        {isEmpty ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: pillBusy, busy: pillBusy }}
            disabled={pillBusy}
            onPress={() =>
              void (pillMarksAll ? runPill('all', markAllRead) : runPill('clear', clearRead))
            }
            testID={pillMarksAll ? 'inbox-mark-all' : 'inbox-clear-read'}
            style={[
              styles.pill,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pillBusy ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.pillLabel, { color: colors.primary }]}>
              {pillMarksAll ? INBOX_TEXT.markAllAsRead : INBOX_TEXT.clearRead}
            </Text>
          </Pressable>
        )}
      </View>

      {isEmpty ? null : (
        <InboxFilterChips value={filter} onChange={setFilter} actionCount={board.actionCount} />
      )}

      {/* Alltid montert, så skjermleseren har området før en beskjed lander i det. */}
      <Text
        accessibilityLiveRegion="polite"
        testID={status ? (status.tone === 'error' ? 'inbox-action-error' : 'inbox-status') : undefined}
        style={
          status
            ? [styles.status, { color: status.tone === 'error' ? colors.danger : colors.text }]
            : styles.statusEmpty
        }
      >
        {status?.text ?? ''}
      </Text>

      {loadErrorText ? (
        <View style={styles.staleNote}>
          <Text style={ui.muted} testID="inbox-load-error">
            {loadErrorText}
          </Text>
          {retry}
        </View>
      ) : null}

      {isEmpty ? (
        <View style={styles.emptyWrap}>
          <View
            style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            testID="inbox-empty"
          >
            <MailEnvelope size={56} color={colors.primary} fill={colors.surface} accent={colors.accent} />
            <Text style={[styles.emptyHeading, { color: colors.text }]}>{INBOX_TEXT.emptyHeading}</Text>
            <Text style={[styles.emptyBody, { color: colors.muted }]}>{INBOX_TEXT.emptyBody}</Text>
          </View>
          <Text style={[styles.pullQuote, { color: colors.muted }]}>{`«${INBOX_TEXT.cleanPullQuote}»`}</Text>
        </View>
      ) : visible.length === 0 ? (
        <View style={[styles.emptyFilter, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emptyFilterText, { color: colors.muted }]} testID="inbox-empty-filter">
            {INBOX_TEXT.emptyFilter}
          </Text>
        </View>
      ) : (
        visible.map((key, index) => {
          const entries = shown[key];
          const lone =
            key !== 'action' &&
            entries.length === 1 &&
            entries[0]!.destination !== null &&
            entries[0]!.body === null;
          return (
            <View key={key} testID={`inbox-section-${key}`}>
              <Text
                accessibilityRole="header"
                style={[
                  styles.sectionTitle,
                  { paddingTop: index === 0 ? 8 : 20, color: key === 'action' ? colors.accentText : colors.muted },
                ]}
              >
                {INBOX_TEXT.sections[key]}
              </Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {entries.map((entry, i) => {
                  const last = i === entries.length - 1;
                  return key === 'action' ? (
                    <InboxActionRow
                      key={entry.key}
                      entry={entry}
                      last={last}
                      busy={pillBusy}
                      onOpen={() => open(entry, entry.destination)}
                      onDecide={(decision) => void decide(entry, decision)}
                    />
                  ) : (
                    <InboxRow
                      key={entry.key}
                      entry={entry}
                      last={last}
                      lone={lone}
                      onOpen={() => open(entry, entry.destination)}
                      onCta={() => open(entry, entry.cta?.href ?? null)}
                    />
                  );
                })}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingRight: 12,
    paddingBottom: 6,
    paddingLeft: 20,
  },
  title: { ...fraunces(500, 28) },
  pill: {
    height: TAP,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: { ...interLine(13, 16), fontFamily: FONTS.sansSemiBold },
  status: {
    ...interLine(13, 16, { multiline: true }),
    fontFamily: FONTS.sans,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  statusEmpty: { height: 0 },
  staleNote: { paddingHorizontal: 20, paddingBottom: 8 },
  sectionTitle: {
    ...interLine(12, 15),
    fontFamily: FONTS.sansSemiBold,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  card: { marginHorizontal: 16, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  emptyWrap: { marginHorizontal: 16, marginTop: 8 },
  emptyCard: { borderWidth: 1, borderRadius: 16, padding: 20, alignItems: 'center' },
  emptyHeading: { ...fraunces(400, 16), paddingTop: 12, textAlign: 'center' },
  emptyBody: {
    ...interLine(12, 15, { multiline: true }),
    fontFamily: FONTS.sans,
    paddingTop: 4,
    textAlign: 'center',
  },
  pullQuote: { ...fraunces(500, 12), fontStyle: 'italic', textAlign: 'center', paddingTop: 24 },
  emptyFilterText: { ...interLine(13, 16, { multiline: true }), fontFamily: FONTS.sans },
  emptyFilter: {
    marginHorizontal: 16,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
