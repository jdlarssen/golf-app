import { notFound } from 'next/navigation';
import { BackLink } from '@/components/ui/BackLink';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { CourseForm } from '../../CourseForm';
import { updateCourse, deleteCourse } from './actions';
import { DeleteCourseButton } from './DeleteCourseButton';

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
      .select('name, slope, course_rating, par_total, length_meters')
      .eq('course_id', id)
      .order('slope', { ascending: true }),
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
    name: t.name,
    slope: String(t.slope),
    course_rating: String(t.course_rating),
    par_total: String(t.par_total),
    length_meters: t.length_meters == null ? '' : String(t.length_meters),
  }));

  // Pre-bind the course id so the form's action handler only deals with the
  // FormData payload — keeps CourseForm reusable across create + edit.
  const updateAction = updateCourse.bind(null, id);
  const deleteAction = deleteCourse.bind(null, id);

  return (
    <AdminShell>
      <div className="-mt-3 mb-2 flex items-center justify-between">
        <BackLink href="/admin/courses">Tilbake</BackLink>
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Baner · protokoll
        </p>
        <span className="w-[80px]" aria-hidden />
      </div>

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
