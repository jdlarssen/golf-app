'use server';

import { revalidateTag } from 'next/cache';
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

  // #737: atomisk oppretting. Tidligere insertet vi courses → course_holes →
  // tee_boxes sekvensielt UTEN rollback; feilet en barn-insert, ble en
  // foreldreløs course liggende. En kompenserende slett (#675-mønsteret) hjelper
  // ikke her: en ikke-admin-skaper har INGEN DELETE-RLS på courses (kun "courses
  // admin delete", 0092), så sletten ville blitt blokkert av RLS og orphanen
  // bestått. Vi flytter de tre insertene inn i én SECURITY DEFINER RPC
  // (migrasjon 0113) som kjører dem i én transaksjon: feiler noe (DB-feil eller
  // CHECK-brudd), ruller hele oppretelsen tilbake — en halvbygd bane kan aldri
  // committes. RPC-en tvinger created_by = auth.uid() internt (#366), så eieren
  // er aldri klient-styrt. teeBoxes-radenes diff-only `id` ignoreres av RPC-ens
  // jsonb_to_recordset (kun navngitte kolonner leses). Feilkoden holdes generisk
  // (`db_course`) — de tre gamle kodene mappet uansett til samme melding.
  const { data: courseId, error: rpcError } = await supabase.rpc(
    'create_course_with_layout',
    { p_name: name, p_holes: holes, p_tees: teeBoxes },
  );
  if (rpcError || !courseId) {
    console.error('[createCourse] create_course_with_layout failed', rpcError);
    return fail('db_course');
  }

  // #1045: a new admin course may be publicly eligible → invalidate the
  // `/baner` cache so it appears on next visit, not after the 24t revalidate.
  // Before redirect() (which throws NEXT_REDIRECT and would skip this).
  revalidateTag('public-courses', 'max');

  redirect({
    href: appendQuery(successRedirect, 'name', encodeURIComponent(name)),
    locale,
  });
}
