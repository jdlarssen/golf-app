'use client';

import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import type { InboxEntryView } from '@/lib/notifications/inboxSections';
import { InboxAvatarDisc } from './InitialsStack';

/**
 * A row under I DAG or TIDLIGERE (#2263): disc, title, subtitle and, when the
 * row has somewhere to go, the arrow. One component for single rows and group
 * rows («4 scorekort levert») — they share the layout; the view decides what
 * the disc and the text say.
 *
 * - With a target the whole row is one link. A tap marks the row read
 *   (`onActivate`) and the link navigates.
 * - Without one (a declined signup, «Vi bygde det du foreslo», a signup an
 *   organiser without the admin role cannot answer) it is a button that only
 *   marks read, and it has no arrow: an arrow would promise a page.
 * - `product_update` keeps its body text and its call-to-action link next to
 *   the read button, so no link sits inside another.
 *
 * Read and unread rows look the same; only the green dot on the disc tells
 * them apart.
 */

const ROW =
  'flex min-h-16 items-center gap-3 px-3.5 py-3 text-text no-underline text-left';
const IN_CARD = 'w-full border-b border-row-divider-warm last:border-b-0';
const AS_CARD = 'mx-4 rounded-2xl border border-border bg-surface';

export function InboxRow({
  view,
  unread,
  unreadLabel,
  onActivate,
  asCard = false,
}: {
  view: InboxEntryView;
  unread: boolean;
  unreadLabel: string;
  onActivate: () => void;
  /** The section's only link row is the card itself (TIDLIGERE on the artboard). */
  asCard?: boolean;
}) {
  const disc = (
    <span className="relative shrink-0">
      <InboxAvatarDisc avatar={view.avatar} />
      {unread && (
        <span
          aria-hidden
          data-testid="unread-dot"
          className="absolute -left-0.5 -top-0.5 size-2.5 rounded-full bg-primary shadow-[0_0_0_2px_var(--surface)]"
        />
      )}
    </span>
  );

  const text = (extra?: ReactNode) => (
    <span className="min-w-0 grow">
      <span className="block text-[15px] font-semibold leading-[normal]">{view.title}</span>
      <span
        className={`block text-[13px] leading-[normal] text-muted ${
          view.subtitleIsFreeText ? 'line-clamp-2' : ''
        }`}
      >
        {view.subtitle}
      </span>
      {extra}
      {view.placeLabel && <span className="sr-only">{view.placeLabel}</span>}
      {unread && <span className="sr-only">{unreadLabel}</span>}
    </span>
  );

  if (view.body !== null) {
    return (
      <div
        className={`px-3.5 py-3 ${asCard ? AS_CARD : IN_CARD}`}
        data-focus-inset
        data-testid="inbox-row"
      >
        <button type="button" onClick={onActivate} className="flex w-full items-start gap-3 text-left text-text">
          {disc}
          {text(
            <span className="mt-0.5 block text-[13px] leading-[normal] text-text">{view.body}</span>,
          )}
        </button>
        {view.cta && (
          <Link
            href={view.cta.href}
            onClick={onActivate}
            className="mt-2.5 ml-[42px] inline-flex h-11 items-center rounded-full border-0 bg-primary px-[18px] text-[14px] font-semibold leading-[normal] text-white no-underline dark:text-bg"
          >
            {view.cta.label}
          </Link>
        )}
      </div>
    );
  }

  const className = `${ROW} ${asCard ? AS_CARD : IN_CARD}`;

  if (view.destination) {
    return (
      <Link
        href={view.destination}
        onClick={onActivate}
        className={className}
        data-focus-inset
        data-testid="inbox-row"
      >
        {disc}
        {text()}
        <span aria-hidden className="shrink-0 font-[system-ui] text-[18px] leading-[normal] text-primary">
          →
        </span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onActivate}
      className={className}
      data-focus-inset
      data-testid="inbox-row"
    >
      {disc}
      {text()}
    </button>
  );
}
