import { first } from '@/lib/url/searchParams';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdmin } from '@/lib/admin/auth';
import { getClubDetail } from '@/lib/clubs/getClubDetail';
import { isClubExpired } from '@/lib/clubs/clubStatus';
import { getCupEligibleFormats } from '@/lib/formats/getFormatsForIntent';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { CupSetup } from '@/app/[locale]/admin/games/new/CupSetup';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

/**
 * /klubber/[id]/cup/ny — opprett en klubb-scopet cup (#524, #480 Fase 2).
 *
 * Gatet til klubbens eier/admin (eller global admin) via requireAdminOrClubAdmin.
 * Cupen lagres med group_id = klubben; deltakere/kamper legges til etterpå i
 * generer-wizarden (medlems-sourcet). Gjenbruker `CupSetup` med klubb-kontekst.
 * Frossen klubb → redirect tilbake (speiler «Sett opp runde» / klubb-liga).
 */
export default async function NewKlubbCupPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const [{ error: errorParam }, t] = await Promise.all([
    searchParams,
    getTranslations('cup'),
  ]);
  const errorCode = first(errorParam);
  const errorMessage = errorCode
    ? t(`create.errors.${errorCode}` as Parameters<typeof t>[0])
    : undefined;

  const supabase = await getServerClient();
  const { userId } = await requireAdminOrClubAdmin(supabase, id);

  const detail = await getClubDetail(supabase, id, userId);
  if (!detail) notFound();
  if (isClubExpired(detail.club.valid_until)) {
    redirect({ href: `/klubber/${id}`, locale: await getLocale() });
  }

  const cupEligibleFormats = await getCupEligibleFormats();

  return (
    <AppShell>
      <TopBar backHref={`/klubber/${id}`} kicker={detail.club.name} />
      <BrassRibbon kicker={t('create.brassRibbon')} />
      <PageHeader
        title={t('create.pageTitle')}
        subtitle={t('create.pageSubtitle', { clubName: detail.club.name })}
      />

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <CupSetup
        cupEligibleFormats={cupEligibleFormats}
        groupId={id}
        clubName={detail.club.name}
      />
    </AppShell>
  );
}
