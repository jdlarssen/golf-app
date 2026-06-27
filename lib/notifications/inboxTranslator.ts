import 'server-only';
import { createTranslator } from 'next-intl';
import { getMailMessages, resolveMailLocale } from '@/lib/mail/i18n';
import type { NotificationTranslator } from './cardContent';

/**
 * A translator scoped to the `inbox` namespace for a RECIPIENT's locale — the
 * server-side twin of the client `useTranslations('inbox')`. Reuses the mail
 * i18n catalog loader (per-recipient locale, ICU, Oslo timezone) so push text
 * matches the inbox card text exactly. See spec §8.3.
 */
export async function getInboxTranslator(
  locale: string | null | undefined,
): Promise<NotificationTranslator> {
  const loc = resolveMailLocale(locale);
  const t = createTranslator({
    locale: loc,
    messages: await getMailMessages(loc),
    namespace: 'inbox',
    timeZone: 'Europe/Oslo',
  });
  return t as unknown as NotificationTranslator;
}
