import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const styles: Record<Variant, string> = {
  primary:
    'bg-primary hover:bg-primary-hover text-white hover:-translate-y-px shadow-sm',
  secondary:
    'bg-transparent border border-border hover:bg-primary-soft text-text',
  danger: 'bg-danger hover:opacity-90 text-white',
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
      className={`${styles[variant]} px-4 py-2.5 rounded-full font-medium tracking-tight transition-[background-color,transform,opacity] duration-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${className}`}
    />
  );
}
