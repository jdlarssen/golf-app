'use client';

import { useTranslations, useLocale } from 'next-intl';
import type {
  NotificationKind,
  NotificationPayload,
} from '@/lib/notifications/types';
import { formatRelativeLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import { SmartLink } from '@/components/ui/SmartLink';
import { buildNotificationText } from '@/lib/notifications/cardContent';

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
  registration_expired: '⏱️',
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
  achievement_unlocked: '🏅',
  idea_built: '💡',
  payment_reminder: '💸',
};

/**
 * Per-kort UI for ett varsel i innboks-listen.
 *
 * Layout:
 *  - Champagne-stripe på venstre kant for uleste (4px wide, --accent)
 *  - Emoji-bobble på venstre (lookup per kind)
 *  - Tittel (font-medium hvis ulest, normal hvis lest) + 2-linjes detalj
 *  - Relativ tidsstempel i aktiv locale til høyre
 *  - ✕-arkiv-knapp ytterst til høyre når `onArchive` er gitt (#616)
 *
 * Caller styrer `onTap` — typisk: marker som lest i DB, deretter naviger
 * til kortets deeplink. Selve navigeringen håndteres av parent (caller har
 * full kontekst over router-state og kan optimistic-mutere lokal liste).
 *
 * Struktur: rot er en `<div>` (ikke `<button>`), så hoved-tap-arealet og
 * ✕-knappen er søsken-knapper — nestede interaktive elementer er ugyldig
 * HTML. Klikk på ✕ trigger derfor ikke kort-tappen. Begge har ≥44px
 * tap-target (hoved: min-h-11, ✕: w-11 + items-stretch).
 *
 * `product_update` (lanseringer) får en egen layout: full brødtekst (ingen
 * 2-linjers klamp) + en dedikert CTA-knapp til lenken, slik at lang tekst kan
 * leses i innboksen uten at tappen kaster deg ut til lenken. Speiler
 * ProductUpdateBanner. Deeplink-en returnerer `null` for denne kind-en, så
 * kort-tappen markerer kun som lest.
 */
export function NotificationCard({
  notification,
  onTap,
  onArchive,
}: {
  notification: NotificationRow;
  onTap?: () => void;
  onArchive?: () => void;
}) {
  const t = useTranslations('inbox');
  const locale = useLocale() as AppLocale;
  const { kind, payload, read_at, created_at } = notification;
  const isUnread = read_at == null;
  const { title, detail } = buildNotificationText(
    kind,
    payload,
    t as unknown as import('@/lib/notifications/cardContent').NotificationTranslator,
  );

  // Delt chrome (rot, ulest-stripe, emoji, tidsstempel, arkiv-knapp) gjenbrukes
  // av begge layoutene under, så de to grenene kun skiller seg i selve innholdet.
  const rootClassName = `group relative flex items-stretch overflow-hidden rounded-xl border border-border bg-surface transition-colors ${
    isUnread ? '' : 'opacity-80'
  }`;
  const titleClassName = `font-sans text-[14px] leading-tight text-text ${
    isUnread ? 'font-medium' : 'font-normal'
  }`;

  const stripe = isUnread ? (
    <span
      data-testid="unread-stripe"
      aria-hidden
      className="absolute left-0 top-2 bottom-2 z-10 w-1 rounded-r-full"
      style={{ background: 'var(--accent)' }}
    />
  ) : null;

  const emoji = (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg leading-none"
    >
      {EMOJI[kind]}
    </span>
  );

  const timestamp = (
    <time
      dateTime={created_at}
      className="ml-1 shrink-0 self-start whitespace-nowrap pt-0.5 font-sans text-[11px] tabular-nums text-muted"
    >
      {formatRelativeLocale(created_at, locale)}
    </time>
  );

  // Lanseringer (product_update) kan ha lang brødtekst og en CTA-lenke.
  // Kunngjørings-oppsett: emoji + tittel + tidsstempel på topp-raden, så hele
  // brødteksten i kolonne-bredde under (ikke klemt inn ved siden av
  // tidsstempelet, slik det generiske «emoji | innhold | tid»-radoppsettet
  // gjorde — der ble lang tekst en tynn remse). Dedikert CTA-knapp navigerer;
  // kort-tappen markerer bare som lest (deeplink-en returnerer null her).
  if (kind === 'product_update') {
    const p = payload as NotificationPayload<'product_update'>;
    const showCta = Boolean(p.link && p.cta_label);
    return (
      <div className={rootClassName}>
        {stripe}
        <div className="flex min-w-0 flex-1 items-start gap-3 px-3.5 py-3">
          {emoji}
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onTap}
              className="block w-full text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <p className={`min-w-0 ${titleClassName}`}>{title}</p>
                {timestamp}
              </div>
              <p className="mt-1.5 font-sans text-[13px] leading-relaxed text-muted">
                {detail}
              </p>
            </button>
            {showCta && (
              <div className="mt-3">
                <SmartLink
                  href={p.link!}
                  onClick={onTap}
                  className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 py-2 font-sans text-[13px] font-medium text-bg transition-colors hover:bg-primary/90"
                >
                  {p.cta_label}
                </SmartLink>
              </div>
            )}
          </div>
        </div>
        {onArchive && (
          <ArchiveButton
            onArchive={onArchive}
            label={t('archiveAria')}
            className="h-11 w-11 self-start"
          />
        )}
      </div>
    );
  }

  return (
    <div className={rootClassName}>
      {stripe}

      <button
        type="button"
        onClick={onTap}
        className="flex min-h-11 min-w-0 flex-1 items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-2 active:bg-surface-2"
      >
        {emoji}

        <div className="min-w-0 flex-1">
          <p className={titleClassName}>{title}</p>
          <p className="mt-1 line-clamp-2 font-sans text-[12px] text-muted">
            {detail}
          </p>
        </div>

        {timestamp}
      </button>

      {onArchive && (
        <ArchiveButton
          onArchive={onArchive}
          label={t('archiveAria')}
          className="w-11"
        />
      )}
    </div>
  );
}

/**
 * Arkiv-✕ (#616). Generiske kort lar knappen strekke seg i full korthøyde
 * (`className="w-11"` + parentens `items-stretch`), så ✕ sentreres vertikalt på
 * et lavt kort. product_update-kortet er høyt (full brødtekst), så der
 * top-justeres den (`h-11 w-11 self-start`) i stedet for å flyte midt på.
 */
function ArchiveButton({
  onArchive,
  label,
  className,
}: {
  onArchive: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onArchive}
      aria-label={label}
      className={`flex shrink-0 items-center justify-center text-muted transition-colors hover:bg-surface-2 hover:text-text active:bg-surface-2 ${className ?? ''}`}
    >
      <XIcon />
    </button>
  );
}

/**
 * Liten ✕ for arkiv-knappen. Holdes lokalt her (samme mønster som
 * NotificationBell's BellIcon) siden den kun brukes på denne ene call-site —
 * en separat icon-fil ville vært overengineering. currentColor + 1.5 stroke
 * + round caps, i tråd med components/icons/Icons.tsx-stilen.
 */
function XIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

