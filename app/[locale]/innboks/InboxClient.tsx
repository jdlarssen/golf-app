'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import {
  NotificationCard,
  type NotificationRow,
} from '@/components/notifications/NotificationCard';
import {
  groupNotificationsByDay,
  type DayGroup,
} from '@/lib/notifications/groupByDay';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MailEnvelope } from '@/components/icons/MailEnvelope';
import { PullQuote } from '@/components/ui/PullQuote';
import { markOneAsRead, markAllAsRead, archiveOne, clearRead } from './actions';
import { notificationDestination } from '@/lib/notifications/deeplink';

/**
 * Innboks-client. Tar initial notifications-rader fra server-component,
 * grupperer per dag, og lar brukeren markere lest + navigere.
 *
 * Tap-flyt:
 *  1. Optimistisk mark som lest lokalt (umiddelbart visuelt feedback)
 *  2. Call markOneAsRead-server-action via useTransition (no-op for allerede-lest)
 *  3. Naviger til kortets deeplink via router.push
 *
 * «Marker alle som lest» speiler samme pattern på alle uleste rader i én operasjon.
 *
 * NB: Vi re-grupperer per render slik at en optimistic-update på read_at
 * ikke flytter kort mellom dag-buckets (dag bestemmes av created_at, ikke
 * read_at). DayGroup-en holder seg derfor stabil.
 */
export function InboxClient({
  initialNotifications,
}: {
  initialNotifications: NotificationRow[];
}) {
  const router = useRouter();
  const t = useTranslations('inbox');
  const locale = useLocale() as AppLocale;
  const [, startTransition] = useTransition();
  const [markAllPending, startMarkAll] = useTransition();
  const [, startArchive] = useTransition();
  const [clearReadPending, startClearRead] = useTransition();
  const [items, setItems] = useState<NotificationRow[]>(initialNotifications);

  const hasUnread = items.some((n) => n.read_at == null);
  const hasRead = items.some((n) => n.read_at != null);
  // Pass locale + translated today/yesterday labels so groupByDay stays
  // locale-agnostic (locale drives the «10. des 2025»-style date labels).
  const groups: DayGroup<NotificationRow>[] = groupNotificationsByDay(items, {
    locale,
    labels: { today: t('today'), yesterday: t('yesterday') },
  });

  function handleTap(notification: NotificationRow) {
    const wasUnread = notification.read_at == null;

    if (wasUnread) {
      // Optimistisk markering lokalt så badgen + kortet oppdateres umiddelbart.
      const nowIso = new Date().toISOString();
      setItems((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read_at: nowIso } : n)),
      );
      startTransition(() => {
        void markOneAsRead(notification.id);
      });
    }

    // Naviger kun når varselet har et reelt mål. Varsler uten destinasjon
    // (avvist påmelding, produktnytt uten lenke) returnerer null og markeres
    // bare som lest — ingen `router.push('/innboks')` som gir null synlig
    // endring og får varselet til å føles ødelagt (#613).
    const dest = notificationDestination(notification);
    if (dest) router.push(dest);
  }

  function handleMarkAll() {
    const nowIso = new Date().toISOString();
    setItems((prev) =>
      prev.map((n) => (n.read_at == null ? { ...n, read_at: nowIso } : n)),
    );
    startMarkAll(() => {
      void markAllAsRead();
    });
  }

  function handleArchive(notification: NotificationRow) {
    // Fjern kortet optimistisk fra lista (soft-archive på server). Vi navigerer
    // IKKE — ✕ er en ren rydde-handling, ikke en åpne-handling.
    setItems((prev) => prev.filter((n) => n.id !== notification.id));
    startArchive(() => {
      void archiveOne(notification.id);
    });
  }

  function handleClearRead() {
    // Fjern alle leste optimistisk; uleste blir stående.
    setItems((prev) => prev.filter((n) => n.read_at == null));
    startClearRead(() => {
      void clearRead();
    });
  }

  if (items.length === 0) {
    return (
      <div className="mt-2">
        <Card className="flex flex-col items-center text-center">
          <MailEnvelope size={56} className="text-primary" />
          <p className="mt-3 font-serif text-base text-text">{t('emptyHeading')}</p>
          <p className="mt-1 font-sans text-[12px] text-muted">
            {t('emptyBody')}
          </p>
        </Card>
        <PullQuote className="mt-6">{t('cleanPullQuote')}</PullQuote>
      </div>
    );
  }

  return (
    <div>
      {/* Én tilstands-adaptiv rydde-knapp (#1133): uleste prioriteres, så
          knappen viser «Marker alle som lest» så lenge det finnes uleste, og
          morfer til «Tøm leste» først når alt er lest. Fjerner rekkefølge-
          tvangen fra de gamle to samsynlige pillene uten å arkivere uleste. */}
      {(hasUnread || hasRead) && (
        <div className="mb-3 flex justify-end">
          {hasUnread ? (
            <Button
              type="button"
              variant="ghost"
              onClick={handleMarkAll}
              pending={markAllPending}
              pendingLabel={t('markingPending')}
              className="min-h-0 rounded-full border border-border bg-surface-2/50 px-3 py-1.5 font-sans text-[11px] font-medium text-text transition-colors hover:bg-surface-2 active:bg-surface-2"
            >
              {t('markAllAsRead')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={handleClearRead}
              pending={clearReadPending}
              pendingLabel={t('clearingPending')}
              className="min-h-0 rounded-full border border-border bg-surface-2/50 px-3 py-1.5 font-sans text-[11px] font-medium text-text transition-colors hover:bg-surface-2 active:bg-surface-2"
            >
              {t('clearRead')}
            </Button>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-4 list-none p-0">
        {groups.map((group) => (
          <li key={group.key}>
            <p className="mb-2 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              {group.label}
            </p>
            <ul className="flex flex-col gap-2 list-none p-0">
              {group.items.map((notification) => (
                <li key={notification.id}>
                  <NotificationCard
                    notification={notification}
                    onTap={() => handleTap(notification)}
                    onArchive={() => handleArchive(notification)}
                  />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Deeplink-mappingen bor nå i `@/lib/notifications/deeplink`
// (`notificationDestination`) så den kan enhetstestes og dele én sannhetskilde
// med null-for-selvpekende-varsler-logikken (#613).
