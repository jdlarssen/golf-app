import { Suspense } from 'react';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { Skeleton } from '@/components/ui/Skeleton';
import { getAllFormatsWithMappings } from '@/lib/formats/getAllFormatsWithMappings';
import { getFormatMappingAudit } from '@/lib/formats/audit';
import { FormatsManager } from './FormatsManager';
import { AuditLogList } from './AuditLogList';

type SearchParams = Promise<{
  error?: string | string[];
  status?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  missing_slug: 'Format-slug mangler i forespørselen.',
  bad_intent: 'Ugyldig arrangement-type.',
  not_found: 'Formatet ble ikke funnet.',
  last_primary:
    'Kan ikke fjerne siste primary for dette arrangementet. Aktiver et annet format som primary først.',
  demote_first:
    'Demote stjernen først — et primary-format må være synlig. Avhuk primary-stjernen før du skjuler raden.',
  db_error:
    'Klarte ikke å lagre endringen. Prøv igjen, eller sjekk Vercel-loggene.',
};

const STATUS_MESSAGES: Record<string, string> = {
  updated: 'Endringen er lagret.',
  noop: 'Ingen endring (verdien var allerede satt).',
  content_saved: 'Forklaringen er lagret.',
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminFormatsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const sp = await searchParams;
  const errorCode = first(sp.error);
  const statusCode = first(sp.status);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;
  const statusMessage =
    statusCode && statusCode !== 'noop'
      ? STATUS_MESSAGES[statusCode]
      : undefined;

  return (
    <AdminShell>
      <TopBar backHref="/admin" kicker="Klubbhuset" />
      <BrassRibbon kicker="Format-mapping" />
      <PageHeader
        title="Format-mapping"
        subtitle="Styr hvilke spillformer som vises i wizardens step 2 per arrangement."
      />

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}
      {statusMessage && !errorMessage && (
        <div className="mb-4">
          <Banner tone="success">{statusMessage}</Banner>
        </div>
      )}

      <Suspense fallback={<MatrixSkeleton />}>
        <ManagerBody />
      </Suspense>

      <div className="mt-8">
        <Suspense fallback={<AuditSkeleton />}>
          <AuditBody />
        </Suspense>
      </div>
    </AdminShell>
  );
}

async function ManagerBody() {
  const formats = await getAllFormatsWithMappings();
  return <FormatsManager initialFormats={formats} />;
}

async function AuditBody() {
  const entries = await getFormatMappingAudit(50);
  return <AuditLogList entries={entries} />;
}

function MatrixSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" delay={60} />
    </div>
  );
}

function AuditSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-40 w-full rounded-lg" delay={60} />
    </div>
  );
}
