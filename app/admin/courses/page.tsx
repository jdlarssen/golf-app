import Link from 'next/link';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { BackLink } from '@/components/ui/BackLink';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';

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

const MONTHS_NB = [
  'jan',
  'feb',
  'mar',
  'apr',
  'mai',
  'jun',
  'jul',
  'aug',
  'sep',
  'okt',
  'nov',
  'des',
];

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function shortNb(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate()}. ${MONTHS_NB[d.getMonth()]} ${d.getFullYear()}`;
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
  const items = courses ?? [];

  return (
    <AdminShell>
      <div className="-mt-3 mb-2 flex items-center justify-between">
        <BackLink href="/admin">Tilbake</BackLink>
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Sekretariatet
        </p>
        <Link
          href="/admin/courses/new"
          className="rounded-full border border-border bg-[rgba(229,224,211,0.5)] px-2.5 py-[5px] font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-text"
        >
          + Ny
        </Link>
      </div>

      <BrassRibbon kicker="Baner · protokoll" />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Registrerte baner
        </h1>
        <p className="font-sans text-[11.5px] tabular-nums text-muted">
          {items.length} {items.length === 1 ? 'bane' : 'baner'} · sortert nyeste først
        </p>
      </div>

      {(statusMessage || errorMessage) && (
        <div className="mt-4 space-y-2">
          {statusMessage && <Banner tone="success">{statusMessage}</Banner>}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      {items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface px-5 py-8 text-center text-sm text-muted">
          Ingen baner ennå. Trykk «+ Ny» for å legge til den første.
        </div>
      ) : (
        <>
          <div
            className="mt-4 grid items-center gap-2.5 rounded-t-[12px] px-3.5 py-2"
            style={{
              gridTemplateColumns: '1fr 64px 14px',
              background: 'var(--primary)',
              color: 'var(--bg)',
            }}
          >
            <span
              className="font-sans text-[9.5px] font-semibold uppercase text-accent"
              style={{ letterSpacing: '0.18em' }}
            >
              Bane
            </span>
            <span
              className="text-right font-sans text-[9.5px] font-semibold uppercase text-accent"
              style={{ letterSpacing: '0.18em' }}
            >
              Tees
            </span>
            <span />
          </div>

          <div
            className="overflow-hidden rounded-b-2xl border bg-surface"
            style={{
              borderColor: 'var(--border)',
              borderTop: 'none',
            }}
          >
            {items.map((course, i) => {
              const teeCount = course.tee_boxes?.[0]?.count ?? 0;
              return (
                <Link
                  key={course.id}
                  href={`/admin/courses/${course.id}/edit`}
                  className="reveal-up grid items-center gap-2.5 px-3.5 py-3.5"
                  style={{
                    gridTemplateColumns: '1fr 64px 14px',
                    animationDelay: `${60 + i * 60}ms`,
                    borderTop:
                      i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate font-serif text-base font-medium tracking-[-0.005em] text-text">
                      {course.name}
                    </p>
                    <p className="mt-0.5 truncate font-sans text-[11.5px] tabular-nums text-muted">
                      Lagt til {shortNb(course.created_at)}
                    </p>
                  </div>
                  <p className="text-right font-serif text-[15px] font-medium tabular-nums tracking-[-0.005em] text-text">
                    {teeCount}
                  </p>
                  <span aria-hidden className="text-[14px] text-muted">
                    ›
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <p className="mt-6 text-center font-serif text-[11px] italic leading-relaxed text-muted">
        Tap en bane for å redigere protokollen.
      </p>
    </AdminShell>
  );
}
