import type { ComponentProps } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { AppCtaLink } from './AppCtaLink';

type Variant = Parameters<typeof buttonClasses>[0];
type Size = Parameters<typeof buttonClasses>[1];

/**
 * A demo button that becomes «Hent appen» (#2562, owner's answer 1): the
 * `LinkButton` look on top of `AppCtaLink`, so it goes straight to the store on
 * a phone once the app is in both stores. The class string is built exactly as
 * `LinkButton` builds it, so with the switch off the DOM is the same as before.
 */
export function AppCtaButton({
  variant = 'primary',
  size = 'default',
  full = false,
  className = '',
  ...props
}: ComponentProps<typeof AppCtaLink> & {
  variant?: Variant;
  size?: Size;
  full?: boolean;
}) {
  return (
    <AppCtaLink
      {...props}
      className={`${buttonClasses(variant, size)} ${full ? 'w-full' : ''} ${className}`}
    />
  );
}
