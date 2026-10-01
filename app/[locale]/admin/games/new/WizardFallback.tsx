'use client';

import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/Skeleton';
import { WizardTopBar } from './GameWizard';

/**
 * WizardFallback — what the create routes show while the wizard's data loads
 * (#2260). The wizard owns its top now, so without this the page would stand
 * without a way back until the data arrived (TopBar used to sit outside the
 * Suspense boundary). The top bar with the arrow as a link out, the door alone
 * in the kicker, an empty track, and the skeleton under it.
 */
export function WizardFallback({ backHref }: { backHref: string }) {
  const t = useTranslations('wizard');
  return (
    <div>
      <WizardTopBar backHref={backHref} backLabel={t('back')} kicker={t('createDoor.kicker')} />
      <div className="space-y-4 pt-6">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" delay={60} />
        <Skeleton className="h-32 w-full rounded-lg" delay={120} />
        <Skeleton className="h-32 w-full rounded-lg" delay={180} />
        <Skeleton className="h-12 w-full rounded-full" delay={240} />
      </div>
    </div>
  );
}
