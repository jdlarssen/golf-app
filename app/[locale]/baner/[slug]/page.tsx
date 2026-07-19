import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { routing, type AppLocale } from '@/i18n/routing';
import { canonicalPath } from '@/lib/seo/canonical';
import { formatNumber } from '@/lib/i18n/format';
import { getRatingForGender, type TeeGender } from '@/lib/games/teeRating';
import {
  getPublicCourseBySlug,
  listPublicCourseSlugs,
} from '@/lib/courses/publicCourses';
import { HoleTable } from './HoleTable';

/**
 * Offentlig baneside (#1023, epic #1021 «Vindu ut») — slope, rating og
 * hulloversikt for én bane, statisk generert (`generateStaticParams` over
 * kvalifiserte slugs) og indekserbar via sitemap.ts. Ukjent ELLER
 * ukvalifisert slug → notFound() (ingen tomme skall, kontrakt-guardrail).
 *
 * «Arranger runde her» dyplenker til /opprett-spill?bane=<id>; proxyen
 * sender uinnloggede via login med next-param, så CTA-en fungerer for
 * Google-trafikk uten konto.
 */

type Params = Promise<{ locale: string; slug: string }>;

export async function generateStaticParams() {
  const slugs = await listPublicCourseSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  const [t, course] = await Promise.all([
    getTranslations({ locale, namespace: 'publicCourses.detail' }),
    getPublicCourseBySlug(slug),
  ]);
  if (!course) return {};
  return {
    title: t('metaTitle', { name: course.name }),
    description: t('metaDescription', { name: course.name }),
    alternates: { canonical: canonicalPath(locale, `/baner/${slug}`) },
  };
}

const GENDERS: TeeGender[] = ['mens', 'ladies', 'juniors'];

const GENDER_LABEL_KEY = {
  mens: 'genderMens',
  ladies: 'genderLadies',
  juniors: 'genderJuniors',
} as const;

export default async function PublicCoursePage({
  params,
}: {
  params: Params;
}) {
  const { slug } = await params;
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('publicCourses.detail');
  const course = await getPublicCourseBySlug(slug);
  if (!course) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'GolfCourse',
    name: course.name,
    url: `https://tornygolf.no/baner/${course.slug}`,
  };

  return (
    <AppShell>
      <TopBar backHref="/baner" backLabel={t('backLabel')} kicker={t('kicker')} />
      {/* JSON-LD for Google's rich results — geometry only, no user data. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="space-y-5">
        <header className="px-1">
          <h1 className="font-serif text-[28px] font-medium leading-snug tracking-[-0.015em] text-text">
            {course.name}
          </h1>
        </header>

        <Card>
          <h2 className="font-serif text-xl font-medium text-text">
            {t('holesHeading')}
          </h2>
          <HoleTable
            holes={course.holes}
            labels={{
              colHole: t('colHole'),
              colPar: t('colPar'),
              colIndex: t('colIndex'),
              genderMens: t('genderMens'),
              genderLadies: t('genderLadies'),
              genderJuniors: t('genderJuniors'),
            }}
          />
        </Card>

        <Card>
          <h2 className="font-serif text-xl font-medium text-text">
            {t('teesHeading')}
          </h2>
          <ul className="mt-3 space-y-4">
            {course.tees.map((tee) => (
              <li key={tee.id}>
                <p className="font-sans text-sm font-semibold text-text">
                  {tee.name}
                  {tee.length_meters !== null && (
                    <span className="ml-2 font-normal text-muted tabular-nums">
                      {t('lengthLabel', {
                        meters: formatNumber(tee.length_meters, locale),
                      })}
                    </span>
                  )}
                </p>
                <dl className="mt-1 space-y-0.5">
                  {/* Kun kjønn med komplett rating vises — aldri «—»-skjelett
                      (kontrakt-guardrail). */}
                  {GENDERS.map((gender) => {
                    const rating = getRatingForGender(tee, gender);
                    if (!rating) return null;
                    return (
                      <div key={gender} className="flex gap-2 font-sans text-sm">
                        <dt className="w-16 shrink-0 text-muted">
                          {t(GENDER_LABEL_KEY[gender])}
                        </dt>
                        <dd className="tabular-nums text-text">
                          {t('slopeLabel', { value: rating.slope })}
                          {' · '}
                          {t('ratingLabel', {
                            value: formatNumber(rating.courseRating, locale, {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            }),
                          })}
                          {' · '}
                          {t('parLabel', { value: rating.par })}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="font-serif text-xl font-medium text-text">
            {t('ctaHeading')}
          </h2>
          <div className="mt-4">
            <LinkButton href={`/opprett-spill?bane=${course.id}`} full>
              {t('ctaButton')}
            </LinkButton>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
