'use client';

import type {
  NotificationKind,
  NotificationPayload,
} from '@/lib/notifications/types';
import { formatRelativeNb } from '@/lib/format/relativeTimeNb';

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
};

/**
 * Per-kort UI for ett varsel i innboks-listen.
 *
 * Layout:
 *  - Champagne-stripe på venstre kant for uleste (4px wide, --accent)
 *  - Emoji-bobble på venstre (lookup per kind)
 *  - Tittel (font-medium hvis ulest, normal hvis lest) + 1-linjes detalj
 *  - Relativ tidsstempel på norsk («for 1 time siden», «i går» osv.) til høyre
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
  const { kind, payload, read_at, created_at } = notification;
  const isUnread = read_at == null;
  const { title, detail } = buildCardContent(kind, payload);

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
        {formatRelativeNb(created_at)}
      </time>
    </button>
  );
}

/**
 * Bygger tittel og 1-linjes detalj per kind. Tittel-en er handlings-orientert
 * («Per inviterte deg»), detalj-en konkretiserer mål-spillet eller -aksjonen.
 * Norsk bokmål, sporty kompis-tone per brand-stemmen.
 */
function buildCardContent(
  kind: NotificationKind,
  payload: NotificationPayload,
): { title: string; detail: string } {
  switch (kind) {
    case 'invite': {
      const p = payload as NotificationPayload<'invite'>;
      return {
        title: `${p.invited_by_name} inviterte deg`,
        detail: p.game_name,
      };
    }
    case 'peer_approval_request': {
      const p = payload as NotificationPayload<'peer_approval_request'>;
      return {
        title: 'Godkjenning trengs',
        detail: `${p.submitter_name} leverte scorekortet i ${p.game_name}`,
      };
    }
    case 'scorecard_submitted': {
      const p = payload as NotificationPayload<'scorecard_submitted'>;
      return {
        title: 'Nytt scorekort levert',
        detail: `${p.player_name} leverte i ${p.game_name}`,
      };
    }
    case 'scorecard_approved': {
      const p = payload as NotificationPayload<'scorecard_approved'>;
      return {
        title: 'Scorekortet er godkjent',
        detail: `${p.approver_name} godkjente kortet i ${p.game_name}`,
      };
    }
    case 'game_finished': {
      const p = payload as NotificationPayload<'game_finished'>;
      return {
        title: 'Resultatet er klart',
        detail: p.game_name,
      };
    }
    case 'product_update': {
      const p = payload as NotificationPayload<'product_update'>;
      return {
        title: p.title,
        detail: p.body,
      };
    }
    case 'team_invite': {
      const p = payload as NotificationPayload<'team_invite'>;
      return {
        title: `${p.invited_by_name} vil ha deg i ${p.team_name}`,
        detail: p.game_name,
      };
    }
    case 'registration_request': {
      const p = payload as NotificationPayload<'registration_request'>;
      return {
        title: `${p.requester_name} vil bli med`,
        detail: p.game_name,
      };
    }
    case 'registration_approved': {
      const p = payload as NotificationPayload<'registration_approved'>;
      return {
        title: `Du er med i ${p.game_name}`,
        detail: 'Påmeldingen er godkjent',
      };
    }
    case 'registration_rejected': {
      const p = payload as NotificationPayload<'registration_rejected'>;
      return {
        title: `Søknad til ${p.game_name}`,
        detail: p.reason ?? 'Påmeldingen ble dessverre ikke godkjent',
      };
    }
    case 'team_member_withdrew': {
      const p = payload as NotificationPayload<'team_member_withdrew'>;
      return {
        title: `${p.withdrawn_player_name} trakk seg`,
        detail: `${p.team_name} i ${p.game_name}`,
      };
    }
    case 'deliver_reminder': {
      const p = payload as NotificationPayload<'deliver_reminder'>;
      return {
        title: 'Husk å levere scorekortet',
        detail: `Du er ferdig i ${p.game_name}`,
      };
    }
    case 'cup_finished': {
      const p = payload as NotificationPayload<'cup_finished'>;
      return {
        title: 'Cupen er ferdigspilt',
        detail: p.tournament_name,
      };
    }
    case 'cup_started': {
      const p = payload as NotificationPayload<'cup_started'>;
      return {
        title: 'Cupen har startet',
        detail: p.tournament_name,
      };
    }
    case 'club_join_request': {
      const p = payload as NotificationPayload<'club_join_request'>;
      return {
        title: `${p.requester_name} vil bli med i klubben`,
        detail: p.group_name,
      };
    }
    case 'club_role_changed': {
      const p = payload as NotificationPayload<'club_role_changed'>;
      const roleText =
        p.new_role === 'owner'
          ? `Du er nå eier av ${p.group_name}`
          : p.new_role === 'admin'
            ? `Du er nå admin i ${p.group_name}`
            : `Rollen din i ${p.group_name} er nå medlem`;
      return {
        title: 'Rollen din er endret',
        detail: roleText,
      };
    }
    case 'friend_request': {
      const p = payload as NotificationPayload<'friend_request'>;
      return {
        title: `${p.actor_name} vil bli venn`,
        detail: 'Godta eller avslå i vennelista',
      };
    }
    case 'friend_accepted': {
      const p = payload as NotificationPayload<'friend_accepted'>;
      return {
        title: `${p.actor_name} ble venn med deg`,
        detail: 'Dere er venner nå',
      };
    }
    case 'player_added': {
      const p = payload as NotificationPayload<'player_added'>;
      return {
        title: `${p.added_by_name} la deg til i ${p.game_name}`,
        detail: 'Åpne spillet for å bekrefte at du er med.',
      };
    }
  }
}

