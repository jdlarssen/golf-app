import type { ReactNode } from 'react';
import { IntlScope } from '@/components/i18n/IntlScope';

// #2227: the heavy message namespaces this route's client components use.
// #2840: the team form's and the team page's friend picker reads `friends`.
export default function Layout({ children }: { children: ReactNode }) {
  return <IntlScope namespaces={['friends']}>{children}</IntlScope>;
}
