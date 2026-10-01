import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware navigation primitives. App code must import Link/redirect/
// usePathname/useRouter from HERE (not next/link / next/navigation) so hrefs
// get the correct locale prefix automatically. `as-needed` keeps Norwegian
// hrefs untouched, so swapping the import is behavior-neutral for `no`.
const navigation = createNavigation(routing);
export const { Link, usePathname, useRouter, getPathname } = navigation;
// Explicit annotation (#2224): TS only treats a `never`-returning call as an exit
// when the callee has a declared type — a destructured binding does not count.
export const redirect: typeof navigation.redirect = navigation.redirect;
