import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { CourseForm } from '../CourseForm';
import { createCourse } from './actions';

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
  db_course:
    'Klarte ikke å lagre banen. Prøv igjen, eller sjekk Supabase-loggene.',
  db_holes:
    'Klarte ikke å lagre banen. Prøv igjen, eller sjekk Supabase-loggene.',
  db_tees:
    'Klarte ikke å lagre banen. Prøv igjen, eller sjekk Supabase-loggene.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function NewCoursePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  return (
    <AdminShell>
      <TopBar backHref="/admin/courses" kicker="Baner · protokoll" />

      <BrassRibbon kicker="Ny bane" />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Ny bane
        </h1>
        <p className="font-sans text-[11.5px] text-muted">
          Hull, par, stroke-indeks og tee-bokser
        </p>
      </div>

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div className="mt-5">
        <Card>
          <CourseForm action={createCourse} submitLabel="Lagre bane" />
        </Card>
      </div>
    </AdminShell>
  );
}
