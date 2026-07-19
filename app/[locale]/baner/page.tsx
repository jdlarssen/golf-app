import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { BrandMark } from '@/components/ui/BrandMark';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { canonicalPath } from '@/lib/seo/canonical';
import { routing, type AppLocale } from '@/i18n/routing';
import { listPublicCourses } from '@/lib/courses/publicCourses';

/**
 * Offentlig bane-indeks (#1023, epic #1021 «Vindu ut») — SEO-inngangen for
 * golfere som googler slope/rating på norske baner. Whitelisted i proxy.ts
 * (PUBLIC_PATH_PATTERN) så uinnloggede når den uten login-runde. Kun
 * bane-geometri vises — aldri spill-/score-/brukerdata (kontrakt-guardrail;
 * data-laget i lib/courses/publicCourses.ts leser med anon-klient).
 *
 * 4 baner i prod i dag → enkel semantisk liste uten søk (kontrakt: «søk
 * utsatt — semantisk liste er bedre SEO uansett»).
 */

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
  const t = await getTranslations({ locale, namespace: 'publicCourses.index' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: canonicalPath(locale, '/baner') },
  };
}

export default async function PublicCoursesPage() {
  const t = await getTranslations('publicCourses.index');
  const courses = await listPublicCourses();

  return (
    <AppShell>
      <div className="mt-2">
        <BrandMark className="mb-8" />

        <header className="px-1">
          <p className="font-sans text-xs uppercase tracking-[0.12em] text-muted">
            {t('kicker')}
          </p>
          <h1 className="mt-1 font-serif text-[28px] font-medium leading-snug tracking-[-0.015em] text-text">
            {t('heading')}
          </h1>
          <p className="mt-1 font-sans text-sm text-muted">{t('intro')}</p>
        </header>

        <div className="mt-6">
          {courses.length === 0 ? (
            <Card>
              <p className="font-sans text-sm text-muted">{t('emptyState')}</p>
            </Card>
          ) : (
            <ul className="space-y-3">
              {courses.map((course) => (
                <li key={course.id}>
                  <SmartLink
                    href={`/baner/${course.slug}`}
                    className="block min-h-[44px] rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(26,46,31,0.04),0_2px_8px_rgba(26,46,31,0.04)] transition-colors hover:bg-primary-soft dark:shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
                  >
                    <span className="font-serif text-lg font-medium leading-snug text-text">
                      {course.name}
                    </span>
                    <span className="mt-0.5 block font-sans text-sm text-muted tabular-nums">
                      {t('holesLabel', { count: course.holeCount })}
                      {' · '}
                      {t('teesLabel', { count: course.teeCount })}
                    </span>
                  </SmartLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
