import type { ReactNode } from 'react';
import { IntlScope } from '@/components/i18n/IntlScope';

// #2227: the receipt draws the small invitation card from «Klar?», whose text
// lives in the `wizard` namespace (#2458).
export default function Layout({ children }: { children: ReactNode }) {
  return <IntlScope namespaces={['wizard']}>{children}</IntlScope>;
}
