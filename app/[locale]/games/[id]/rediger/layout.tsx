import type { ReactNode } from 'react';
import { IntlScope } from '@/components/i18n/IntlScope';

// #2227: the heavy message namespaces this route's client components use.
export default function Layout({ children }: { children: ReactNode }) {
  return <IntlScope namespaces={['wizard']}>{children}</IntlScope>;
}
