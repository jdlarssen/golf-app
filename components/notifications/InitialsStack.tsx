import type { InboxAvatar } from '@/lib/notifications/inboxSections';

/**
 * The 30 px discs at the start of an inbox row (#2263, artboard «Forslag:
 * oppslagstavla»). Decorative: the row's text says the same, so every disc is
 * `aria-hidden` and a place gets its own screen-reader text in the row.
 */

// Shape only; each disc sets its own face (Tailwind resolves conflicting
// utilities by stylesheet order, not class order, so none are stacked).
const SHAPE = 'flex size-[30px] items-center justify-center rounded-full font-semibold leading-[normal]';
const DISC = `${SHAPE} font-sans text-[10px]`;
// Dark pairs come from the app's FlightAvatars dark suit.
const FIRST = 'bg-primary text-bg-tint dark:text-bg';
const SECOND = 'bg-primary-soft text-primary dark:bg-surface-strong';
const MORE = 'bg-hole-completed-bg text-muted dark:text-text';
const RING = 'shadow-[0_0_0_2px_var(--surface)]';

/**
 * Up to two initials discs, newest person first, then «+N» for the rest. A
 * lone disc has no ring; in a stack each disc gets a 2 px ring in the card
 * colour and overlaps the one before by 8 px.
 */
export function InitialsStack({ initials, more }: { initials: string[]; more: number }) {
  if (initials.length === 1 && more === 0) {
    return (
      <span aria-hidden className={`${DISC} ${FIRST}`} data-testid="initials-disc">
        {initials[0]}
      </span>
    );
  }
  return (
    <span aria-hidden className="flex shrink-0" data-testid="initials-stack">
      {initials.map((ini, i) => (
        <span key={i} className={`${DISC} ${RING} ${i === 0 ? FIRST : `-ml-2 ${SECOND}`}`}>
          {ini}
        </span>
      ))}
      {more > 0 && <span className={`${DISC} ${RING} -ml-2 ${MORE}`}>+{more}</span>}
    </span>
  );
}

/** The disc for any row: initials, the place on a result, or the kind's emoji. */
export function InboxAvatarDisc({ avatar }: { avatar: InboxAvatar }) {
  switch (avatar.kind) {
    case 'people':
      return <InitialsStack initials={avatar.initials} more={avatar.more} />;
    case 'place':
      return (
        <span
          aria-hidden
          data-testid="place-disc"
          className={`${SHAPE} bg-place-disc font-serif text-[13px] text-text`}
        >
          {avatar.rank}
        </span>
      );
    case 'emoji':
      return (
        <span aria-hidden className={`${SHAPE} bg-place-disc`}>
          <span className="text-[15px] leading-none">{avatar.emoji}</span>
        </span>
      );
  }
}
