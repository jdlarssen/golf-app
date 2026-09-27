import type { ReactNode } from 'react';
import { getLocale, getMessages, getTimeZone } from 'next-intl/server';
import { pickMessages, type ScopedNamespace } from '@/i18n/clientNamespaces';
import { IntlScopeClient } from './IntlScopeClient';

/**
 * Adds heavy message namespaces to the client provider for the routes below a
 * layout (#2227). The root layout sends only `ROOT_CLIENT_NAMESPACES`; wrap a
 * layout's output in `<IntlScope namespaces={['wizard', 'cup']}>` where its
 * client components need more.
 *
 * Write `namespaces` as a literal array in the JSX, and make `<IntlScope>` the
 * outermost element the layout returns: i18n/clientNamespaces.test.ts reads the
 * literal to check that every route provides what its client code uses.
 */
export async function IntlScope({
  namespaces,
  children,
}: {
  namespaces: readonly ScopedNamespace[];
  children: ReactNode;
}) {
  const [catalog, locale, timeZone] = await Promise.all([
    getMessages(),
    getLocale(),
    getTimeZone(),
  ]);
  return (
    <IntlScopeClient extra={pickMessages(catalog, namespaces)} locale={locale} timeZone={timeZone}>
      {children}
    </IntlScopeClient>
  );
}
