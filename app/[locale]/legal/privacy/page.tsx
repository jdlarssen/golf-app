import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { routing, type AppLocale } from '@/i18n/routing';

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
  const t = await getTranslations({ locale, namespace: 'legal.privacy' });
  return {
    title: t('metaTitle'),
  };
}

export default async function PrivacyPage() {
  const t = await getTranslations('legal.privacy');

  return (
    <AppShell>
      <TopBar
        backHref="/"
        backLabel={t('backLabel')}
        kicker={t('kicker')}
        back="history"
      />

      <div className="space-y-8 text-sm leading-relaxed text-text">

        {/* Section 1 */}
        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            {t('s1Heading')}
          </h2>
          <ul className="list-disc list-outside pl-5 space-y-1 text-text">
            <li>{t('s1Item1')}</li>
            <li>{t('s1Item2')}</li>
            <li>{t('s1Item3')}</li>
            <li>{t('s1Item4')}</li>
            <li>{t('s1Item5')}</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            {t('s2Heading')}
          </h2>
          <p className="text-text-muted">
            {t.rich('s2Body', {
              supabase: (chunks) => (
                <span className="font-medium text-text">{chunks}</span>
              ),
            })}
          </p>
        </section>

        {/* Besøksstatistikk (#1036) — cookieless Vercel Web Analytics */}
        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            {t('analyticsHeading')}
          </h2>
          <p className="text-text-muted">{t('analyticsBody')}</p>
        </section>

        {/* Section 3 */}
        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            {t('s3Heading')}
          </h2>
          <p className="text-text-muted mb-2">{t('s3Para1')}</p>
          <p className="text-text-muted">{t('s3Para2')}</p>
        </section>

        {/* Section 4 */}
        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            {t('s4Heading')}
          </h2>
          <p className="text-text-muted">{t('s4Body')}</p>
        </section>

        {/* Section 5 */}
        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            {t('s5Heading')}
          </h2>
          <p className="text-text-muted mb-2">{t('s5Intro')}</p>
          <ul className="list-disc list-outside pl-5 space-y-1 text-text-muted">
            <li>
              {t.rich('s5Right1', {
                term: (chunks) => (
                  <span className="font-medium text-text">{chunks}</span>
                ),
              })}
            </li>
            <li>
              {t.rich('s5Right2', {
                term: (chunks) => (
                  <span className="font-medium text-text">{chunks}</span>
                ),
              })}
            </li>
            <li>
              {t.rich('s5Right3', {
                term: (chunks) => (
                  <span className="font-medium text-text">{chunks}</span>
                ),
              })}
            </li>
            <li>
              {t.rich('s5Right4', {
                term: (chunks) => (
                  <span className="font-medium text-text">{chunks}</span>
                ),
              })}
            </li>
          </ul>
        </section>

        {/* Section 6 */}
        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            {t('s6Heading')}
          </h2>
          <p className="text-text-muted">
            {t.rich('s6Body', {
              mailto: (chunks) => (
                <a
                  href="mailto:personvern@tornygolf.no"
                  className="font-medium text-primary underline underline-offset-2"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </section>

      </div>
    </AppShell>
  );
}
