import Link from 'next/link';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';

type SearchParams = Promise<{
  status?: string | string[];
  name?: string | string[];
  error?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  not_found: 'Banen ble ikke funnet.',
  in_use:
    'Kan ikke slette banen fordi minst ett spill bruker den. Slett spillene først.',
  delete_failed:
    'Klarte ikke å slette banen. Prøv igjen, eller sjekk Supabase-loggene.',
};

const STATUS_MESSAGES: Record<string, (name: string) => string> = {
  created: (name) => `✓ Banen «${name}» ble lagret.`,
  updated: (name) => `✓ Banen «${name}» ble oppdatert.`,
  deleted: () => `✓ Banen ble slettet.`,
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('no-NO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type CourseRow = {
  id: string;
  name: string;
  created_at: string;
  tee_boxes: { count: number }[];
};

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const status = first(params.status);
  const name = first(params.name) ?? '';
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const supabase = await getServerClient();
  // PostgREST embedded count: `tee_boxes(count)` returns
  // `tee_boxes: [{ count: N }]` per row without fetching the rows themselves.
  const { data: courses, error } = await supabase
    .from('courses')
    .select('id, name, created_at, tee_boxes(count)')
    .order('created_at', { ascending: false })
    .returns<CourseRow[]>();

  if (error) {
    throw error;
  }

  const statusFn = status ? STATUS_MESSAGES[status] : undefined;
  const statusMessage = statusFn ? statusFn(name) : undefined;

  return (
    <AppShell>
      <PageHeader
        title="Baner"
        subtitle="Administrer golfbaner og tee-bokser"
        action={
          <BackLink href="/admin">Tilbake</BackLink>
        }
      />

      {statusMessage && (
        <div className="mb-4">
          <Banner tone="success">{statusMessage}</Banner>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div className="mb-4">
        <Link
          href="/admin/courses/new"
          className="block w-full text-center bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
        >
          + Ny bane
        </Link>
      </div>

      <Card>
        {courses && courses.length > 0 ? (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {courses.map((course) => {
              const teeCount = course.tee_boxes?.[0]?.count ?? 0;
              return (
                <li key={course.id} className="py-3">
                  <Link
                    href={`/admin/courses/${course.id}/edit`}
                    className="block hover:bg-zinc-50 dark:hover:bg-zinc-800 -mx-2 px-2 py-1 rounded transition-colors"
                  >
                    <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                      {course.name}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {teeCount} tee-bokser
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Lagt til {formatDate(course.created_at)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            Ingen baner ennå. Legg til Stiklestad eller andre baner for å komme i gang.
          </p>
        )}
      </Card>
    </AppShell>
  );
}
