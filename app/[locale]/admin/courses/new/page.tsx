import { getLocale, getTranslations } from 'next-intl/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { CourseForm } from '../CourseForm';
import { createCourse } from './actions';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { courseFormErrorMessages } from '@/lib/courses/courseFormState';

export default async function NewCoursePage() {
  // Page-level gate: admin-only.
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'courseForm' });

  // Admin door uses adminErrors.* for codes that differ from the user door
  // (tee_required, tee_no_rating, db_*). Shared codes use errors.*. A refused
  // save comes back to the form as a code (audit 2026-11-20).
  const errorMessages = courseFormErrorMessages((code) => {
    const adminKey = `adminErrors.${code}` as Parameters<typeof t>[0];
    if (t.has(adminKey)) return t(adminKey);
    const sharedKey = `errors.${code}` as Parameters<typeof t>[0];
    return t.has(sharedKey) ? t(sharedKey) : undefined;
  }, t('adminErrors.db_course'));

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

      <div className="mt-5">
        <CourseForm
          action={createCourse}
          errorMessages={errorMessages}
          submitLabel={t('adminDoor.submitLabel')}
          tone="admin"
          // #2485: «Bruk denne» opens the course's edit page here.
          similarCourses={{ kind: 'edit' }}
        />
      </div>
    </AdminShell>
  );
}
