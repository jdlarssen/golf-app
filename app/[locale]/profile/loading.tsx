import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Route-loading skeleton for profil-segmentet (#867). Viser en realistisk
 * profilform-silhuett mens server-komponentene lastes — tilsvarer
 * `ProfileFormSkeleton` inne i `page.tsx`. Erstatter den generiske
 * HomeSkeleton som top-level `[locale]/loading.tsx` bruker, og som gir
 * et malplassert flash av kort-lista på profilsider.
 *
 * Stagger-offset: 30 → 60 → 120 → 180 → 240ms, samme trinnlengde som
 * ProfileFormSkeleton i page.tsx.
 */
export default async function ProfileLoading() {
  const t = await getTranslations('profile');
  return (
    <AppShell>
      {/* Ekte TopBar uten tilbake-pil, som siden selv: Profil er en fane i
          bunnmenyen, ikke et steg (#2487). */}
      <TopBar kicker={t('kicker')} />

      {/* Profil-kort: avatar + navn + skjemafelt */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-5">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-28" delay={30} />
              <Skeleton className="h-3 w-16" delay={60} />
            </div>
          </div>
          <Skeleton className="h-12 w-full rounded-lg" delay={60} />
          <Skeleton className="h-12 w-full rounded-lg" delay={120} />
          <Skeleton className="h-12 w-full rounded-lg" delay={180} />
          <Skeleton className="h-10 w-24 rounded-full" delay={240} />
        </div>
      </Card>

      {/* Inviter-en-venn-kort */}
      <div className="mt-6">
        <Skeleton className="h-[88px] rounded-2xl" delay={180} />
      </div>
    </AppShell>
  );
}
