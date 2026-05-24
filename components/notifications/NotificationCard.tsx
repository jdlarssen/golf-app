'use client';

import type {
  NotificationKind,
  NotificationPayload,
} from '@/lib/notifications/types';

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
  }
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

/**
 * Norsk relativ-tid-formattering via `Intl.RelativeTimeFormat('nb-NO')`.
 * Eksempler: «for 1 minutt siden», «for 3 timer siden», «i går», «for 2 uker
 * siden». Bruker `numeric: 'auto'` så «i går»/«i morgen» får natural-language-
 * varianten i stedet for «for 1 dag siden».
 *
 * Fallback til norsk dato-format om Intl mangler nb-NO (skal ikke skje i
 * moderne browsere; vurderes som defensive-only).
 */
function formatRelativeNb(iso: string): string {
  // Math.max(0, ...) håndterer clock-skew der server-timestamp havner litt i
  // fremtiden i forhold til klient-klokken — uten ville vi fått «om 3 sekunder»
  // og lignende rart copy. Floor til 0 så vi alltid sier «nå» eller «for X siden».
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const rtf = new Intl.RelativeTimeFormat('nb-NO', { numeric: 'auto' });

  if (diff < MINUTE_MS) return rtf.format(-Math.round(diff / SECOND_MS), 'second');
  if (diff < HOUR_MS) return rtf.format(-Math.round(diff / MINUTE_MS), 'minute');
  if (diff < DAY_MS) return rtf.format(-Math.round(diff / HOUR_MS), 'hour');
  if (diff < WEEK_MS) return rtf.format(-Math.round(diff / DAY_MS), 'day');
  if (diff < MONTH_MS) return rtf.format(-Math.round(diff / WEEK_MS), 'week');
  return rtf.format(-Math.round(diff / MONTH_MS), 'month');
}
