import { ButtonHTMLAttributes } from 'react';
import { type LinkProps } from 'next/link';
import { SmartLink } from './SmartLink';

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
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`${BASE_CLASSES} ${VARIANTS[variant]} ${className}`}
    />
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
