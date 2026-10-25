import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Kicker } from '@/components/ui/Kicker';
import { FormatGuideList } from '@/components/FormatGuideList';
import { FormatHelper } from '@/components/FormatHelper';
import { getFormatGuideEntries } from '@/lib/formats/buildFormatGuide';
import { DEFAULT_ANSWERS, buildFormatHelperViews } from '@/lib/formats/formatHelperViews';
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
//
// #2328: øverst står formatvelgeren fra artboardet «Forslag: hvilket format
// passer dere?» (kicker, tittel og tre spørsmål), og lista følger under
// «Alle spillformer». Forslagene bygges her på serveren, så HTML-en viser
// forvalget uten JavaScript, og nettleseren trenger verken veiviserens eller
// oppslagsverkets meldinger (#2227).
export default async function SpillformaterPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [t, tHelper, tModes, tLineup, entries] = await Promise.all([
    getTranslations('formatGuide'),
    getTranslations('formatGuide.helper'),
    getTranslations('modes'),
    getTranslations('wizard.formatGrid.lineup'),
    getFormatGuideEntries(),
  ]);
  const views = buildFormatHelperViews({
    helper: (key, values) => tHelper(key as Parameters<typeof tHelper>[0], values),
    modes: (key) => tModes(key as Parameters<typeof tModes>[0]),
    lineup: (key, values) => tLineup(key, values),
  });

  return (
    <AppShell>
      <div className="mb-2 flex items-center">
        <Suspense fallback={<BackLink href="/">{t('listBackLabel')}</BackLink>}>
          <ListBackLink searchParams={searchParams} />
        </Suspense>
      </div>

      <header>
        <Kicker tone="accent">{t('listKicker')}</Kicker>
        <h1 className="mt-1.5 font-serif text-[30px] font-medium leading-[1.1] text-text">
          {tHelper('title')}
        </h1>
        <p className="mt-1.5 font-sans text-sm text-muted">{tHelper('lead')}</p>
      </header>

      <FormatHelper
        views={views}
        initialAnswers={DEFAULT_ANSWERS}
        allFormatsHref="#alle-spillformer"
        labels={{
          countLegend: tHelper('countLegend'),
          levelLegend: tHelper('levelLegend'),
          levelEven: tHelper('levelEven'),
          levelUneven: tHelper('levelUneven'),
          goalLegend: tHelper('goalLegend'),
          goalCompete: tHelper('goalCompete'),
          goalTeam: tHelper('goalTeam'),
          goalStakes: tHelper('goalStakes'),
          resultKicker: tHelper('resultKicker'),
          create: tHelper('create'),
          rules: tHelper('rules'),
          seeAll: tHelper('seeAll', { count: entries.length }),
          versus: tLineup('versus'),
        }}
      />

      <section aria-labelledby="alle-spillformer" className="mt-10">
        <h2
          id="alle-spillformer"
          className="scroll-mt-6 font-serif text-2xl font-medium leading-tight text-text"
        >
          {tHelper('allHeading')}
        </h2>
        <p className="mb-6 mt-1.5 text-sm text-muted">{t('listPageSubtitle')}</p>
        <FormatGuideList
          entries={entries}
          showSections
          cardLabels={{
            showRules: t('cardShowRules'),
            hideRules: t('cardHideRules'),
            readMore: t('cardReadMore'),
          }}
        />
      </section>
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
