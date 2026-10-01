'use client';

import { Link } from '@/i18n/navigation';
import type { InboxEntryView } from '@/lib/notifications/inboxSections';

/**
 * A row in KREVER HANDLING (#2263): green dot, title, subtitle and the
 * button(s) under them. The row itself is not a link — the buttons are.
 *
 * - A signup request you can answer gets «Godta» and «Avslå» (owner's answer
 *   13), which act in place through `onDecide`.
 * - Every other row gets one button that marks the row read (`onOpen`) and
 *   goes where the notification points, as a tap on the old card did.
 *
 * Built without the Button base: its medium weight, tight tracking, shadow
 * and hover lift are not on the artboard.
 */

const BUTTON =
  'inline-flex h-11 items-center rounded-full px-[18px] text-[14px] font-semibold leading-[normal] no-underline disabled:opacity-60';
const PRIMARY = 'border-0 bg-primary text-white dark:text-bg';
const SECONDARY = 'border border-border bg-surface text-text';

export function InboxActionRow({
  view,
  labels,
  onOpen,
  onDecide,
  pending = false,
}: {
  view: InboxEntryView;
  labels: { unread: string; button: string; approve: string; reject: string };
  onOpen: () => void;
  onDecide?: (decision: 'approve' | 'reject') => void;
  /** An answer is on its way: the buttons keep their width and wait. */
  pending?: boolean;
}) {
  return (
    <div
      className="border-b border-row-divider-warm px-3.5 pb-3 pt-3.5 last:border-b-0"
      data-testid="inbox-action-row"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden data-testid="unread-dot" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary" />
        <div className="min-w-0 grow">
          <p className="text-[15px] font-semibold leading-[normal] text-text">
            {view.title}
            <span className="sr-only">, {labels.unread}</span>
          </p>
          <p className="mt-0.5 text-[13px] leading-[normal] text-muted">{view.subtitle}</p>
          {view.quote && (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-[normal] text-muted">{view.quote}</p>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex gap-2 pl-[22px]">
        {view.actionKey === 'decide' && onDecide ? (
          <>
            <button
              type="button"
              onClick={() => onDecide('approve')}
              disabled={pending}
              aria-busy={pending || undefined}
              className={`${BUTTON} ${PRIMARY}`}
            >
              {labels.approve}
            </button>
            <button
              type="button"
              onClick={() => onDecide('reject')}
              disabled={pending}
              aria-busy={pending || undefined}
              className={`${BUTTON} ${SECONDARY}`}
            >
              {labels.reject}
            </button>
          </>
        ) : (
          view.destination && (
            <Link href={view.destination} onClick={onOpen} className={`${BUTTON} ${PRIMARY}`}>
              {labels.button}
            </Link>
          )
        )}
      </div>
    </div>
  );
}
