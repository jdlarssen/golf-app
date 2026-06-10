import { defineRouting } from 'next-intl/routing';

// Single source of truth for supported locales.
//
// Adding a locale takes exactly two steps — nothing else in the codebase
// should need to change (this is the N-locale criterion from epic #60):
//   1. Append the code to `locales` below.
//   2. Create `messages/<code>.json` (missing keys fall back to `no`).
export const routing = defineRouting({
  locales: [
    'no', // norsk (bokmål) — default, unprefixed URLs
    'en', // English — served under /en/...
  ],
  defaultLocale: 'no',
  // Default locale keeps today's exact URLs (/finn-turneringer); only
  // non-default locales get a prefix (/en/finn-turneringer).
  localePrefix: 'as-needed',
});

export type AppLocale = (typeof routing.locales)[number];
