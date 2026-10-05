import type { ReactNode } from 'react';
import { IntlScope } from '@/components/i18n/IntlScope';

// #2227: the heavy message namespaces this route's client components use.
// #2269: a draft resumes in GameWizard here too, which also reads the format
// guide and the cup strings, as on /opprett-spill.
export default function Layout({ children }: { children: ReactNode }) {
  return <IntlScope namespaces={['wizard', 'formatGuide', 'cup']}>{children}</IntlScope>;
}
