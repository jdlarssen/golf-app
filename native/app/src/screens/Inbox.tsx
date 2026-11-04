// native/app/src/screens/Inbox.tsx
// #2759: innboksen i appen (`Innboks-forslag`), med det webbens `/innboks` har:
// «Krever handling», «I dag», «Tidligere», filterbrikkene og tomtilstandene.
//
// **Reglene er serverens.** Hva som krever handling, hva som grupperes og hva hver
// rad sier, kommer ferdig fra `GET /api/inbox` (`data/inbox.ts`). Skjermen henter
// ved fokus, så det du kommer tilbake til, er det serveren nå mener, og den gjentar
// ingen regel for hva som er lest.
//
// **En sak som venter, står til den er gjort** (eierens svar 04.11). Et trykk på den
// åpner bare skjermen. Knappen øverst blir «Tøm leste» når bare slike saker er ulest.
//
// **Handlingene venter på svar:** «Marker alt lest», «Tøm leste», «Godta» og «Avslå»
// endrer ikke lista før serveren har svart, og feiler de, står lista og feillinja
// sier fra (#1394). `acting` er låsen: to trykk i samme bilde sender ett kall. En
// `useRef`, fordi en state først låser ved neste bilde. Et trykk på en rad merker
// uten å vente og navigerer. Feiler merkingen, står raden som ulest ved neste henting.
//
// **Uten nett** står en setning og «Prøv igjen», og lista som alt er hentet, blir
// stående. En feilet lesing er aldri en tom innboks (#1392).
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
import { InboxActionRow } from '../components/inbox/InboxActionRow';
import { InboxFilterChips } from '../components/inbox/InboxFilterChips';
import { InboxRow } from '../components/inbox/InboxRow';
import { MailEnvelopeIcon } from '../components/icons/Icons';
import { useBottomInsetUnlessKeyboard } from '../components/KeyboardInset';
import {
  INBOX_SECTION_ORDER,
  clearReadRows,
  decideRegistration,
  filterInboxSection,
  inboxIsEmpty,
  loadInbox,
  markAllRead,
  type InboxData,
  type InboxDecision,
  type InboxEntry,
  type InboxFilter,
} from '../data/inbox';
import { markNotificationIdsRead } from '../data/markRead';
import { INBOX_TEXT, decidedLine } from '../lib/inboxCopy';
import { inboxTarget } from '../lib/inboxTarget';
import { openScreenTarget } from '../lib/openPushTarget';
import { useOnResume } from '../lib/useOnResume';
import { describeWebLinkFailure, openWeb } from '../lib/webLink';
import type { ScreenProps } from '../navigation';
import { FONTS, TAP, fraunces, interLine, useTheme } from '../theme';

type StatusLine = { tone: 'ok' | 'error'; text: string };
type LoadProblem = 'offline' | 'failed';

export function Inbox({ navigation }: ScreenProps<'Inbox'>) {
  const { colors, ui } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();
  const [data, setData] = useState<InboxData | null>(null);
  const [problem, setProblem] = useState<LoadProblem | null>(null);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [line, setLine] = useState<StatusLine | null>(null);
  const [pulling, setPulling] = useState(false);
  const [locked, setLocked] = useState(false);
  const acting = useRef(false);
  const latest = useRef(0);

  // Bare det siste svaret teller: et tregt svar fra forrige fokus skal ikke legge
  // en gammel liste over en ny.
  const reload = useCallback(async () => {
    const mine = ++latest.current;
    const result = await loadInbox();
    if (mine !== latest.current) return;
    if (result.ok) {
      setData(result.data);
      setProblem(null);
    } else {
      setProblem(result.reason === 'offline' ? 'offline' : 'failed');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  useOnResume(reload);

  const onPull = useCallback(async () => {
    setPulling(true);
    await reload();
    setPulling(false);
  }, [reload]);

  /** Kjører en handling bak låsen. Et trykk mens en annen går, gjør ingenting. */
  async function whileLocked(action: () => Promise<void>) {
    if (acting.current) return;
    acting.current = true;
    setLocked(true);
    setLine(null);
    try {
      await action();
    } finally {
      acting.current = false;
      setLocked(false);
    }
  }

  const onMarkAll = () =>
    whileLocked(async () => {
      if (await markAllRead()) await reload();
      else setLine({ tone: 'error', text: INBOX_TEXT.actionFailed });
    });

  const onClearRead = () =>
    whileLocked(async () => {
      if (await clearReadRows()) await reload();
      else setLine({ tone: 'error', text: INBOX_TEXT.actionFailed });
    });

  const onDecide = (entry: InboxEntry, decision: InboxDecision) =>
    whileLocked(async () => {
      const result = await decideRegistration(entry.key, decision);
      if (result.ok) {
        setLine({
          tone: 'ok',
          text: decidedLine(result.outcome, {
            name: result.name,
            teamName: result.teamName,
            gameName: result.gameName,
          }),
        });
        await reload();
        return;
      }
      switch (result.reason) {
        // Saken venter ikke lenger: noen svarte først, den er borte, eller runden
        // har startet. Raden blir stående som lest, med beskjed.
        case 'not_pending':
        case 'request_not_found':
        case 'game_not_found':
          setLine({ tone: 'ok', text: INBOX_TEXT.alreadyDecided });
          await reload();
          return;
        case 'game_locked':
          setLine({ tone: 'ok', text: INBOX_TEXT.gameLocked });
          await reload();
          return;
        case 'no_team_slot':
          setLine({ tone: 'error', text: INBOX_TEXT.noTeamSlot });
          return;
        case 'forbidden':
          setLine({ tone: 'error', text: INBOX_TEXT.forbidden });
          return;
        default:
          setLine({ tone: 'error', text: INBOX_TEXT.actionFailed });
      }
    });

  /** Går dit stien peker: en skjerm, nettsiden, eller ingenting (bare lest). */
  async function go(destination: string | null) {
    const target = inboxTarget(destination);
    if (target.kind === 'screen') openScreenTarget(navigation, target.target);
    else if (target.kind === 'web') {
      const opened = await openWeb(target.path);
      if (!opened.ok) setLine({ tone: 'error', text: describeWebLinkFailure(opened.reason) });
    }
  }

  function onOpen(entry: InboxEntry, destination = entry.destination) {
    setLine(null);
    if (entry.unreadIds.length > 0) {
      const marked = markNotificationIdsRead(entry.unreadIds);
      // Uten mål blir du stående her, så det må synes. Med mål henter fokuset på nytt.
      if (!destination) void marked.then(reload);
    }
    void go(destination);
  }

  const root = (children: React.ReactNode) => (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingBottom: 16 + bottomInset }]}
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} tintColor={colors.primary} />}
      testID="inbox-screen"
    >
      {children}
    </ScrollView>
  );

  if (data === null && problem === null) {
    return (
      <View style={ui.centered} testID="inbox-loading">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const empty = data === null || inboxIsEmpty(data);
  const header = (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
        {INBOX_TEXT.heading}
      </Text>
      {!empty ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: locked, busy: locked }}
          disabled={locked}
          onPress={() => void (data?.hasUnread ? onMarkAll() : onClearRead())}
          style={[
            styles.pill,
            { backgroundColor: colors.surface, borderColor: colors.border },
            locked && styles.waiting,
          ]}
          testID={data?.hasUnread ? 'inbox-mark-all' : 'inbox-clear-read'}
        >
          <Text style={[styles.pillText, { color: colors.primary }]}>
            {data?.hasUnread ? INBOX_TEXT.markAll : INBOX_TEXT.clearRead}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  // Står alltid, så skjermleseren har regionen før beskjeden kommer. Tom tar den ingen plass.
  const status = (
    <Text
      accessibilityLiveRegion="polite"
      style={
        line
          ? [styles.status, { color: line.tone === 'error' ? colors.danger : colors.text }]
          : styles.statusEmpty
      }
      testID={line ? (line.tone === 'error' ? 'inbox-action-error' : 'inbox-status') : 'inbox-status-empty'}
    >
      {line?.text ?? ''}
    </Text>
  );

  const loadProblem = problem ? (
    <View style={styles.problem}>
      <Text style={[styles.problemText, { color: colors.text }]} testID="inbox-load-error">
        {problem === 'offline' ? INBOX_TEXT.offline : INBOX_TEXT.loadFailed}
      </Text>
      <Pressable accessibilityRole="button" style={ui.buttonSecondary} onPress={() => void reload()} testID="inbox-retry">
        <Text style={ui.buttonSecondaryText}>{INBOX_TEXT.retry}</Text>
      </Pressable>
    </View>
  ) : null;

  if (data === null) {
    return root(
      <>
        {header}
        {loadProblem}
      </>,
    );
  }

  if (empty) {
    return root(
      <>
        {header}
        {status}
        {loadProblem}
        <View style={styles.emptyWrap}>
          <View
            style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            testID="inbox-empty"
          >
            <MailEnvelopeIcon stroke={colors.primary} fill={colors.surface} dot={colors.accent} />
            <Text style={[styles.emptyHeading, { color: colors.text }]}>{INBOX_TEXT.emptyHeading}</Text>
            <Text style={[styles.emptyBody, { color: colors.muted }]}>{INBOX_TEXT.emptyBody}</Text>
          </View>
          <Text style={[styles.pullQuote, { color: colors.muted }]}>{`«${INBOX_TEXT.cleanPullQuote}»`}</Text>
        </View>
      </>,
    );
  }

  const shown = INBOX_SECTION_ORDER.map((key) => ({
    key,
    entries: filterInboxSection(data.sections[key], key, filter),
  })).filter((section) => section.entries.length > 0);

  return root(
    <>
      {header}
      <InboxFilterChips value={filter} onChange={setFilter} actionCount={data.actionCount} />
      {status}
      {loadProblem}
      {shown.length === 0 ? (
        <Text
          style={[styles.emptyFilter, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.muted }]}
          testID="inbox-empty-filter"
        >
          {INBOX_TEXT.emptyFilter}
        </Text>
      ) : (
        shown.map(({ key, entries }, index) => (
          <View key={key} testID={`inbox-section-${key}`}>
            <Text
              accessibilityRole="header"
              style={[
                styles.sectionHead,
                index > 0 && styles.sectionHeadNext,
                { color: key === 'action' ? colors.accentText : colors.muted },
              ]}
            >
              {INBOX_TEXT.sections[key]}
            </Text>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {entries.map((entry, i) =>
                key === 'action' ? (
                  <InboxActionRow
                    key={entry.key}
                    entry={entry}
                    last={i === entries.length - 1}
                    onOpen={() => onOpen(entry)}
                    onDecide={(decision) => void onDecide(entry, decision)}
                    locked={locked}
                  />
                ) : (
                  <InboxRow
                    key={entry.key}
                    entry={entry}
                    last={i === entries.length - 1}
                    onOpen={() => onOpen(entry)}
                    onCta={() => onOpen(entry, entry.cta?.href ?? null)}
                  />
                ),
              )}
            </View>
          </View>
        ))
      )}
    </>,
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 6,
    paddingLeft: 20,
    paddingRight: 12,
  },
  heading: { ...fraunces(500, 28) },
  pill: {
    height: TAP,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { ...interLine(13, 16), fontFamily: FONTS.sansSemiBold },
  waiting: { opacity: 0.6 },
  status: {
    ...interLine(13, 16, { multiline: true }),
    fontFamily: FONTS.sans,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  statusEmpty: { height: 0 },
  problem: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  problemText: { ...interLine(13, 16, { multiline: true }), fontFamily: FONTS.sans },
  sectionHead: {
    ...interLine(12, 15),
    fontFamily: FONTS.sansSemiBold,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sectionHeadNext: { paddingTop: 20 },
  card: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  emptyFilter: {
    ...interLine(13, 16, { multiline: true }),
    fontFamily: FONTS.sans,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  emptyWrap: { marginHorizontal: 16, marginTop: 8 },
  emptyCard: { alignItems: 'center', padding: 24, borderRadius: 16, borderWidth: 1 },
  emptyHeading: { ...fraunces(400, 16, undefined, { multiline: true }), marginTop: 12, textAlign: 'center' },
  emptyBody: {
    ...interLine(12, 15, { multiline: true }),
    fontFamily: FONTS.sans,
    marginTop: 4,
    textAlign: 'center',
  },
  // Webben skriver linja i kursiv. Appen har ikke et kursivt Fraunces-snitt, så her står den rett.
  pullQuote: { ...fraunces(500, 12, undefined, { multiline: true }), marginTop: 24, textAlign: 'center' },
});
