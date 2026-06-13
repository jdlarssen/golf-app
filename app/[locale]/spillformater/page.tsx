import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Kicker } from '@/components/ui/Kicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormatGuideList } from '@/components/FormatGuideList';
import { getFormatGuideEntries } from '@/lib/formats/buildFormatGuide';
import { routing, type AppLocale } from '@/i18n/routing';
// Content comes from the DB via getModeContentMap (service role) at request
// time. Under cacheComponents (#538) uncached IO is never prerendered, so no
// force-dynamic directive is needed to keep it out of the build.

type Params = Promise<{ locale: string }>;

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
  };
}

// Oppslagsverk over alle spillformene (#299, #307, #308). Ren lærings-ressurs —
// ingen per-bruker-data. Hvert format er et utvidbart ModeGuideCard med
// DB-drevet innhold + lenke til detaljside. Innholdet bygges via
// getFormatGuideEntries (cached på 'format-mapping'-tag) og rendres med den
// delte FormatGuideList-komponenten (#498), samme liste som «?»-arket i
// veiviseren bruker.
export default async function SpillformaterPage() {
  const t = await getTranslations('formatGuide');
  const entries = await getFormatGuideEntries();

  return (
    <AppShell>
      <header className="mb-2 flex items-center justify-between gap-4">
        <BackLink href="/">{t('listBackLabel')}</BackLink>
        <Kicker tone="accent">{t('listKicker')}</Kicker>
        <span className="w-12" aria-hidden />
      </header>

      <PageHeader
        title={t('listPageTitle')}
        subtitle={t('listPageSubtitle')}
      />

      <FormatGuideList entries={entries} />
    </AppShell>
  );
}
