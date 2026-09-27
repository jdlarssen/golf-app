'use client';

import { useMemo, type ReactNode } from 'react';
import { NextIntlClientProvider, useMessages, type Locale, type Messages } from 'next-intl';

/**
 * Client half of `<IntlScope>` (#2227): a nested provider whose messages are
 * the parent provider's (the root selection) plus the extra namespaces the
 * server half picked. Only `extra` crosses the wire, so the root selection is
 * never sent twice.
 *
 * `locale` and `timeZone` are passed on explicitly. A client-rendered provider
 * does not inherit them, and without `timeZone` use-intl warns
 * (ENVIRONMENT_FALLBACK) and may format dates differently from the server.
 *
 * The one client module allowed to call `useMessages()`
 * (i18n/clientNamespaces.test.ts).
 */
export function IntlScopeClient({
  extra,
  locale,
  timeZone,
  children,
}: {
  extra: Partial<Messages>;
  locale: Locale;
  timeZone: string;
  children: ReactNode;
}) {
  const parent = useMessages();
  const messages = useMemo(() => ({ ...parent, ...extra }), [parent, extra]);
  return (
    <NextIntlClientProvider locale={locale} timeZone={timeZone} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
