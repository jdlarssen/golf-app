import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';
import { CourseForm } from '../../CourseForm';
import { updateCourse } from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

const ERROR_MESSAGES: Record<string, string> = {
  name_required: 'Banen må ha et navn.',
  bad_par: 'Par må være et helt tall mellom 3 og 6 på hvert hull.',
  bad_si: 'Stroke-indeks må være et helt tall mellom 1 og 18 på hvert hull.',
  si_duplicate: 'Stroke-indeks 1–18 må brukes nøyaktig én gang hver.',
  bad_slope: 'Slope må være et helt tall mellom 55 og 155.',
  bad_cr: 'Course rating må være et tall mellom 50 og 80.',
  bad_par_total: 'Par total må være et helt tall mellom 60 og 80.',
  tee_required: 'Minst én tee-boks må legges til.',
  tee_in_use:
    'Kan ikke endre tee-bokser fordi minst ett pågående eller fullført spill bruker dem. Slett spillene først, eller la disse tee-boksene stå.',
  db_course: 'Klarte ikke å lagre banen. Prøv igjen, eller sjekk Supabase-loggene.',
  db_holes: 'Klarte ikke å lagre banen. Prøv igjen, eller sjekk Supabase-loggene.',
  db_tees: 'Klarte ikke å lagre banen. Prøv igjen, eller sjekk Supabase-loggene.',
  db_load: 'Klarte ikke å lese banen fra databasen. Prøv igjen.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

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

  const supabase = await getServerClient();
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, name')
    .eq('id', id)
    .single();

  if (courseError || !course) {
    notFound();
  }

  const [holesResult, teesResult] = await Promise.all([
    supabase
      .from('course_holes')
      .select('hole_number, par, stroke_index')
      .eq('course_id', id)
      .order('hole_number', { ascending: true }),
    supabase
      .from('tee_boxes')
      .select('name, slope, course_rating, par_total')
      .eq('course_id', id)
      .order('slope', { ascending: true }),
  ]);

  if (holesResult.error) throw holesResult.error;
  if (teesResult.error) throw teesResult.error;

  const initialHoles = (holesResult.data ?? []).map((h) => ({
    hole_number: h.hole_number,
    par: h.par,
    stroke_index: h.stroke_index,
  }));

  const initialTees = (teesResult.data ?? []).map((t) => ({
    name: t.name,
    slope: t.slope,
    course_rating: Number(t.course_rating),
    par_total: t.par_total,
  }));

  // Pre-bind the course id so the form's action handler only deals with the
  // FormData payload — keeps CourseForm reusable across create + edit.
  const updateAction = updateCourse.bind(null, id);

  return (
    <AppShell>
      <PageHeader
        title="Rediger bane"
        subtitle={course.name}
        action={
          <Link
            href="/admin/courses"
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Tilbake
          </Link>
        }
      />

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <Card>
        <CourseForm
          action={updateAction}
          submitLabel="Lagre endringer"
          initialData={{
            name: course.name,
            holes: initialHoles,
            teeBoxes: initialTees,
          }}
        />
      </Card>
    </AppShell>
  );
}
