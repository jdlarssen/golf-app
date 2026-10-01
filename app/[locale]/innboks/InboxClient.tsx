'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import {
  buildInboxEntryView,
  buildInboxSections,
  countActionRows,
  inboxPerson,
  type InboxEntry,
  type InboxEntryView,
  type InboxFilter,
  type InboxRow as InboxRowData,
  type InboxSectionKey,
  type InboxTextContext,
} from '@/lib/notifications/inboxSections';
import type { NotificationPayload } from '@/lib/notifications/types';
import type { NotificationTranslator } from '@/lib/notifications/cardContent';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import { InboxRow } from '@/components/notifications/InboxRow';
import { InboxActionRow } from '@/components/notifications/InboxActionRow';
import { MailEnvelope } from '@/components/icons/MailEnvelope';
import { Card } from '@/components/ui/Card';
import { PullQuote } from '@/components/ui/PullQuote';
import { InboxFilterChips } from './InboxFilterChips';
import {
  clearRead,
  decideRegistration,
  markAllAsRead,
  markGroupAsRead,
  markOneAsRead,
  type DecideRegistrationResult,
} from './actions';

/**
 * The inbox as a board (#2263, artboard «Forslag: oppslagstavla»): KREVER
 * HANDLING, I DAG and TIDLIGERE, filter chips, groups. The rules — which row
 * needs action, what groups, what each row says — live in
 * `lib/notifications/inboxSections.ts`; this component holds the list, the
 * filter and the status line, and runs the actions.
 *
 * Every action goes through `runOptimistic` (#1394): the list is updated at
 * once, and put back with an error line if the server says no or the request
 * never arrives (offline on the course).
 *
 * The page sets its own edges (`AppShell flush`).
 */

type Status = { tone: 'ok' | 'error'; text: string } | null;

const SECTION_ORDER: InboxSectionKey[] = ['action', 'today', 'earlier'];
// The request no longer waits for an answer from here: someone answered first,
// it is gone, or the round has started (a started game locks the roster, so
// tapping again would only fail again).
const SETTLED_REASONS = new Set(['not_pending', 'request_not_found', 'game_not_found', 'game_locked']);

export function InboxClient({
  initialNotifications,
  isAdmin,
  teeOffByGame,
  resultByGame,
  finishedGameIds,
  now,
  signupErrorText,
}: {
  initialNotifications: InboxRowData[];
  isAdmin: boolean;
  teeOffByGame: Record<string, string | null>;
  resultByGame: Record<string, ResultSummary | null>;
  finishedGameIds: string[];
  /** Render time from the server, so server and browser write the same «for 2 min siden». */
  now: number;
  /**
   * The signup page's own texts for the two answers that can fail from here
   * (owner's answer 13: the same texts). Read on the server, so the heavy
   * `admin` namespace stays off this route's client bundle (#2227).
   */
  signupErrorText: Record<'game_locked' | 'no_team_slot', string>;
}) {
  const t = useTranslations('inbox');
  const tFinished = useTranslations('finishedCard');
  const locale = useLocale() as AppLocale;
  const [openPending, startTransition] = useTransition();
  const [markAllPending, startMarkAll] = useTransition();
  const [clearReadPending, startClearRead] = useTransition();
  const [decidePending, startDecide] = useTransition();
  const [items, setItems] = useState<InboxRowData[]>(initialNotifications);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [status, setStatus] = useState<Status>(null);

  const role = { isAdmin };
  const sections = buildInboxSections(items, { filter, now, isAdmin });
  const actionCount = countActionRows(items, role);
  const hasUnread = items.some((n) => n.read_at == null);
  const ctx: InboxTextContext = {
    t: t as unknown as NotificationTranslator,
    tFinished: tFinished as unknown as NotificationTranslator,
    locale,
    now,
    isAdmin,
    teeOffByGame,
    resultByGame,
    finishedGameIds,
  };

  /**
   * Run a server action behind an optimistic update. `snapshot` is the list
   * BEFORE the update; it comes back, with the error line, when the action
   * reports `ok: false` (DB error / not logged in) or throws (offline).
   */
  async function runOptimistic(
    snapshot: InboxRowData[],
    action: () => Promise<{ ok: boolean }>,
  ) {
    try {
      const result = await action();
      if (!result?.ok) {
        setItems(snapshot);
        setStatus({ tone: 'error', text: t('actionFailed') });
      }
    } catch (err) {
      console.error('[innboks] optimistic action failed', err);
      setItems(snapshot);
      setStatus({ tone: 'error', text: t('actionFailed') });
    }
  }

  /**
   * A tap on a row, a group or a row's button: mark what it stands for read
   * (all members of a group, also those merged as one person), then let the
   * link navigate. Rows already read are never written again (#1665).
   */
  function handleOpen(entry: InboxEntry) {
    setStatus(null);
    const unreadIds = entry.rows.filter((r) => r.read_at == null).map((r) => r.id);
    if (unreadIds.length === 0) return;
    const snapshot = items;
    const nowIso = new Date().toISOString();
    const ids = new Set(unreadIds);
    setItems((prev) => prev.map((n) => (ids.has(n.id) ? { ...n, read_at: nowIso } : n)));
    startTransition(async () => {
      await runOptimistic(snapshot, () =>
        unreadIds.length === 1 ? markOneAsRead(unreadIds[0]!) : markGroupAsRead(unreadIds),
      );
    });
  }

  /** «Godta» / «Avslå»: the row leaves at once, the status line says how it went. */
  function handleDecide(row: InboxRowData, decision: 'approve' | 'reject') {
    const p = row.payload as NotificationPayload<'registration_request'>;
    if (!p.request_id) return;
    const requestId = p.request_id;
    setStatus(null);
    const snapshot = items;
    setItems((prev) => prev.filter((n) => n.id !== row.id));
    startDecide(async () => {
      let result: DecideRegistrationResult;
      try {
        result = await decideRegistration(row.id, requestId, decision);
      } catch (err) {
        console.error('[innboks] decideRegistration failed', err);
        setItems(snapshot);
        setStatus({ tone: 'error', text: t('actionFailed') });
        return;
      }
      const name = inboxPerson(p.requester_name)?.short ?? t('somePlayerFallback');
      if (result.ok) {
        const values = { name, teamName: result.teamName ?? '', gameName: result.gameName };
        const key =
          result.outcome === 'approved'
            ? result.teamName
              ? 'status.approvedTeam'
              : 'status.approved'
            : result.teamName
              ? 'status.rejectedTeam'
              : 'status.rejected';
        setStatus({ tone: 'ok', text: t(key, values) });
        return;
      }
      if (SETTLED_REASONS.has(result.reason)) {
        // The row stays, read, under I DAG/TIDLIGERE, with the reason.
        const nowIso = new Date().toISOString();
        setItems(snapshot.map((n) => (n.id === row.id ? { ...n, read_at: nowIso } : n)));
        setStatus({
          tone: 'ok',
          text: result.reason === 'game_locked' ? signupErrorText.game_locked : t('status.alreadyDecided'),
        });
        return;
      }
      setItems(snapshot);
      const text =
        result.reason === 'no_team_slot'
          ? signupErrorText.no_team_slot
          : result.reason === 'forbidden'
            ? t('status.forbidden')
            : t('actionFailed');
      setStatus({ tone: 'error', text });
    });
  }

  function handleMarkAll() {
    setStatus(null);
    const snapshot = items;
    const nowIso = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at == null ? { ...n, read_at: nowIso } : n)));
    startMarkAll(async () => {
      await runOptimistic(snapshot, () => markAllAsRead());
    });
  }

  function handleClearRead() {
    setStatus(null);
    const snapshot = items;
    setItems((prev) => prev.filter((n) => n.read_at == null));
    startClearRead(async () => {
      await runOptimistic(snapshot, () => clearRead());
    });
  }

  // «Godta»/«Avslå» have their own labels; every other action key is one button.
  function buttonLabel(key: InboxEntryView['actionKey']): string {
    return key && key !== 'decide' ? t(`buttons.${key}`) : '';
  }

  // Always mounted, so screen readers have the live region before a message
  // lands in it; empty, it takes no room.
  // The key keeps it the same node when the inbox empties and refills.
  const statusLine = (
    <p
      key="inbox-status"
      role="status"
      data-testid={status ? (status.tone === 'error' ? 'inbox-action-error' : 'inbox-status') : undefined}
      className={
        status
          ? `px-5 pb-2 text-[13px] leading-[normal] ${status.tone === 'error' ? 'text-danger' : 'text-text'}`
          : 'sr-only'
      }
    >
      {status?.text ?? ''}
    </p>
  );

  // While any action is on its way the pill keeps its label and waits (Mål 3):
  // the optimistic update would otherwise flip it to «Tøm leste» at once, and a
  // tap could race another action's rollback (#1394) — e.g. «Godta» fails, then
  // «Marker alt lest» fails and puts back a list taken without the request.
  const pillBusy = markAllPending || clearReadPending || decidePending || openPending;
  const pillMarksAll = markAllPending ? true : clearReadPending ? false : hasUnread;
  const header = (
    <div className="flex items-center justify-between pb-1.5 pl-5 pr-3 pt-4">
      <h1 className="font-serif text-[28px] font-medium leading-[normal] text-text">
        {t('kicker')}
      </h1>
      {items.length > 0 && (
        <button
          type="button"
          onClick={pillMarksAll ? handleMarkAll : handleClearRead}
          disabled={pillBusy}
          aria-busy={pillBusy || undefined}
          data-testid={pillMarksAll ? 'inbox-mark-all' : 'inbox-clear-read'}
          className="h-11 rounded-full border border-border bg-surface px-3.5 text-[13px] font-semibold leading-[normal] text-primary disabled:opacity-60"
        >
          {pillMarksAll ? t('markAllAsRead') : t('clearRead')}
        </button>
      )}
    </div>
  );

  const root = 'pb-4';

  if (items.length === 0) {
    return (
      <div className={root}>
        {header}
        {statusLine}
        <div className="mx-4 mt-2">
          <Card className="flex flex-col items-center text-center">
            <MailEnvelope size={56} className="text-primary" />
            <p className="mt-3 font-serif text-base text-text">{t('emptyHeading')}</p>
            <p className="mt-1 font-sans text-[12px] text-muted">{t('emptyBody')}</p>
          </Card>
          <PullQuote className="mt-6">{t('cleanPullQuote')}</PullQuote>
        </div>
      </div>
    );
  }

  const visibleSections = SECTION_ORDER.filter((key) => sections[key].length > 0);

  return (
    <div className={root}>
      {header}
      <InboxFilterChips value={filter} onChange={setFilter} actionCount={actionCount} />
      {statusLine}
      {visibleSections.length === 0 ? (
        <p
          data-testid="inbox-empty-filter"
          className="mx-4 mt-2 rounded-2xl border border-border bg-surface px-3.5 py-3 text-[13px] leading-[normal] text-muted"
        >
          {t('emptyFilter')}
        </p>
      ) : (
        visibleSections.map((key, index) => {
          const entries = sections[key];
          const views = entries.map((entry) => buildInboxEntryView(entry, key, ctx));
          const headingId = `inbox-section-${key}`;
          const onlyLink =
            key !== 'action' &&
            entries.length === 1 &&
            views[0]!.destination !== null &&
            views[0]!.body === null;
          return (
            <section key={key} aria-labelledby={headingId} data-testid={`inbox-section-${key}`}>
              <h2
                id={headingId}
                className={`px-5 pb-2 text-[10px] font-semibold uppercase leading-[normal] tracking-[0.2em] ${
                  index === 0 ? 'pt-2' : 'pt-5'
                } ${key === 'action' ? 'text-accent-text' : 'text-muted'}`}
              >
                {t(`sections.${key}`)}
              </h2>
              {onlyLink ? (
                <InboxRow
                  view={views[0]!}
                  unread={entries[0]!.unread}
                  unreadLabel={t('unreadLabel')}
                  onActivate={() => handleOpen(entries[0]!)}
                  asCard
                />
              ) : (
                <div className="mx-4 overflow-hidden rounded-2xl border border-border bg-surface">
                  {entries.map((entry, i) =>
                    key === 'action' ? (
                      <InboxActionRow
                        key={entry.key}
                        view={views[i]!}
                        labels={{
                          unread: t('unreadLabel'),
                          button: buttonLabel(views[i]!.actionKey),
                          approve: t('buttons.approve'),
                          reject: t('buttons.reject'),
                        }}
                        onOpen={() => handleOpen(entry)}
                        onDecide={
                          entry.type === 'single'
                            ? (decision) => handleDecide(entry.row, decision)
                            : undefined
                        }
                        pending={decidePending}
                      />
                    ) : (
                      <InboxRow
                        key={entry.key}
                        view={views[i]!}
                        unread={entry.unread}
                        unreadLabel={t('unreadLabel')}
                        onActivate={() => handleOpen(entry)}
                      />
                    ),
                  )}
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
