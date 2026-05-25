import { Suspense, cache } from 'react';
import { notFound } from 'next/navigation';
import { TopBar } from '@/components/ui/TopBar';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Skeleton } from '@/components/ui/Skeleton';
import { CourseForm } from '../../CourseForm';
import { updateCourse, deleteCourse } from './actions';
import { DeleteCourseButton } from './DeleteCourseButton';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

const ERROR_MESSAGES: Record<string, string> = {
  name_required: 'Banen må ha et navn.',
  bad_par: 'Par må være et helt tall mellom 3 og 6 på hvert hull.',
  bad_si: 'Stroke-indeks må være et helt tall mellom 1 og 18 på hvert hull.',
  si_duplicate: 'Stroke-indeks 1–18 må brukes nøyaktig én gang hver.',
  tee_required: 'Minst én tee-boks må legges til.',
  tee_partial_rating:
    'Hver tee må ha både slope og CR (eller ingen av dem) per kjønn. Du kan ikke lagre halve sett.',
  tee_no_rating:
    'Hver tee må ha minst ett komplett rating-sett per kjønn (Herrer / Damer / Junior).',
  tee_in_use: 'Kan ikke fjerne tee — den brukes i ett eller flere spill.',
  db_course:
    'Klarte ikke å lagre banen. Prøv igjen, eller sjekk Supabase-loggene.',
  db_holes:
    'Klarte ikke å lagre banen. Prøv igjen, eller sjekk Supabase-loggene.',
  db_tees:
    'Klarte ikke å lagre banen. Prøv igjen, eller sjekk Supabase-loggene.',
  db_load: 'Klarte ikke å lese banen fra databasen. Prøv igjen.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
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
  const { error: errorCode } = await searchParams;
  const errorMessage = errorCode
    ? ERROR_MESSAGES[first(errorCode) ?? '']
    : undefined;

  const { supabase } = await getEditCourseContext();
  // Gating: fetch the course row so the title bar can render synchronously.
  // The heavier holes/tees fetch streams behind Suspense below.
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, name')
    .eq('id', id)
    .single();

  if (courseError || !course) {
    notFound();
  }

  const deleteAction = deleteCourse.bind(null, id);
  const userId = await getProxyVerifiedUserId();

  return (
    <AdminShell>
      <TopBar
        backHref="/admin/courses"
        kicker="Baner · protokoll"
        userId={userId}
      />

      <BrassRibbon kicker="Rediger bane" />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {course.name}
        </h1>
        <p className="font-sans text-[11.5px] text-muted">
          Endre hull, par, stroke-indeks og tee-bokser
        </p>
      </div>

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div className="mt-5">
        <Card>
          <Suspense fallback={<CourseFormSkeleton />}>
            <EditCourseFormBody courseId={id} courseName={course.name} />
          </Suspense>
        </Card>
      </div>

      <div className="mt-6">
        <DeleteCourseButton
          deleteAction={deleteAction}
          courseName={course.name}
        />
      </div>
    </AdminShell>
  );
}

async function EditCourseFormBody({
  courseId,
  courseName,
}: {
  courseId: string;
  courseName: string;
}) {
  const { supabase } = await getEditCourseContext();
  const [holesResult, teesResult] = await Promise.all([
    supabase
      .from('course_holes')
      .select('hole_number, par, stroke_index')
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true }),
    supabase
      .from('tee_boxes')
      .select(
        'id, name, length_meters, slope_mens, course_rating_mens, slope_ladies, course_rating_ladies, slope_juniors, course_rating_juniors',
      )
      .eq('course_id', courseId)
      .order('name', { ascending: true }),
  ]);

  if (holesResult.error) throw holesResult.error;
  if (teesResult.error) throw teesResult.error;

  // Numeric fields are stringified so the form's controlled inputs preserve
  // in-progress decimal entry (see CourseForm.tsx for context).
  const initialHoles = (holesResult.data ?? []).map((h) => ({
    hole_number: h.hole_number,
    par: String(h.par),
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

  return (
    <CourseForm
      action={updateAction}
      submitLabel="Lagre endringer"
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
