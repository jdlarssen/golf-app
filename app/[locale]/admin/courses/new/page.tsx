import { first } from '@/lib/url/searchParams';
import { getLocale, getTranslations } from 'next-intl/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { CourseForm } from '../CourseForm';
import { createCourse } from './actions';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';

type SearchParams = Promise<{ error?: string | string[] }>;

export default async function NewCoursePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Page-level gate: admin OR trusted creator (Fase 4).
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'courseForm' });

  const params = await searchParams;
  const errorCode = first(params.error);

  // Admin door uses adminErrors.* for codes that differ from the user door
  // (tee_required, tee_no_rating, db_*). Shared codes use errors.*.
  // Unknown codes render no banner.
  function resolveAdminError(code: string): string | undefined {
    const adminKey = `adminErrors.${code}` as Parameters<typeof t>[0];
    if (t.has(adminKey)) return t(adminKey);
    const sharedKey = `errors.${code}` as Parameters<typeof t>[0];
    if (t.has(sharedKey)) return t(sharedKey);
    return undefined;
  }

  const errorMessage = errorCode ? resolveAdminError(errorCode) : undefined;

  return (
    <AdminShell>
      <TopBar
        backHref="/admin/courses"
        kicker={t('adminDoor.kicker')}
      />

      <BrassRibbon kicker={t('adminDoor.brassRibbon')} />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('adminDoor.heading')}
        </h1>
        <p className="font-sans text-[11.5px] text-muted">
          {t('adminDoor.subtitle')}
        </p>
      </div>

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div className="mt-5">
        <Card>
          <CourseForm action={createCourse} submitLabel={t('adminDoor.submitLabel')} />
        </Card>
      </div>
    </AdminShell>
  );
}
