import { first } from '@/lib/url/searchParams';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
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

export default async function AdminFormatsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const t = await getTranslations('admin.formats');
  const tNav = await getTranslations('admin.nav');

  const sp = await searchParams;
  const errorCode = first(sp.error);
  const statusCode = first(sp.status);
  const errorMessage = errorCode
    ? t(`errors.${errorCode}` as Parameters<typeof t>[0])
    : undefined;
  const statusMessage =
    statusCode && statusCode !== 'noop'
      ? t(`status.${statusCode}` as Parameters<typeof t>[0])
      : undefined;

  return (
    <AdminShell>
      <TopBar backHref="/admin" kicker={tNav('klubbhus')} />
      <BrassRibbon kicker={t('kicker')} />
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
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
