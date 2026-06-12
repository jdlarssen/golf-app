'use client';

import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount';

/**
 * Bell-icon i `TopBar` på alle innloggede flater. Tap navigerer til `/innboks`.
 *
 * Når brukeren har minst ett ulest varsel vises en liten champagne-prikk
 * øverst-til-høyre på bjella — designvalg: ingen telletall, kun et signal.
 * Mindre visuell støy enn et tall, fanger fortsatt oppmerksomheten.
 *
 * Returnerer null hvis `userId === null` (ikke innlogget) så TopBar kan
 * mounte komponenten ubetinget uten å måtte gate på auth-state per side.
 *
 * Tap-target er minimum 44×44 px (`min-h-11 min-w-11`) per Tørny-konvensjon.
 */
export function NotificationBell({ userId }: { userId: string | null }) {
  const t = useTranslations('inbox');
  const { count } = useUnreadNotificationsCount(userId);

  if (userId == null) return null;

  const hasUnread = count > 0;
  const ariaLabel = hasUnread
    ? t('bellUnreadAria', { count })
    : t('bellAriaLabel');

  return (
    <SmartLink
      href="/innboks"
      aria-label={ariaLabel}
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-text/80 transition-colors hover:text-text active:bg-surface-2 dark:active:bg-surface-2"
    >
      <BellIcon />
      {hasUnread && (
        <span
          data-testid="bell-dot"
          aria-hidden
          className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full border-2 border-bg"
          style={{ background: 'var(--accent)' }}
        />
      )}
    </SmartLink>
  );
}

/**
 * 24×24 line-icon i samme stil som `components/icons/Icons.tsx` — currentColor,
 * 1.5 stroke, round caps/joins. Holdes lokalt i denne fila siden den kun
 * brukes i NotificationBell og en separat icon-fil ville være overengineering
 * for én call-site.
 */
function BellIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Bjelle-kropp: oppadgående klokkeform med konkav skulder. */}
      <path d="M 6 16 C 6 11 7.5 8 12 8 C 16.5 8 18 11 18 16 Z" />
      {/* Hank/topp. */}
      <path d="M 11 6.5 L 13 6.5" />
      <line x1="12" y1="5" x2="12" y2="6.5" />
      {/* Klakk. */}
      <path d="M 10.5 19 Q 12 20.5 13.5 19" />
    </svg>
  );
}
