'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
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
import { markOneAsRead, markAllAsRead } from './actions';
import type { NotificationPayload } from '@/lib/notifications/types';

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
  const [, startTransition] = useTransition();
  const [markAllPending, startMarkAll] = useTransition();
  const [items, setItems] = useState<NotificationRow[]>(initialNotifications);

  const hasUnread = items.some((n) => n.read_at == null);
  // Pass translated today/yesterday labels so groupByDay stays locale-agnostic
  const groups: DayGroup<NotificationRow>[] = groupNotificationsByDay(items, {
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

    router.push(buildDeeplink(notification));
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
      {hasUnread && (
        <div className="mb-3 flex justify-end">
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

/**
 * Per-kind deeplink-mapping. Speiler design-doc-en — hver kind har én
 * naturlig mål-rute hvor mark-as-read-helper på sida fanger eventuell
 * mail-deeplink-klikk separat (Phase 3).
 */
function buildDeeplink(notification: NotificationRow): string {
  if (notification.kind === 'product_update') {
    const p = notification.payload as NotificationPayload<'product_update'>;
    return p.link ?? '/innboks';
  }
  switch (notification.kind) {
    case 'invite':
    case 'scorecard_approved':
    case 'registration_approved': {
      const p = notification.payload as NotificationPayload<'invite'>;
      return `/games/${p.game_id}`;
    }
    case 'peer_approval_request': {
      const p = notification.payload as NotificationPayload<'peer_approval_request'>;
      return `/games/${p.game_id}/approve`;
    }
    case 'scorecard_submitted': {
      const p = notification.payload as NotificationPayload<'scorecard_submitted'>;
      return `/admin/games/${p.game_id}`;
    }
    case 'game_finished': {
      const p = notification.payload as NotificationPayload<'game_finished'>;
      return `/games/${p.game_id}/leaderboard`;
    }
    case 'team_invite': {
      const p = notification.payload as NotificationPayload<'team_invite'>;
      return `/signup/${p.game_short_id}/team`;
    }
    case 'registration_request': {
      const p = notification.payload as NotificationPayload<'registration_request'>;
      return `/admin/games/${p.game_id}/signups`;
    }
    case 'registration_rejected':
      return '/innboks';
    case 'team_member_withdrew': {
      const p = notification.payload as NotificationPayload<'team_member_withdrew'>;
      return `/signup/${p.game_short_id}/team`;
    }
    case 'deliver_reminder': {
      const p = notification.payload as NotificationPayload<'deliver_reminder'>;
      return `/games/${p.game_id}/submit`;
    }
    case 'cup_finished': {
      const p = notification.payload as NotificationPayload<'cup_finished'>;
      return `/cup/${p.tournament_id}`;
    }
    case 'cup_started': {
      const p = notification.payload as NotificationPayload<'cup_started'>;
      return `/cup/${p.tournament_id}`;
    }
    case 'club_join_request': {
      const p = notification.payload as NotificationPayload<'club_join_request'>;
      return `/klubber/${p.group_id}`;
    }
    case 'club_role_changed': {
      const p = notification.payload as NotificationPayload<'club_role_changed'>;
      return `/klubber/${p.group_id}`;
    }
    case 'friend_request':
    case 'friend_accepted':
      return '/profile/venner';
    case 'player_added': {
      const p = notification.payload as NotificationPayload<'player_added'>;
      return `/games/${p.game_id}`;
    }
    case 'game_started': {
      const p = notification.payload as NotificationPayload<'game_started'>;
      return `/games/${p.game_id}`;
    }
    case 'auto_start_blocked': {
      // Oppretteren lander på spill-siden der #544-venter-banneret og
      // roster-status viser hva som mangler.
      const p = notification.payload as NotificationPayload<'auto_start_blocked'>;
      return `/games/${p.game_id}`;
    }
  }
}
