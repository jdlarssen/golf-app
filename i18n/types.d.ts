import type { routing } from './routing';
import type messages from '../messages/no.json';

// Official next-intl type augmentation: getLocale()/useLocale() return the
// narrowed AppLocale union instead of string, and translation keys are
// type-checked against the default-locale catalog.
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
