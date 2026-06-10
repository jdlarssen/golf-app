'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { MAX_TEE_BOXES } from '@/app/[locale]/admin/courses/constants';

type GenderRating = {
  slope: number | null;
  course_rating: number | null;
};

function parseGenderRating(
  formData: FormData,
  teeIndex: number,
  gender: 'mens' | 'ladies' | 'juniors',
): GenderRating {
  const slopeStr = String(formData.get(`tee_${teeIndex}_slope_${gender}`) ?? '').trim();
  const crStr = String(formData.get(`tee_${teeIndex}_cr_${gender}`) ?? '').trim();

  const slope = slopeStr === '' ? null : Number(slopeStr);
  const cr = crStr === '' ? null : Number(crStr);

  return {
    slope: slope !== null && Number.isInteger(slope) && slope >= 55 && slope <= 155 ? slope : null,
    course_rating: cr !== null && Number.isFinite(cr) && cr >= 50 && cr <= 80 ? cr : null,
  };
}

function isCompleteRating(r: GenderRating): boolean {
  return r.slope !== null && r.course_rating !== null;
}

// Distinguishes "left blank" from "partially filled" — we only complain about
// the latter, since admin can legitimately leave any gender empty.
function isPartiallyFilled(
  formData: FormData,
  teeIndex: number,
  gender: 'mens' | 'ladies' | 'juniors',
): boolean {
  const slopeStr = String(formData.get(`tee_${teeIndex}_slope_${gender}`) ?? '').trim();
  const crStr = String(formData.get(`tee_${teeIndex}_cr_${gender}`) ?? '').trim();
  const filled = [slopeStr, crStr].filter((s) => s !== '').length;
  return filled === 1;
}

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
  const supabase = await getServerClient();
  // #366: bane-opprettelse er åpen for ALLE innloggede brukere (ikke bare
  // admin/trusted). Vi krever kun en innlogget bruker her; RLS (migrasjon
  // 0070) håndhever created_by = auth.uid() på selve writen. Defense in depth:
  // re-gate i action-en — server-actions kan kalles direkte via fetch.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
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
    redirect(appendQuery(errorBase, 'error', code));

  const name = String(formData.get('name') ?? '').trim();
  if (!name) {
    fail('name_required');
  }

  // Parse 18 holes.
  const holes: {
    hole_number: number;
    par_mens: number;
    par_ladies: number;
    par_juniors: number;
    stroke_index: number;
  }[] = [];
  for (let i = 1; i <= 18; i++) {
    const parMensRaw = formData.get(`hole_${i}_par_mens`);
    // Backward-compat: hvis ny `_mens`-feltet mangler (ingen formdata med
    // det nye navnet), fall tilbake til det gamle `hole_${i}_par`-navnet.
    // Hovedstien sender alltid `_mens` etter at CourseForm ble oppdatert.
    const parMens = Number(parMensRaw ?? formData.get(`hole_${i}_par`));
    // For damer og junior: når seksjonen er kollapset i form, sendes
    // hidden-mirror-input med samme verdi som par_mens. Hvis ingen verdi
    // finnes (eldre form-payload), fall tilbake til par_mens slik at
    // INSERT-en alltid får tre tall.
    const parLadiesRaw = formData.get(`hole_${i}_par_ladies`);
    const parLadies =
      parLadiesRaw === null ? parMens : Number(parLadiesRaw);
    const parJuniorsRaw = formData.get(`hole_${i}_par_juniors`);
    const parJuniors =
      parJuniorsRaw === null ? parMens : Number(parJuniorsRaw);
    const si = Number(formData.get(`hole_${i}_si`));

    for (const par of [parMens, parLadies, parJuniors]) {
      if (!Number.isInteger(par) || par < 3 || par > 6) {
        fail('bad_par');
      }
    }
    if (!Number.isInteger(si) || si < 1 || si > 18) {
      fail('bad_si');
    }
    holes.push({
      hole_number: i,
      par_mens: parMens,
      par_ladies: parLadies,
      par_juniors: parJuniors,
      stroke_index: si,
    });
  }

  // SIs must be a permutation of 1..18 — the schema enforces uniqueness per
  // course but we'd rather show a friendly error than surface a DB constraint.
  const siSet = new Set(holes.map((h) => h.stroke_index));
  if (siSet.size !== 18) {
    fail('si_duplicate');
  }

  // par_total per kjønn deriveres fra hullene per kjønn — auto-sync med
  // course_holes-radene som blir insertet. Når et kjønn ikke har avvik
  // matcher dette tallet par_total_mens, så ingen migrasjons-impact.
  const parSumMens = holes.reduce((s, h) => s + h.par_mens, 0);
  const parSumLadies = holes.reduce((s, h) => s + h.par_ladies, 0);
  const parSumJuniors = holes.reduce((s, h) => s + h.par_juniors, 0);

  // Parse tee boxes. Rows with an empty name are skipped — the form sends up
  // to MAX_TEE_BOXES slots but only the populated ones count.
  const teeBoxes: {
    name: string;
    length_meters: number | null;
    slope_mens: number | null;
    course_rating_mens: number | null;
    par_total_mens: number | null;
    slope_ladies: number | null;
    course_rating_ladies: number | null;
    par_total_ladies: number | null;
    slope_juniors: number | null;
    course_rating_juniors: number | null;
    par_total_juniors: number | null;
  }[] = [];
  for (let i = 0; i < MAX_TEE_BOXES; i++) {
    const teeName = String(formData.get(`tee_${i}_name`) ?? '').trim();
    if (!teeName) continue;

    // length_meters is optional. Empty / non-integer / out of range → NULL.
    // The DB has a CHECK between 1000 and 12000; we mirror that here so we
    // never trip it with garbage from the form.
    const rawLength = String(formData.get(`tee_${i}_length_meters`) ?? '').trim();
    let lengthMeters: number | null = null;
    if (rawLength !== '') {
      const parsed = Number(rawLength);
      if (
        Number.isInteger(parsed) &&
        parsed >= 1000 &&
        parsed <= 12000
      ) {
        lengthMeters = parsed;
      }
    }

    // Per-gender rating: slope + CR må enten begge være satt eller begge tomme.
    for (const g of ['mens', 'ladies', 'juniors'] as const) {
      if (isPartiallyFilled(formData, i, g)) {
        fail('tee_partial_rating');
      }
    }

    const mensRating = parseGenderRating(formData, i, 'mens');
    const ladiesRating = parseGenderRating(formData, i, 'ladies');
    const juniorsRating = parseGenderRating(formData, i, 'juniors');

    if (
      !isCompleteRating(mensRating) &&
      !isCompleteRating(ladiesRating) &&
      !isCompleteRating(juniorsRating)
    ) {
      fail('tee_no_rating');
    }

    teeBoxes.push({
      name: teeName,
      length_meters: lengthMeters,
      slope_mens: mensRating.slope,
      course_rating_mens: mensRating.course_rating,
      par_total_mens: isCompleteRating(mensRating) ? parSumMens : null,
      slope_ladies: ladiesRating.slope,
      course_rating_ladies: ladiesRating.course_rating,
      par_total_ladies: isCompleteRating(ladiesRating) ? parSumLadies : null,
      slope_juniors: juniorsRating.slope,
      course_rating_juniors: juniorsRating.course_rating,
      par_total_juniors: isCompleteRating(juniorsRating) ? parSumJuniors : null,
    });
  }
  if (teeBoxes.length === 0) {
    fail('tee_required');
  }

  // #366: alle innloggede skriver via request-scoped klient. RLS-policyen
  // "courses authenticated insert own" (migrasjon 0070) tillater INSERT når
  // created_by = auth.uid(); admin dekkes òg av "courses admin write". Ingen
  // service-role-bypass — created_by = user.id er den eneste tillatte eieren.
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .insert({ name, created_by: user.id })
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

  const teesToInsert = teeBoxes.map((t) => ({ ...t, course_id: course.id }));
  const { error: teeError } = await supabase
    .from('tee_boxes')
    .insert(teesToInsert);
  if (teeError) {
    fail('db_tees');
  }

  redirect(appendQuery(successRedirect, 'name', encodeURIComponent(name)));
}
