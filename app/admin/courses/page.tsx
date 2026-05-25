import { Suspense, cache } from 'react';
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
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { CoursesLedgerClient } from './CoursesLedgerClient';

const COURSES_LEDGER_GRID = '1fr 64px 14px';

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

type CourseRow = {
  id: string;
  name: string;
  created_at: string;
  tee_boxes: { count: number }[];
};

const getCourses = cache(async () => {
  const supabase = await getServerClient();
  // PostgREST embedded count: `tee_boxes(count)` returns
  // `tee_boxes: [{ count: N }]` per row without fetching the rows themselves.
  const { data, error } = await supabase
    .from('courses')
    .select('id, name, created_at, tee_boxes(count)')
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
  const params = await searchParams;
  const status = first(params.status);
  const name = first(params.name) ?? '';
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const statusFn = status ? STATUS_MESSAGES[status] : undefined;
  const statusMessage = statusFn ? statusFn(name) : undefined;
  const userId = await getProxyVerifiedUserId();

  return (
    <AdminShell>
      <TopBar
        backHref="/admin"
        kicker="Sekretariatet"
        action={
          <SmartLink
            href="/admin/courses/new"
            className="rounded-full border border-border bg-surface-2/50 px-2.5 py-[5px] font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-text"
          >
            + Ny
          </SmartLink>
        }
        userId={userId}
      />

      <BrassRibbon kicker="Baner · katalog" />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Registrerte baner
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
        Tap en bane for å redigere katalogen.
      </p>
    </AdminShell>
  );
}

async function CourseCountLine() {
  const items = await getCourses();
  return (
    <p className="font-sans text-[11.5px] tabular-nums text-muted">
      {items.length} {items.length === 1 ? 'bane' : 'baner'} · sortert nyeste først
    </p>
  );
}

async function CoursesLedger() {
  const items = await getCourses();

  if (items.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-border bg-surface px-5 py-12 flex flex-col items-center text-center">
        <ChampagneMedallion size={72} className="mb-5">
          <BaneIcon width={36} height={36} className="text-primary dark:text-text" />
        </ChampagneMedallion>
        <p className="font-serif text-[16px] font-medium tracking-[-0.005em] text-text">
          Ingen baner ennå.
        </p>
        <p className="mt-1.5 max-w-[280px] font-sans text-[12.5px] leading-relaxed text-muted">
          Trykk «+ Ny» for å legge til den første banen i katalogen.
        </p>
      </div>
    );
  }

  return (
    <CoursesLedgerClient
      items={items.map((c) => ({
        id: c.id,
        name: c.name,
        created_at: c.created_at,
        tee_count: c.tee_boxes?.[0]?.count ?? 0,
      }))}
    />
  );
}

function CoursesLedgerSkeleton() {
  return (
    <>
      <LedgerHeader
        leftLabel="Bane"
        rightLabel="Tees"
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
