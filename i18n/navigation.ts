import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware navigation primitives. App code must import Link/redirect/
// usePathname/useRouter from HERE (not next/link / next/navigation) so hrefs
// get the correct locale prefix automatically. `as-needed` keeps Norwegian
// hrefs untouched, so swapping the import is behavior-neutral for `no`.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
