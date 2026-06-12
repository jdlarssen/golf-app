'use client';

import { useTranslations, useLocale } from 'next-intl';
import type {
  NotificationKind,
  NotificationPayload,
} from '@/lib/notifications/types';
import { formatRelativeLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';

/**
 * Generisk shape for en notifications-rad fra DB. Vi unngår direkte
 * Zod-parse her — payload-shape per kind er allerede validert ved insert
 * (lib/notifications/notify.ts), så vi kan strukturelt narrowe basert på
 * kind-diskriminanten.
 */
export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  payload: NotificationPayload;
  read_at: string | null;
  created_at: string;
};

const EMOJI: Record<NotificationKind, string> = {
  invite: '📨',
  peer_approval_request: '✋',
  scorecard_submitted: '📋',
  scorecard_approved: '✅',
  game_finished: '🏆',
  product_update: '✨',
  team_invite: '🤝',
  registration_request: '📩',
  registration_approved: '🎉',
  registration_rejected: '🚫',
  team_member_withdrew: '👋',
  deliver_reminder: '📤',
  cup_finished: '🏁',
  cup_started: '🏌️',
  club_join_request: '🙋',
  club_role_changed: '🔑',
  friend_request: '👋',
  friend_accepted: '🫂',
  player_added: '🏌️',
  game_started: '⛳',
  auto_start_blocked: '⏳',
};

/**
 * Per-kort UI for ett varsel i innboks-listen.
 *
 * Layout:
 *  - Champagne-stripe på venstre kant for uleste (4px wide, --accent)
 *  - Emoji-bobble på venstre (lookup per kind)
 *  - Tittel (font-medium hvis ulest, normal hvis lest) + 1-linjes detalj
 *  - Relativ tidsstempel i aktiv locale til høyre
 *
 * Caller styrer `onTap` — typisk: marker som lest i DB, deretter naviger
 * til kortets deeplink. Selve navigeringen håndteres av parent (caller har
 * full kontekst over router-state og kan optimistic-mutere lokal liste).
 *
 * Tap-target: hele kortet er én button, min-h-11 (44px) per design-spec.
 */
export function NotificationCard({
  notification,
  onTap,
}: {
  notification: NotificationRow;
  onTap?: () => void;
}) {
  const t = useTranslations('inbox');
  const locale = useLocale() as AppLocale;
  const { kind, payload, read_at, created_at } = notification;
  const isUnread = read_at == null;
  const { title, detail } = buildCardContent(kind, payload, t);

  return (
    <button
      type="button"
      onClick={onTap}
      className={`group relative flex w-full items-start gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left min-h-11 transition-colors hover:bg-surface-2 active:bg-surface-2 ${
        isUnread ? '' : 'opacity-80'
      }`}
    >
      {isUnread && (
        <span
          data-testid="unread-stripe"
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full"
          style={{ background: 'var(--accent)' }}
        />
      )}

      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg leading-none"
      >
        {EMOJI[kind]}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={`font-sans text-[14px] leading-tight text-text ${
            isUnread ? 'font-medium' : 'font-normal'
          }`}
        >
          {title}
        </p>
        <p className="mt-1 truncate font-sans text-[12px] text-muted">
          {detail}
        </p>
      </div>

      <time
        dateTime={created_at}
        className="ml-1 shrink-0 self-start whitespace-nowrap pt-0.5 font-sans text-[11px] tabular-nums text-muted"
      >
        {formatRelativeLocale(created_at, locale)}
      </time>
    </button>
  );
}

type Translator = ReturnType<typeof useTranslations<'inbox'>>;

/**
 * Bygger tittel og 1-linjes detalj per kind. Tittel-en er handlings-orientert
 * («Per inviterte deg»), detalj-en konkretiserer mål-spillet eller -aksjonen.
 * Alle strenger leses fra katalog via t() — Norwegian/English per aktiv locale.
 */
function buildCardContent(
  kind: NotificationKind,
  payload: NotificationPayload,
  t: Translator,
): { title: string; detail: string } {
  switch (kind) {
    case 'invite': {
      const p = payload as NotificationPayload<'invite'>;
      return {
        title: t('kinds.invite.title', { invitedByName: p.invited_by_name }),
        detail: t('kinds.invite.detail', { gameName: p.game_name }),
      };
    }
    case 'peer_approval_request': {
      const p = payload as NotificationPayload<'peer_approval_request'>;
      return {
        title: t('kinds.peerApprovalRequest.title'),
        detail: t('kinds.peerApprovalRequest.detail', {
          submitterName: p.submitter_name,
          gameName: p.game_name,
        }),
      };
    }
    case 'scorecard_submitted': {
      const p = payload as NotificationPayload<'scorecard_submitted'>;
      return {
        title: t('kinds.scorecardSubmitted.title'),
        detail: t('kinds.scorecardSubmitted.detail', {
          playerName: p.player_name,
          gameName: p.game_name,
        }),
      };
    }
    case 'scorecard_approved': {
      const p = payload as NotificationPayload<'scorecard_approved'>;
      return {
        title: t('kinds.scorecardApproved.title'),
        detail: t('kinds.scorecardApproved.detail', {
          approverName: p.approver_name,
          gameName: p.game_name,
        }),
      };
    }
    case 'game_finished': {
      const p = payload as NotificationPayload<'game_finished'>;
      return {
        title: t('kinds.gameFinished.title'),
        detail: t('kinds.gameFinished.detail', { gameName: p.game_name }),
      };
    }
    case 'product_update': {
      const p = payload as NotificationPayload<'product_update'>;
      // product_update title/body are DB content — render verbatim in both locales
      return {
        title: p.title,
        detail: p.body,
      };
    }
    case 'team_invite': {
      const p = payload as NotificationPayload<'team_invite'>;
      return {
        title: t('kinds.teamInvite.title', {
          invitedByName: p.invited_by_name,
          teamName: p.team_name,
        }),
        detail: t('kinds.teamInvite.detail', { gameName: p.game_name }),
      };
    }
    case 'registration_request': {
      const p = payload as NotificationPayload<'registration_request'>;
      return {
        title: t('kinds.registrationRequest.title', { requesterName: p.requester_name }),
        detail: t('kinds.registrationRequest.detail', { gameName: p.game_name }),
      };
    }
    case 'registration_approved': {
      const p = payload as NotificationPayload<'registration_approved'>;
      return {
        title: t('kinds.registrationApproved.title', { gameName: p.game_name }),
        detail: t('kinds.registrationApproved.detail'),
      };
    }
    case 'registration_rejected': {
      const p = payload as NotificationPayload<'registration_rejected'>;
      return {
        title: t('kinds.registrationRejected.title', { gameName: p.game_name }),
        // reason is DB content — render verbatim; use catalog fallback when absent
        detail: p.reason ?? t('kinds.registrationRejected.defaultReason'),
      };
    }
    case 'team_member_withdrew': {
      const p = payload as NotificationPayload<'team_member_withdrew'>;
      return {
        title: t('kinds.teamMemberWithdrew.title', { withdrawnPlayerName: p.withdrawn_player_name }),
        detail: t('kinds.teamMemberWithdrew.detail', {
          teamName: p.team_name,
          gameName: p.game_name,
        }),
      };
    }
    case 'deliver_reminder': {
      const p = payload as NotificationPayload<'deliver_reminder'>;
      return {
        title: t('kinds.deliverReminder.title'),
        detail: t('kinds.deliverReminder.detail', { gameName: p.game_name }),
      };
    }
    case 'cup_finished': {
      const p = payload as NotificationPayload<'cup_finished'>;
      return {
        title: t('kinds.cupFinished.title'),
        detail: t('kinds.cupFinished.detail', { tournamentName: p.tournament_name }),
      };
    }
    case 'cup_started': {
      const p = payload as NotificationPayload<'cup_started'>;
      return {
        title: t('kinds.cupStarted.title'),
        detail: t('kinds.cupStarted.detail', { tournamentName: p.tournament_name }),
      };
    }
    case 'club_join_request': {
      const p = payload as NotificationPayload<'club_join_request'>;
      return {
        title: t('kinds.clubJoinRequest.title', { requesterName: p.requester_name }),
        detail: t('kinds.clubJoinRequest.detail', { groupName: p.group_name }),
      };
    }
    case 'club_role_changed': {
      const p = payload as NotificationPayload<'club_role_changed'>;
      const detail =
        p.new_role === 'owner'
          ? t('kinds.clubRoleChanged.detailOwner', { groupName: p.group_name })
          : p.new_role === 'admin'
            ? t('kinds.clubRoleChanged.detailAdmin', { groupName: p.group_name })
            : t('kinds.clubRoleChanged.detailMember', { groupName: p.group_name });
      return {
        title: t('kinds.clubRoleChanged.title'),
        detail,
      };
    }
    case 'friend_request': {
      const p = payload as NotificationPayload<'friend_request'>;
      return {
        title: t('kinds.friendRequest.title', {
          actorName: p.actor_name ?? t('someoneFallback'),
        }),
        detail: t('kinds.friendRequest.detail'),
      };
    }
    case 'friend_accepted': {
      const p = payload as NotificationPayload<'friend_accepted'>;
      return {
        title: t('kinds.friendAccepted.title', {
          actorName: p.actor_name ?? t('someoneFallback'),
        }),
        detail: t('kinds.friendAccepted.detail'),
      };
    }
    case 'player_added': {
      const p = payload as NotificationPayload<'player_added'>;
      return {
        title: t('kinds.playerAdded.title', {
          addedByName: p.added_by_name,
          gameName: p.game_name,
        }),
        detail: t('kinds.playerAdded.detail'),
      };
    }
    case 'game_started': {
      const p = payload as NotificationPayload<'game_started'>;
      return {
        title: t('kinds.gameStarted.title'),
        detail: t('kinds.gameStarted.detail', { gameName: p.game_name }),
      };
    }
    case 'auto_start_blocked': {
      const p = payload as NotificationPayload<'auto_start_blocked'>;
      return {
        title: t('kinds.autoStartBlocked.title'),
        detail: t('kinds.autoStartBlocked.detail', {
          gameName: p.game_name,
          reason: blockReasonText(p.reason, t),
        }),
      };
    }
  }
}

type BlockReasonKey = 'incomplete_sides' | 'pending_players' | 'no_players' | 'tee_missing' | 'tee_missing_rating';

const KNOWN_BLOCK_REASONS: ReadonlySet<string> = new Set<BlockReasonKey>([
  'incomplete_sides',
  'pending_players',
  'no_players',
  'tee_missing',
  'tee_missing_rating',
]);

/**
 * Oversetter blokkeringsårsaken fra startScheduledGame til noe oppretteren
 * kan handle på. Generisk fallback for ukjente/fremtidige reasons — payload-
 * skjemaet er bevisst løst typet (se types.ts).
 */
function blockReasonText(reason: string, t: Translator): string {
  if (KNOWN_BLOCK_REASONS.has(reason)) {
    return t(`blockReasons.${reason as BlockReasonKey}`);
  }
  return t('blockReasons.default');
}
