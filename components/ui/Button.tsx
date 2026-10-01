import { ButtonHTMLAttributes, type ReactNode } from 'react';
import { type LinkProps } from 'next/link';
import { SmartLink } from './SmartLink';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';

/**
 * `default` is the pill every screen has used. `compact` is the terminliste's
 * row button (#2258): exactly 44 px high, 13 px / 600, no lift and no shadow,
 * so it sits flush at the end of a list row. `large` is the new-game wizard's
 * «Neste» (#2426): 52 px high, 16 px / 600, no lift or shadow, and a disabled
 * primary turns hairline-beige with muted text instead of fading.
 */
type Size = 'default' | 'compact' | 'large';

// Shared between Button and LinkButton so the pill shape, tap target, and
// hover-lift stay synchronised. Variant-specific colors live in VARIANTS.
// Keyboard focus is NOT declared here — the global `:focus-visible` rule in
// app/globals.css owns it for every interactive element (#1386).
const BASE_CLASSES =
  'inline-flex items-center justify-center min-h-[44px] px-[18px] py-2.5 rounded-full font-medium tracking-tight transition-[background-color,transform,opacity] duration-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary hover:bg-primary-hover text-white dark:text-bg shadow-sm hover:-translate-y-px',
  secondary:
    'bg-transparent border border-border hover:bg-primary-soft text-text',
  danger: 'bg-danger hover:opacity-90 text-white dark:text-bg',
  ghost: 'bg-transparent hover:bg-primary-soft text-text',
  outline: 'border border-primary bg-surface text-primary hover:bg-primary-soft',
};

// `compact` replaces the size classes instead of adding to them: no py-2.5,
// tracking-tight, font-medium — and for primary no shadow or hover-lift.
const COMPACT_BASE =
  'inline-flex shrink-0 items-center justify-center h-11 rounded-full text-[13px] font-semibold transition-[background-color,opacity] duration-100 disabled:opacity-50 disabled:cursor-not-allowed';

const COMPACT_VARIANTS: Record<Variant, string> = {
  primary: 'px-[14px] bg-primary hover:bg-primary-hover text-white dark:text-bg',
  secondary: 'px-[14px] bg-transparent border border-border hover:bg-primary-soft text-text',
  danger: 'px-[14px] bg-danger hover:opacity-90 text-white dark:text-bg',
  ghost: 'px-[14px] bg-transparent hover:bg-primary-soft text-text',
  outline: 'px-3 border border-primary bg-surface text-primary hover:bg-primary-soft',
};

const LARGE_BASE =
  'inline-flex items-center justify-center h-[52px] px-[18px] rounded-full text-base font-semibold transition-[background-color,opacity] duration-100 disabled:cursor-not-allowed';

const LARGE_VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary hover:bg-primary-hover text-white dark:text-bg disabled:bg-border disabled:text-muted dark:disabled:text-muted',
  secondary: 'bg-transparent border border-border hover:bg-primary-soft text-text disabled:opacity-50',
  danger: 'bg-danger hover:opacity-90 text-white dark:text-bg disabled:opacity-50',
  ghost: 'bg-transparent hover:bg-primary-soft text-text disabled:opacity-50',
  outline: 'border border-primary bg-surface text-primary hover:bg-primary-soft disabled:opacity-50',
};

function buttonClasses(variant: Variant, size: Size): string {
  if (size === 'compact') return `${COMPACT_BASE} ${COMPACT_VARIANTS[variant]}`;
  if (size === 'large') return `${LARGE_BASE} ${LARGE_VARIANTS[variant]}`;
  return `${BASE_CLASSES} ${VARIANTS[variant]}`;
}

export function Button({
  variant = 'primary',
  size = 'default',
  className = '',
  pending = false,
  pendingLabel,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  pending?: boolean;
  pendingLabel?: ReactNode;
}) {
  return (
    <button
      {...props}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`${buttonClasses(variant, size)} ${className}`}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Spinner />
          {pendingLabel ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * Anchor styled as a Button. Use anywhere navigation is the action — the
 * Next.js Link gets the same pill shape, forest fill, and hover-lift as
 * <Button>. `full` stretches to the parent's width.
 */
export function LinkButton({
  variant = 'primary',
  size = 'default',
  full = false,
  className = '',
  children,
  ...props
}: LinkProps & {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <SmartLink
      {...props}
      className={`${buttonClasses(variant, size)} ${full ? 'w-full' : ''} ${className}`}
    >
      {children}
    </SmartLink>
  );
}
