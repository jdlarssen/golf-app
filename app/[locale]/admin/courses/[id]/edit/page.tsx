import { first } from '@/lib/url/searchParams';
import { Suspense, cache } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { TopBar } from '@/components/ui/TopBar';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Skeleton } from '@/components/ui/Skeleton';
import { CourseForm } from '../../CourseForm';
import { updateCourse } from './actions';
import { SmartLink } from '@/components/ui/SmartLink';
import {
  ArchivedTeesSection,
  type ArchivedTeeRow,
} from './ArchivedTeesSection';
import { formatShortDateLocale } from '@/lib/i18n/format';
import { displayName, type DisplayNameUser } from '@/lib/format/displayName';
import { requireAdminOrTrustedCreator } from '@/lib/admin/auth';
import type { AppLocale } from '@/i18n/routing';

// Buffer mellom created_at og updated_at som regnes som «samme transaksjon»
// — eksisterende rader fra før 0037-migrasjonen fikk updated_at = now() ved
// migrasjons-tidspunktet, så vi vil unngå å vise «Sist endret» feilaktig på
// dem inntil de faktisk endres første gang.
const SAME_TX_BUFFER_MS = 60_000;

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  error?: string | string[];
  status?: string | string[];
}>;

function buildAuditKicker(
  course: {
    created_at: string;
    updated_at: string;
    created_by_user: DisplayNameUser;
    updated_by_user: DisplayNameUser;
  },
  t: Awaited<ReturnType<typeof getTranslations<'admin.courses.edit'>>>,
  locale: AppLocale,
): string {
  const created = new Date(course.created_at).getTime();
  const updated = new Date(course.updated_at).getTime();
  const wasUpdated = updated - created > SAME_TX_BUFFER_MS;

  if (wasUpdated) {
    const who = displayName(course.updated_by_user);
    const when = formatShortDateLocale(course.updated_at, locale);
    return who
      ? t('kickerLastUpdatedBy', { date: when, who })
      : t('kickerLastUpdated', { date: when });
  }
  const who = displayName(course.created_by_user);
  const when = formatShortDateLocale(course.created_at, locale);
  return who
    ? t('kickerAddedBy', { date: when, who })
    : t('kickerAdded', { date: when });
}

const getEditCourseContext = cache(async () => {
  const supabase = await getServerClient();
  return { supabase };
});

export default async function EditCoursePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { error: errorCode, status: statusCode } = await searchParams;

  const tNav = await getTranslations('admin.nav');
  const tEdit = await getTranslations('admin.courses.edit');
  const tArchivedTees = await getTranslations('admin.courses.archivedTees');
  const locale = (await getLocale()) as AppLocale;

  const errorMessage = errorCode
    ? tEdit(`errors.${first(errorCode) ?? ''}` as Parameters<typeof tEdit>[0])
    : undefined;
  const statusMessage =
    first(statusCode) === 'restored' ? tEdit('statusRestored') : undefined;

  const { supabase } = await getEditCourseContext();
  // Page-level gate: trusted creators are allowed alongside admin (Fase 4).
  await requireAdminOrTrustedCreator(supabase);
  // Gating: fetch the course row so the title bar can render synchronously.
  // Inkluderer audit-felter + embed på `users` via begge FK-er for visning
  // av «Lagt til av X» / «Sist endret av Y» kicker.
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select(
      `
      id, name, created_at, updated_at,
      created_by_user:users!courses_created_by_fkey(name, nickname),
      updated_by_user:users!courses_updated_by_fkey(name, nickname)
    `,
    )
    .eq('id', id)
    .single();

  if (courseError || !course) {
    notFound();
  }

  const kicker = buildAuditKicker(course, tEdit, locale);

  const archivedTees = await getArchivedTees(supabase, id);

  return (
    <AdminShell>
      <TopBar
        backHref="/admin/courses"
        kicker={tNav('coursesLog')}
      />

      <BrassRibbon kicker={tEdit('brassRibbon')} />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {course.name}
        </h1>
        <p className="font-sans text-[11.5px] text-muted">{kicker}</p>
      </div>

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      {statusMessage && (
        <div className="mt-4">
          <Banner tone="success">{statusMessage}</Banner>
        </div>
      )}

      <div className="mt-5">
        <Card>
          <Suspense fallback={<CourseFormSkeleton />}>
            <EditCourseFormBody courseId={id} courseName={course.name} submitLabel={tEdit('submitLabel')} />
          </Suspense>
        </Card>
      </div>

      {archivedTees.length > 0 && (
        <div className="mt-6">
          <ArchivedTeesSection
            courseId={id}
            archivedTees={archivedTees}
            strings={{
              summaryLabel: (count) => tArchivedTees('summaryLabel', { count }),
              body: tArchivedTees('body'),
              archivedDate: (date) => tArchivedTees('archivedDate', { date }),
              nameConflict: tArchivedTees('nameConflict'),
              reopenButton: tArchivedTees('reopenButton'),
              reopeningBusy: tArchivedTees('reopeningBusy'),
            }}
            locale={locale}
          />
        </div>
      )}

      <div className="mt-6">
        <SmartLink
          href={`/admin/courses/${id}/slett`}
          className="block min-h-[44px] rounded-full border px-4 py-3 text-center text-sm font-medium transition-colors hover:bg-surface-2"
          style={{
            color: 'var(--danger-deep)',
            borderColor: 'rgba(180, 60, 60, 0.3)',
          }}
        >
          {tEdit('deleteLink')}
        </SmartLink>
      </div>
    </AdminShell>
  );
}

async function getArchivedTees(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  courseId: string,
): Promise<ArchivedTeeRow[]> {
  // Fetch both archived + active in parallel: archived tees go in the
  // panel, active tees are needed only to flag name conflicts that would
  // surface on restore.
  const [archivedResult, activeResult] = await Promise.all([
    supabase
      .from('tee_boxes')
      .select('id, name, archived_at, length_meters')
      .eq('course_id', courseId)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false }),
    supabase
      .from('tee_boxes')
      .select('name')
      .eq('course_id', courseId)
      .is('archived_at', null),
  ]);
  if (archivedResult.error || activeResult.error) return [];

  const activeNames = new Set(
    (activeResult.data ?? []).map((t) => t.name.toLowerCase()),
  );

  return (archivedResult.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    archived_at: t.archived_at as string,
    length_meters: t.length_meters,
    has_active_name_conflict: activeNames.has(t.name.toLowerCase()),
  }));
}

async function EditCourseFormBody({
  courseId,
  courseName,
  submitLabel,
}: {
  courseId: string;
  courseName: string;
  submitLabel: string;
}) {
  const { supabase } = await getEditCourseContext();
  const [holesResult, teesResult, affectedGamesResult] = await Promise.all([
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true }),
    supabase
      .from('tee_boxes')
      .select(
        'id, name, length_meters, slope_mens, course_rating_mens, slope_ladies, course_rating_ladies, slope_juniors, course_rating_juniors',
      )
      .eq('course_id', courseId)
      .is('archived_at', null)
      .order('name', { ascending: true }),
    // Forvarsel-count: hvor mange spill på denne banen er live eller venter
    // på tee-off. Brukes av CourseForm til å gate en confirm-dialog hvis
    // admin endrer par/SI mens spill pågår. Se issue #237.
    supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', courseId)
      .in('status', ['active', 'scheduled']),
  ]);

  if (holesResult.error) throw holesResult.error;
  if (teesResult.error) throw teesResult.error;
  // Count-feil er ikke fatal — vi vil heller miste advarselen enn å hindre
  // admin i å redigere banen. Default 0 ⇒ ingen confirm-dialog.
  const affectedGamesCount = affectedGamesResult.error
    ? 0
    : (affectedGamesResult.count ?? 0);

  // Numeric fields are stringified so the form's controlled inputs preserve
  // in-progress decimal entry (see CourseForm.tsx for context). Per-kjønn-
  // par sendes ned slik at avvik kan vises og endres i form.
  const initialHoles = (holesResult.data ?? []).map((h) => ({
    hole_number: h.hole_number,
    par_mens: String(h.par_mens),
    par_ladies: String(h.par_ladies),
    par_juniors: String(h.par_juniors),
    stroke_index: String(h.stroke_index),
  }));

  const initialTees = (teesResult.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    length_meters: t.length_meters == null ? '' : String(t.length_meters),
    slope_mens: t.slope_mens == null ? '' : String(t.slope_mens),
    course_rating_mens:
      t.course_rating_mens == null ? '' : String(t.course_rating_mens),
    slope_ladies: t.slope_ladies == null ? '' : String(t.slope_ladies),
    course_rating_ladies:
      t.course_rating_ladies == null ? '' : String(t.course_rating_ladies),
    slope_juniors: t.slope_juniors == null ? '' : String(t.slope_juniors),
    course_rating_juniors:
      t.course_rating_juniors == null ? '' : String(t.course_rating_juniors),
  }));

  // Pre-bind the course id so the form's action handler only deals with the
  // FormData payload — keeps CourseForm reusable across create + edit.
  const updateAction = updateCourse.bind(null, courseId);

  // Key on the active tee-id set so React unmounts + remounts CourseForm
  // when the set changes (archive or restore). Without this, the client
  // component's useState(initialTees) stays seeded with the old list even
  // after a server re-render — and a subsequent Lagre would send the stale
  // form state, causing updateCourse to treat the just-restored tee as
  // "removed" and re-archive it. See PR #228 fix.
  const teeSetKey = initialTees
    .map((t) => t.id)
    .sort()
    .join('|');

  return (
    <CourseForm
      key={teeSetKey}
      action={updateAction}
      submitLabel={submitLabel}
      affectedGamesCount={affectedGamesCount}
      initialData={{
        name: courseName,
        holes: initialHoles,
        teeBoxes: initialTees,
      }}
    />
  );
}

function CourseFormSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" delay={60} />
      <Skeleton className="h-32 w-full rounded-lg" delay={120} />
      <Skeleton className="h-12 w-full rounded-full" delay={180} />
    </div>
  );
}
