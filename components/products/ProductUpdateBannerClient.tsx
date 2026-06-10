'use client';

import { useState, useTransition } from 'react';
import { markOneAsRead } from '@/app/[locale]/innboks/actions';
import { SmartLink } from '@/components/ui/SmartLink';

/**
 * Dismissible in-app banner for new product updates (issue #202).
 *
 * Champagne-stripe på venstre kant (samme aksent som unread-stripe i
 * NotificationCard) for visuell konsistens. Dismiss er optimistisk —
 * banneret forsvinner umiddelbart fra DOM-en, mens markOneAsRead-action
 * sendes i bakgrunnen.
 */
export function ProductUpdateBannerClient({
  notificationId,
  title,
  body,
  link,
  ctaLabel,
}: {
  notificationId: string;
  title: string;
  body: string;
  link: string | null;
  ctaLabel: string | null;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  if (dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    startTransition(() => {
      void markOneAsRead(notificationId);
    });
  }

  return (
    <div
      data-testid="product-update-banner"
      className="relative mb-4 overflow-hidden rounded-xl border border-border bg-surface px-4 py-3 pl-5"
    >
      <span
        aria-hidden
        className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full"
        style={{ background: 'var(--accent)' }}
      />
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-lg leading-none">
          ✨
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[14px] font-medium leading-tight text-text">
            {title}
          </p>
          <p className="mt-1 font-sans text-[13px] leading-snug text-muted">
            {body}
          </p>
          {link && ctaLabel && (
            <div className="mt-2">
              <SmartLink
                href={link}
                onClick={handleDismiss}
                className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 py-2 font-sans text-[13px] font-medium text-bg transition-colors hover:bg-primary/90"
              >
                {ctaLabel}
              </SmartLink>
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Lukk varselet"
          onClick={handleDismiss}
          className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-bg hover:text-text"
        >
          <span aria-hidden className="text-base leading-none">
            ✕
          </span>
        </button>
      </div>
    </div>
  );
}
