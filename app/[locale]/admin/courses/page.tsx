import { first } from '@/lib/url/searchParams';
import { Suspense, cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { ChampagneMedallion } from '@/components/ui/ChampagneMedallion';
import { LedgerHeader } from '@/components/admin/LedgerHeader';
import { BaneIcon } from '@/components/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { TopBar } from '@/components/ui/TopBar';
import { requireAdmin } from '@/lib/admin/auth';
import { CoursesLedgerClient } from './CoursesLedgerClient';
import { deriveCourseItem, type CourseRow } from './derive';

const COURSES_LEDGER_GRID = '1fr 64px 14px';

type SearchParams = Promise<{
  status?: string | string[];
  name?: string | string[];
  error?: string | string[];
}>;

// Embed-fetch av tee-rader, spill-statuser og spill-datoer for å derivere
// filter-data (tee-tall, has_ladies_tee, has_juniors_tee, active_game_count,
// last_played_at) i én round-trip. Datasettet er lite — under ~50 baner med
// ~5 tees + ~50 spill hver selv ved klubb-skala — så embed er rimeligere
// enn separate queries.
const getCourses = cache(async () => {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from('courses')
    .select(
      `
      id, name, created_at, updated_at,
      tee_boxes(slope_ladies, course_rating_ladies, slope_juniors, course_rating_juniors, archived_at),
      games(status, scheduled_tee_off_at, ended_at)
    `,
    )
    .order('created_at', { ascending: false })
    .returns<CourseRow[]>();

  if (error) throw error;
  return data ?? [];
});

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Page-level gate: admin OR trusted creator (Fase 4).
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const t = await getTranslations('admin.courses');
  const tNav = await getTranslations('admin.nav');

  const params = await searchParams;
  const status = first(params.status);
  const name = first(params.name) ?? '';
  const errorCode = first(params.error);
  const errorMessage = errorCode
    ? t(`errors.${errorCode}` as Parameters<typeof t>[0])
    : undefined;

  const statusMessage = status === 'deleted'
    ? t('statusMessages.deleted')
    : status === 'created'
      ? t('statusMessages.created', { name })
      : status === 'updated'
        ? t('statusMessages.updated', { name })
        : undefined;

  return (
    <AdminShell>
      <TopBar
        backHref="/admin"
        kicker={tNav('klubbhus')}
        action={
          <SmartLink
            href="/admin/courses/new"
            className="rounded-full border border-border bg-surface-2/50 px-2.5 py-[5px] font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-text"
          >
            + Ny
          </SmartLink>
        }
      />

      <BrassRibbon kicker={t('brassRibbonCatalog')} />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('heading')}
        </h1>
        <Suspense fallback={<Skeleton className="h-3 w-44" />}>
          <CourseCountLine />
        </Suspense>
      </div>

      {(statusMessage || errorMessage) && (
        <div className="mt-4 space-y-2">
          {statusMessage && <Banner tone="success">{statusMessage}</Banner>}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      <Suspense fallback={<CoursesLedgerSkeleton />}>
        <CoursesLedger />
      </Suspense>

      <p className="mt-6 text-center font-serif text-[11px] italic leading-relaxed text-muted">
        {t('tapHint')}
      </p>
    </AdminShell>
  );
}

async function CourseCountLine() {
  const t = await getTranslations('admin.courses');
  const items = await getCourses();
  return (
    <p className="font-sans text-[11.5px] tabular-nums text-muted">
      {t('countLine', { n: items.length })}
    </p>
  );
}

async function CoursesLedger() {
  const t = await getTranslations('admin.courses');
  const items = await getCourses();

  if (items.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-border bg-surface px-5 py-12 flex flex-col items-center text-center">
        <ChampagneMedallion size={72} className="mb-5">
          <BaneIcon width={36} height={36} className="text-primary dark:text-text" />
        </ChampagneMedallion>
        <p className="font-serif text-[16px] font-medium tracking-[-0.005em] text-text">
          {t('emptyHeading')}
        </p>
        <p className="mt-1.5 max-w-[280px] font-sans text-[12.5px] leading-relaxed text-muted">
          {t('emptyBody')}
        </p>
      </div>
    );
  }

  return <CoursesLedgerClient items={items.map(deriveCourseItem)} />;
}

async function CoursesLedgerSkeleton() {
  const t = await getTranslations('admin.courses');
  return (
    <>
      <LedgerHeader
        leftLabel={t('colCourse')}
        rightLabel={t('colTees')}
        gridTemplateColumns={COURSES_LEDGER_GRID}
      />
      <div
        className="overflow-hidden rounded-b-2xl border bg-surface"
        style={{ borderColor: 'var(--border)', borderTop: 'none' }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="grid items-center gap-2.5 px-3.5 py-3.5"
            style={{
              gridTemplateColumns: COURSES_LEDGER_GRID,
              borderTop:
                i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
            }}
          >
            <div className="min-w-0">
              <Skeleton className="h-4 w-3/5" delay={i * 90} />
              <Skeleton className="mt-1 h-3 w-2/5" delay={i * 90 + 30} />
            </div>
            <Skeleton className="ml-auto h-4 w-8" delay={i * 90 + 60} />
            <span aria-hidden className="text-[14px] text-muted">
              ›
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
