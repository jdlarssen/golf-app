import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { SmartLink } from '@/components/ui/SmartLink';
import { LinkButton } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { routing, type AppLocale } from '@/i18n/routing';
import { canonicalPath } from '@/lib/seo/canonical';
import { formatNumber } from '@/lib/i18n/format';
import { getRatingForGender, type TeeGender } from '@/lib/games/teeRating';
import { coursePar, hardestAndEasiest, sortTeesForCard } from '@/lib/courses/courseCard';
import { courseReportHref } from '@/lib/courses/courseReportHref';
import { isTeeColor } from '@/lib/courses/teeColors';
import {
  getPublicCourseBySlug,
  listPublicCourseSlugs,
} from '@/lib/courses/publicCourses';
import { CourseCardGrid } from './CourseCardGrid';
import { TeePanel, type TeeView } from './TeePanel';

/**
 * Offentlig baneside (#1023, epic #1021 «Vindu ut»), som banekortet fra
 * designlerretet (#2277): grønn topp med tee-valg og rating, UT- og INN-kort,
 * vanskeligste og letteste hull. Statisk generert (`generateStaticParams`
 * over kvalifiserte slugs) og indekserbar via sitemap.ts. Ukjent ELLER
 * ukvalifisert slug → notFound() (ingen tomme skall, kontrakt-guardrail).
 *
 * «Arranger en runde på …» dyplenker til /opprett-spill?bane=<id>; proxyen
 * sender uinnloggede via login med next-param, så knappen fungerer for
 * Google-trafikk uten konto. «Si fra» går samme vei til idéboksen.
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

const RATING_LABEL_KEY = {
  mens: 'ratingMens',
  ladies: 'ratingLadies',
  juniors: 'ratingJuniors',
} as const;

const num = (chunks: ReactNode) => (
  <span className="font-serif text-[18px] font-semibold">{chunks}</span>
);

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

  const par = coursePar(course.holes);
  const holeCount = course.holes.length;

  // Bare kjønn med komplett rating får en rute, og en tee uten noen får ingen
  // brikke — aldri «—»-skjelett (kontrakt-guardrail fra #1023).
  const tees: TeeView[] = sortTeesForCard(course.tees).flatMap((tee) => {
    const ratings = GENDERS.flatMap((gender) => {
      const rating = getRatingForGender(tee, gender);
      if (!rating) return [];
      return [
        {
          key: gender,
          label: t(RATING_LABEL_KEY[gender]),
          value: t.rich('ratingValue', {
            slope: rating.slope,
            rating: formatNumber(rating.courseRating, locale, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }),
            num,
          }),
          par: rating.par === par ? null : t('ratingPar', { par: rating.par }),
        },
      ];
    });
    if (ratings.length === 0) return [];
    return [
      {
        id: tee.id,
        name: tee.name,
        color: isTeeColor(tee.color) ? tee.color : null,
        status:
          tee.length_meters === null
            ? t('status', { holes: holeCount, par })
            : t('statusWithLength', {
                holes: holeCount,
                par,
                meters: formatNumber(tee.length_meters, locale),
                tee: tee.name,
              }),
        ratings,
      },
    ];
  });

  const facts = hardestAndEasiest(course.holes);

  return (
    <AppShell flush>
      {/* JSON-LD for Google's rich results — geometry only, no user data. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header
        data-focus-surface="strong"
        className="bg-surface-strong px-2 pt-2 pb-[18px] leading-[normal] text-on-strong"
      >
        <div className="flex items-center justify-between">
          <SmartLink
            href="/baner"
            aria-label={t('backLabel')}
            className="flex size-11 items-center justify-center text-on-strong"
          >
            <svg
              aria-hidden
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </SmartLink>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-on-strong/80">
            {t('kicker')}
          </p>
          <span aria-hidden className="w-11" />
        </div>
        <div className="px-3 pt-0.5">
          <h1 className="font-serif text-[30px] font-medium">{course.name}</h1>
          <TeePanel legend={t('teeLegend')} tees={tees} />
        </div>
      </header>

      <div className="mx-3 mt-4 rounded-[14px] border border-border bg-surface px-2 py-2.5 leading-[normal]">
        <CourseCardGrid
          holes={course.holes}
          labels={{
            hole: t('colHole'),
            par: t('colPar'),
            parLadies: t('rowParLadies'),
            parJuniors: t('rowParJuniors'),
            index: t('colIndex'),
            out: t('out'),
            in: t('in'),
            captionOut: t('captionOut'),
            captionIn: t('captionIn'),
          }}
        />
      </div>

      {facts && (
        <div className="flex gap-2 px-3 pt-3 leading-[normal]">
          {(
            [
              ['hardest', facts.hardest],
              ['easiest', facts.easiest],
            ] as const
          ).map(([key, hole]) => (
            <div
              key={key}
              className="flex-1 basis-0 rounded-[14px] border border-border bg-surface px-3 py-2.5"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                {t(key)}
              </p>
              <p className="mt-0.5 text-[14px]">
                {t.rich('factLine', {
                  hole: hole.hole_number,
                  par: hole.par_mens ?? '',
                  index: hole.stroke_index,
                  num: (chunks) => <span className="font-serif font-semibold">{chunks}</span>,
                })}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mx-3 mt-4 flex flex-col gap-2">
        <LinkButton href={`/opprett-spill?bane=${course.id}`} size="xl" full>
          {t('ctaButton', { name: course.name })}
        </LinkButton>
        <Link
          href={courseReportHref(course.slug)}
          className="flex min-h-11 items-center justify-center text-[13px] font-semibold leading-[normal] text-primary underline"
        >
          {t('reportLink')}
        </Link>
      </div>
    </AppShell>
  );
}
