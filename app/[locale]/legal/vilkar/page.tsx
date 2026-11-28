import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { routing, type AppLocale } from '@/i18n/routing';
import { canonicalPath } from '@/lib/seo/canonical';

// #3019: Tørny's terms of use (Google Play's UGC policy asks for terms a
// player accepts before posting; Apple guideline 1.2 for the rules behind the
// report button). Public like /legal/privacy: `/legal` is in proxy.ts's
// PUBLIC_PATH_PATTERN. The app asks for the acceptance once
// (terms_acceptances, 0259); TERMS_VERSION counts the text.

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'legal.terms' });
  return {
    title: t('metaTitle'),
    alternates: { canonical: canonicalPath(locale, '/legal/vilkar') },
  };
}

const SECTIONS = ['s1', 's2', 's3', 's4'] as const;

export default async function TermsPage() {
  const t = await getTranslations('legal.terms');

  const mailto = (chunks: React.ReactNode) => (
    <a href="mailto:personvern@tornygolf.no" className="font-medium text-primary underline underline-offset-2">
      {chunks}
    </a>
  );

  return (
    <AppShell>
      <TopBar backHref="/" backLabel={t('backLabel')} kicker={t('kicker')} kickerIsPageTitle back="history" />

      <div className="space-y-8 text-sm leading-relaxed text-text" data-testid="terms-page">
        <header>
          <h1 className="font-serif text-3xl font-medium text-text">{t('title')}</h1>
          <p className="mt-2 text-muted">{t('updated')}</p>
        </header>

        {SECTIONS.map((s) => (
          <section key={s}>
            <h2 className="mb-3 font-serif text-xl font-medium text-text">{t(`${s}Heading`)}</h2>
            <p className="text-text">{t(`${s}Body`)}</p>
          </section>
        ))}

        <section>
          <h2 className="mb-3 font-serif text-xl font-medium text-text">{t('s5Heading')}</h2>
          <p className="text-text">{t.rich('s5Body', { mailto })}</p>
        </section>
      </div>
    </AppShell>
  );
}
