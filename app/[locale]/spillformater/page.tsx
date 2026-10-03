import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Kicker } from '@/components/ui/Kicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormatGuideList } from '@/components/FormatGuideList';
import { getFormatGuideEntries } from '@/lib/formats/buildFormatGuide';
import { routing, type AppLocale } from '@/i18n/routing';
import { canonicalPath } from '@/lib/seo/canonical';
import { klubbhusBackHref } from '@/lib/url/klubbhusOrigin';
// Content comes from the message catalog via getFormatGuideEntries (i18n Fase
// D, #592) — no DB read, fully bilingual.

type Params = Promise<{ locale: string }>;
type SearchParams = Promise<{ kilde?: string | string[] }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'formatGuide' });
  return {
    title: t('listMetaTitle'),
    description: t('listMetaDescription'),
    alternates: { canonical: canonicalPath(locale, '/spillformater') },
  };
}

// Oppslagsverk over alle spillformene (#299, #307, #308). Ren lærings-ressurs —
// ingen per-bruker-data. Hvert format er et utvidbart ModeGuideCard med
// katalog-drevet innhold + lenke til detaljside. Innholdet bygges via
// getFormatGuideEntries (i18n Fase D, #592) og rendres med den delte
// FormatGuideList-komponenten (#498), samme liste som «?»-arket i veiviseren
// bruker.
//
// Siden er offentlig og ferdigbygd (PPR). Bare tilbake-pila venter på
// searchParams, bak sin egen Suspense: fra Klubbhuset (?kilde=klubbhuset)
// går den dit, ellers til forsiden (#2487).
export default async function SpillformaterPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = await getTranslations('formatGuide');
  const entries = await getFormatGuideEntries();

  return (
    <AppShell>
      <header className="mb-2 flex items-center justify-between gap-4">
        <Suspense fallback={<BackLink href="/">{t('listBackLabel')}</BackLink>}>
          <ListBackLink searchParams={searchParams} />
        </Suspense>
        <Kicker tone="accent">{t('listKicker')}</Kicker>
        <span className="w-12" aria-hidden />
      </header>

      <PageHeader
        title={t('listPageTitle')}
        subtitle={t('listPageSubtitle')}
      />

      <FormatGuideList
        entries={entries}
        showSections
        cardLabels={{
          showRules: t('cardShowRules'),
          hideRules: t('cardHideRules'),
          readMore: t('cardReadMore'),
        }}
      />
    </AppShell>
  );
}

async function ListBackLink({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const href = klubbhusBackHref(sp.kilde, '/');
  if (href === '/') {
    const t = await getTranslations('formatGuide');
    return <BackLink href="/">{t('listBackLabel')}</BackLink>;
  }
  const tNav = await getTranslations('nav');
  return <BackLink href={href}>{tNav('backToClubhouse')}</BackLink>;
}
