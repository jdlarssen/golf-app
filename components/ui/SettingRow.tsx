import { type ReactNode } from 'react';
import { SmartLink } from './SmartLink';

type Tone = 'default' | 'danger';

const LABEL_TONE: Record<Tone, string> = {
  default: 'text-text',
  danger: 'text-danger-deep',
};

const CHEVRON_TONE: Record<Tone, string> = {
  default: 'text-muted',
  danger: 'text-danger-deep/70',
};

// One frame shared by the link, download-anchor, and button forms so they line
// up identically. `border-t` + `first:border-t-0` draws the separators between
// rows without depending on which optional rows (e.g. the install row, which
// self-hides when the app is already installed) actually render.
const ROW_CLASSES =
  'flex w-full items-center justify-between gap-3 min-h-[56px] px-5 py-4 text-left transition-colors hover:bg-bg active:bg-bg border-t border-border first:border-t-0';

function Chevron({ tone }: { tone: Tone }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 ${CHEVRON_TONE[tone]}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function RowContent({
  label,
  sublabel,
  tone,
}: {
  label: string;
  sublabel?: string;
  tone: Tone;
}) {
  return (
    <>
      <span className="min-w-0">
        <span
          className={`block font-serif text-base font-medium ${LABEL_TONE[tone]}`}
        >
          {label}
        </span>
        {sublabel ? (
          <span className="mt-0.5 block text-xs text-muted">{sublabel}</span>
        ) : null}
      </span>
      <Chevron tone={tone} />
    </>
  );
}

type SettingRowProps = {
  label: string;
  /** Optional muted second line. Omit it to keep the row to a single line. */
  sublabel?: string;
  tone?: Tone;
  /** Internal navigation target (rendered via SmartLink for prefetch). */
  href?: string;
  /** With `href`, render a plain download anchor instead of a SPA link. */
  download?: boolean;
  /** Render the row as a <button>. Takes precedence over `href`. */
  onClick?: () => void;
};

/**
 * Compact tappable row for settings-style lists. Renders as a button when
 * `onClick` is given, a download anchor when `download` is set, otherwise an
 * internal `SmartLink`. Wrap a group of rows in {@link SettingList}.
 */
export function SettingRow({
  label,
  sublabel,
  tone = 'default',
  href,
  download,
  onClick,
}: SettingRowProps) {
  const content = <RowContent label={label} sublabel={sublabel} tone={tone} />;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={ROW_CLASSES}>
        {content}
      </button>
    );
  }
  if (download && href) {
    return (
      <a href={href} download className={ROW_CLASSES}>
        {content}
      </a>
    );
  }
  // Link form. `href` is guaranteed by callers that don't pass `onClick`.
  if (!href) return null;
  return (
    <SmartLink href={href} className={ROW_CLASSES}>
      {content}
    </SmartLink>
  );
}

/**
 * Bordered, rounded container that groups {@link SettingRow}s into one card-like
 * surface — matches the elevation of {@link Card} but lets rows draw their own
 * separators edge-to-edge.
 */
export function SettingList({
  children,
  ariaLabel,
}: {
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <div
      aria-label={ariaLabel}
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(26,46,31,0.04),0_2px_8px_rgba(26,46,31,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
    >
      {children}
    </div>
  );
}
