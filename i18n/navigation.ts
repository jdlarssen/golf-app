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
//
// `'replace'` is the default (#2746, `docs/user-flows.md` §Tilbake): in a server
// action Next's own default is `push`, which left the form you just sent in the
// browser's history. Say `'push'` to keep the page behind you.
export const redirect: typeof navigation.redirect = (args, type = 'replace') =>
  navigation.redirect(args, type);
