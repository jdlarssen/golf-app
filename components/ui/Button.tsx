import { ButtonHTMLAttributes, type ReactNode } from 'react';
import { type LinkProps } from 'next/link';
import { SmartLink } from './SmartLink';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

// Shared between Button and LinkButton so the pill shape, tap target, and
// hover-lift stay synchronised. Variant-specific colors live in VARIANTS.
const BASE_CLASSES =
  'inline-flex items-center justify-center min-h-[44px] px-[18px] py-2.5 rounded-full font-medium tracking-tight transition-[background-color,transform,opacity] duration-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary hover:bg-primary-hover text-white dark:text-bg shadow-sm hover:-translate-y-px',
  secondary:
    'bg-transparent border border-border hover:bg-primary-soft text-text',
  danger: 'bg-danger hover:opacity-90 text-white dark:text-bg',
  ghost: 'bg-transparent hover:bg-primary-soft text-text',
};

export function Button({
  variant = 'primary',
  className = '',
  pending = false,
  pendingLabel,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  pending?: boolean;
  pendingLabel?: ReactNode;
}) {
  return (
    <button
      {...props}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`${BASE_CLASSES} ${VARIANTS[variant]} ${className}`}
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
  full = false,
  className = '',
  children,
  ...props
}: LinkProps & {
  variant?: Variant;
  full?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <SmartLink
      {...props}
      className={`${BASE_CLASSES} ${VARIANTS[variant]} ${full ? 'w-full' : ''} ${className}`}
    >
      {children}
    </SmartLink>
  );
}
