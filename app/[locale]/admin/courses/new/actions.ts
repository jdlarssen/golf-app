'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { MAX_TEE_BOXES } from '@/app/[locale]/admin/courses/constants';
import { parseCourseHolesAndTees } from '@/lib/courses/parseCourseForm';

// Open-redirect-guard: kun interne absolutte stier (start med ett '/', ikke
// protokoll-relativ '//'). redirect_base/success_redirect er klient-kontrollert
// FormData (CourseForm sender dem som skjulte inputs), så de saniteres her.
function safeInternalPath(
  value: FormDataEntryValue | null,
  fallback: string,
): string {
  const s = typeof value === 'string' ? value.trim() : '';
  // Må være en intern, enkelt-slash-rotet sti. Avvis protokoll-relativ
  // (`//host`), backslash-triks (`/\host` — nettlesere normaliserer `\` til
  // `/`), og alt med scheme. Defense-in-depth — verdien er server-konstruert,
  // men behandles som upålitelig.
  if (s.startsWith('/') && !s.startsWith('//') && !s.includes('\\')) return s;
  return fallback;
}

function appendQuery(base: string, key: string, value: string): string {
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${key}=${value}`;
}

export async function createCourse(formData: FormData) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  // #366: bane-opprettelse er åpen for ALLE innloggede brukere (ikke bare
  // admin/trusted). Vi krever kun en innlogget bruker her; RLS (migrasjon
  // 0070) håndhever created_by = auth.uid() på selve writen. Defense in depth:
  // re-gate i action-en — server-actions kan kalles direkte via fetch.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: '/login', locale });
  }

  // Hvor valideringsfeil bouncer / hvor suksess lander. Admin-flyten sender
  // ingen verdier → admin-defaults. /opprett-bane sender egne stier så
  // ikke-admin-brukere ikke kastes til /admin/courses (dit har de ikke tilgang).
  const errorBase = safeInternalPath(
    formData.get('redirect_base'),
    '/admin/courses/new',
  );
  const successRedirect = safeInternalPath(
    formData.get('success_redirect'),
    '/admin/courses?status=created',
  );
  const fail = (code: string): never =>
    redirect({ href: appendQuery(errorBase, 'error', code), locale });

  const { name, holes, teeBoxes } = parseCourseHolesAndTees(
    formData,
    MAX_TEE_BOXES,
    fail,
  );

  // #366: alle innloggede skriver via request-scoped klient. RLS-policyen
  // "courses authenticated insert own" (migrasjon 0070) tillater INSERT når
  // created_by = auth.uid(); admin dekkes òg av "courses admin write". Ingen
  // service-role-bypass — created_by = user.id er den eneste tillatte eieren.
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .insert({ name, created_by: (user as NonNullable<typeof user>).id })
    .select('id')
    .single();

  if (courseError || !course) {
    // `return` so TS narrows `course` to non-null below (a bare never-returning
    // call through the `fail` arrow isn't recognized by control-flow analysis).
    return fail('db_course');
  }

  const holesToInsert = holes.map((h) => ({ ...h, course_id: course.id }));
  const { error: holesError } = await supabase
    .from('course_holes')
    .insert(holesToInsert);
  if (holesError) {
    fail('db_holes');
  }

  // A fresh course lets the DB generate tee-box PKs — drop the diff-only `id`
  // (undefined is omitted from the insert payload, so the column default wins).
  const teesToInsert = teeBoxes.map((t) => ({
    ...t,
    id: undefined,
    course_id: course.id,
  }));
  const { error: teeError } = await supabase
    .from('tee_boxes')
    .insert(teesToInsert);
  if (teeError) {
    fail('db_tees');
  }

  redirect({
    href: appendQuery(successRedirect, 'name', encodeURIComponent(name)),
    locale,
  });
}
