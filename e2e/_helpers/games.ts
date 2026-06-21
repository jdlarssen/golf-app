import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';

/**
 * Felles helpers for selv-påmelding-E2E (`#199 chunk 14`).
 *
 * Vi følger samme env-guard-mønster som `e2e/auth/invitation-flow.spec.ts`:
 * fullflyts-tester krever Supabase service-role nøkler og minst én pre-seeded
 * admin-bruker. Hvis env mangler hopper testen over med `test.skip()`. Det er
 * bevisst — `npm run e2e` skal aldri feile bare fordi en utvikler ikke har
 * service-role nøkkelen lokalt.
 *
 * **VIKTIG:** Tørny tester mot prod-DB (per CLAUDE.md "Production-only testing").
 * Alle hjelpere her oppretter rader med tydelig `TEST-Påmelding-`-prefiks og
 * gir cleanup-callbacks vi kan kalle i `afterEach`/`afterAll`. Slik er
 * test-skitten lett å spore (`gh ... | grep TEST-Påmelding-`) og rydde manuelt
 * dersom en test krasjer midt-i.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL?.trim().toLowerCase();
export const PLAYER_EMAIL = process.env.E2E_PLAYER_EMAIL?.trim().toLowerCase();

/**
 * Env-readiness for selv-påmeldings-spec-ene. Krever URL + service-role +
 * admin-mail + spiller-mail (sistnevnte må være en separat pre-seeded bruker
 * med fullført profil — vi oppretter ikke konto i åre-testene).
 */
export const envReady = Boolean(
  SUPABASE_URL && SERVICE_ROLE_KEY && ADMIN_EMAIL && PLAYER_EMAIL,
);

export const skipReason = !SUPABASE_URL
  ? 'NEXT_PUBLIC_SUPABASE_URL ikke satt'
  : !SERVICE_ROLE_KEY
    ? 'SUPABASE_SERVICE_ROLE_KEY ikke satt — påkrevet for å hente OTP via admin.generateLink'
    : !ADMIN_EMAIL
      ? 'E2E_ADMIN_EMAIL ikke satt — påkrevet for å logge inn admin som oppretter test-spillet'
      : !PLAYER_EMAIL
        ? 'E2E_PLAYER_EMAIL ikke satt — påkrevet for å logge inn test-spiller som melder seg på'
        : '';

export function adminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      'Supabase service-role env missing — sjekk envReady før du kaller adminClient().',
    );
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Henter OTP for en e-post via service-role `admin.generateLink` — samme
 * teknikk som `invitation-flow.spec.ts:fetchOtpForEmail`. Trimmer whitespace
 * fordi `VerifyCodeForm` filtrerer alt utenom siffer.
 */
export async function fetchOtpForEmail(email: string): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error) {
    throw new Error(`generateLink for ${email} failed: ${error.message}`);
  }
  const otp = data?.properties?.email_otp?.replace(/\s+/g, '');
  if (!otp) {
    throw new Error(`generateLink returned no email_otp for ${email}`);
  }
  return otp;
}

/**
 * Logger inn `email` ved å drive KUN verify-steget på `/login` — vi hopper
 * bevisst over «Send meg kode» (sendCode → signInWithOtp).
 *
 * Hvorfor: send-steget er rate-limitet to veier — appens per-e-post/per-IP-
 * bøtte (`consumeLoginRateLimit`, kun i `sendCode`) OG Supabase sin egen
 * OTP-send-throttle. Suiten logger de samme få e-postene inn flere ganger fra
 * én CI-IP, som trigger begge og gir `?error=rate_limited`. Verify-steget
 * kaller aldri rate-limiteren, så vi henter en gyldig OTP via admin-API-et
 * (`generateLink`) og navigerer rett til `?step=verify`. Den ekte session-
 * settende stien (`verifyOtp` → cookie) kjøres fortsatt.
 *
 * Forutsetter at caller har navigert til `/login?next=<beskyttet>` (vi leser
 * `next` fra URL-en så post-verify-redirecten lander der testen forventer).
 * Venter på at vi har forlatt `/login` før retur.
 */
export async function signInViaOtp(page: Page, email: string): Promise<void> {
  const next = new URL(page.url()).searchParams.get('next') ?? '';

  // Mint OTP via admin (ingen send-steg → unngår begge rate-limit-lagene).
  const otp = await fetchOtpForEmail(email);

  const qs = new URLSearchParams({ step: 'verify', email });
  if (next) qs.set('next', next);
  await page.goto(`/login?${qs.toString()}`);

  await expect(page.getByLabel('Kode')).toBeVisible();
  // pressSequentially (ikke fill): skriver siffer for siffer så komponentens
  // onChange-baserte auto-submit (ved 8 siffer) fyrer pålitelig ÉN gang. `fill`
  // setter verdien i ett jafs og trigget auto-submit ustabilt — testen ble da
  // stående på verify-steget uten å levere (ingen `error=`), en #674-gate-flak.
  await page.getByLabel('Kode').pressSequentially(otp);

  // <8-sifrete OTP-er når aldri auto-submit-terskelen — klikk knappen. (Ingen
  // dobbel-submit: 8-sifret auto-submitter alt, kortere gjør det ikke.)
  if (otp.length < 8) {
    await page.getByRole('button', { name: 'Logg inn' }).click();
  }

  await expect(page).not.toHaveURL(/\/login\b/, { timeout: 15_000 });
}

export type CreatedGame = {
  id: string;
  shortId: string;
  name: string;
  createdBy: string;
};

export type CreateTestGameOpts = {
  registrationMode: 'invite_only' | 'manual_approval' | 'open';
  registrationType?: 'solo' | 'team' | 'both';
  /** Brukes for å skille games i logger/Supabase-dashboardet. Vi prepender
   * alltid `TEST-Påmelding-` så manuell opprydding via en LIKE-spørring er
   * triviell. */
  nameSuffix?: string;
};

/**
 * Oppretter et minimalt test-spill direkte via service-role. Bruker første
 * tilgjengelige `course` + `tee_box` — vi tester påmeldings-flyten, ikke
 * scoring, så banen er bare en avhengighets-tilfredsstillelse for FK-ene.
 *
 * Bruker e-posten i `ADMIN_EMAIL` til å sette `created_by`. Spillet får
 * status `draft` (påmelding skal være åpen pre-active per RLS-policy).
 *
 * Returnerer `id`, `shortId` og `name`. Caller MÅ kalle
 * `cleanupTestGame(id)` i `afterEach`/`afterAll` selv om testen feiler — vi
 * vil ikke at TEST-spill skal samle seg i prod-DB.
 */
export async function createTestGame(
  opts: CreateTestGameOpts,
): Promise<CreatedGame> {
  const admin = adminClient();

  if (!ADMIN_EMAIL) {
    throw new Error('E2E_ADMIN_EMAIL ikke satt');
  }

  const { data: adminUser, error: adminLookupErr } = await admin
    .from('users')
    .select('id')
    .ilike('email', ADMIN_EMAIL)
    .maybeSingle<{ id: string }>();
  if (adminLookupErr || !adminUser) {
    throw new Error(
      `Klarte ikke å finne admin-bruker ${ADMIN_EMAIL}: ${adminLookupErr?.message ?? 'no row'}`,
    );
  }

  const { data: course, error: courseErr } = await admin
    .from('courses')
    .select('id')
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (courseErr || !course) {
    throw new Error(
      `Ingen course-rader tilgjengelig for test-spill: ${courseErr?.message ?? 'no row'}`,
    );
  }

  const { data: teeBox, error: teeErr } = await admin
    .from('tee_boxes')
    .select('id')
    .eq('course_id', course.id)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (teeErr || !teeBox) {
    throw new Error(
      `Ingen tee_box for course ${course.id}: ${teeErr?.message ?? 'no row'}`,
    );
  }

  const name = `TEST-Påmelding-${Date.now()}${opts.nameSuffix ? `-${opts.nameSuffix}` : ''}`;

  const { data: game, error: gameErr } = await admin
    .from('games')
    .insert({
      name,
      course_id: course.id,
      tee_box_id: teeBox.id,
      game_mode: 'stableford',
      mode_config: {},
      registration_mode: opts.registrationMode,
      registration_type: opts.registrationType ?? 'solo',
      status: 'draft',
      created_by: adminUser.id,
    })
    .select('id, short_id, name, created_by')
    .single<{
      id: string;
      short_id: string;
      name: string;
      created_by: string;
    }>();

  if (gameErr || !game) {
    throw new Error(
      `Insert TEST-spill feilet: ${gameErr?.message ?? 'no row'}`,
    );
  }

  return {
    id: game.id,
    shortId: game.short_id,
    name: game.name,
    createdBy: game.created_by,
  };
}

export type ActiveGame = {
  id: string;
  shortId: string;
  name: string;
  adminUserId: string;
  playerUserId: string;
};

/**
 * Seeder et AKTIVT solo-stableford-spill med to spillere i samme flight: admin
 * (oppretteren) + en separat test-spiller. Begge får `accepted_at` satt og en
 * `course_handicap`, så RLS-medlemskaps-sjekken passerer og leaderboard kan
 * regne netto-poeng. Brukes av den autentiserte golden-path-spec-en (#674):
 * spiller taster slag → leverer → admin godkjenner → leaderboard.
 *
 * Insert-shapet er validert mot live-skjema (game_players har INGEN `status`-
 * kolonne; `tee_gender` er NOT NULL men har default — vi setter den eksplisitt).
 * Caller MÅ kalle `cleanupTestGame(id)` i `afterAll`. Velger en bane-tee med
 * herre-rating (samme som liga-spec-en) så hull-par + stroke_index finnes for
 * scoring/leaderboard.
 */
export async function seedActiveStablefordGame(
  nameSuffix?: string,
): Promise<ActiveGame> {
  const admin = adminClient();
  if (!ADMIN_EMAIL || !PLAYER_EMAIL) {
    throw new Error('E2E_ADMIN_EMAIL / E2E_PLAYER_EMAIL ikke satt');
  }

  const { data: adminUser } = await admin
    .from('users')
    .select('id')
    .ilike('email', ADMIN_EMAIL)
    .maybeSingle<{ id: string }>();
  const { data: playerUser } = await admin
    .from('users')
    .select('id')
    .ilike('email', PLAYER_EMAIL)
    .maybeSingle<{ id: string }>();
  if (!adminUser) throw new Error(`Admin-bruker ${ADMIN_EMAIL} ikke funnet`);
  if (!playerUser) throw new Error(`Spiller-bruker ${PLAYER_EMAIL} ikke funnet`);

  const { data: tee } = await admin
    .from('tee_boxes')
    .select('id, course_id')
    .not('par_total_mens', 'is', null)
    .limit(1)
    .maybeSingle<{ id: string; course_id: string }>();
  if (!tee) throw new Error('Ingen tee_box med herre-rating tilgjengelig');

  const name = `TEST-GoldenPath-${Date.now()}${nameSuffix ? `-${nameSuffix}` : ''}`;
  const { data: game, error: gameErr } = await admin
    .from('games')
    .insert({
      name,
      course_id: tee.course_id,
      tee_box_id: tee.id,
      game_mode: 'stableford',
      mode_config: {},
      registration_mode: 'invite_only',
      registration_type: 'solo',
      status: 'active',
      created_by: adminUser.id,
    })
    .select('id, short_id, name')
    .single<{ id: string; short_id: string; name: string }>();
  if (gameErr || !game) {
    throw new Error(`Insert aktivt TEST-spill feilet: ${gameErr?.message ?? 'no row'}`);
  }

  const acceptedAt = new Date().toISOString();
  const { error: gpErr } = await admin.from('game_players').insert([
    {
      game_id: game.id,
      user_id: adminUser.id,
      flight_number: 1,
      course_handicap: 18,
      accepted_at: acceptedAt,
    },
    {
      game_id: game.id,
      user_id: playerUser.id,
      flight_number: 1,
      course_handicap: 18,
      accepted_at: acceptedAt,
    },
  ]);
  if (gpErr) {
    await cleanupTestGame(game.id);
    throw new Error(`Insert game_players feilet: ${gpErr.message}`);
  }

  return {
    id: game.id,
    shortId: game.short_id,
    name: game.name,
    adminUserId: adminUser.id,
    playerUserId: playerUser.id,
  };
}

/**
 * Seeder et aktivt solo-stableford-spill med én spiller (admin) uten
 * flight-tilordning (flight_number = null). Dekker «Regel 3»-stien i
 * game-home-siden: soloMode && me.flight_number == null → FlightRoster
 * med flightNumber=null viser alle deltakere (#814).
 *
 * Caller MÅ kalle `cleanupTestGame(id)` i `afterAll`.
 */
export async function seedSoloFlightlessGame(
  nameSuffix?: string,
): Promise<ActiveGame> {
  const admin = adminClient();
  if (!ADMIN_EMAIL || !PLAYER_EMAIL) {
    throw new Error('E2E_ADMIN_EMAIL / E2E_PLAYER_EMAIL ikke satt');
  }

  const { data: adminUser } = await admin
    .from('users')
    .select('id')
    .ilike('email', ADMIN_EMAIL)
    .maybeSingle<{ id: string }>();
  const { data: playerUser } = await admin
    .from('users')
    .select('id')
    .ilike('email', PLAYER_EMAIL)
    .maybeSingle<{ id: string }>();
  if (!adminUser) throw new Error(`Admin-bruker ${ADMIN_EMAIL} ikke funnet`);
  if (!playerUser) throw new Error(`Spiller-bruker ${PLAYER_EMAIL} ikke funnet`);

  const { data: tee } = await admin
    .from('tee_boxes')
    .select('id, course_id')
    .not('par_total_mens', 'is', null)
    .limit(1)
    .maybeSingle<{ id: string; course_id: string }>();
  if (!tee) throw new Error('Ingen tee_box med herre-rating tilgjengelig');

  const name = `TEST-SoloFlightless-${Date.now()}${nameSuffix ? `-${nameSuffix}` : ''}`;
  const { data: game, error: gameErr } = await admin
    .from('games')
    .insert({
      name,
      course_id: tee.course_id,
      tee_box_id: tee.id,
      game_mode: 'stableford',
      mode_config: {},
      registration_mode: 'invite_only',
      registration_type: 'solo',
      // 'scheduled', not 'active': the solo participant roster (Regel 3 →
      // FlightRoster(flightNumber=null)) only renders in the scheduled
      // waiting-room view. An active game redirects the player into play, so
      // the roster — and its data-testid — would never mount. No
      // scheduled_tee_off_at is set, so the auto-start fallback stays inert.
      status: 'scheduled',
      created_by: adminUser.id,
    })
    .select('id, short_id, name')
    .single<{ id: string; short_id: string; name: string }>();
  if (gameErr || !game) {
    throw new Error(`Insert scheduled TEST-spill feilet: ${gameErr?.message ?? 'no row'}`);
  }

  // flight_number er bevisst null — dette er nøyaktig stien som utløser
  // FlightRoster(flightNumber=null) i Regel 3 på game-home-siden.
  const acceptedAt = new Date().toISOString();
  const { error: gpErr } = await admin.from('game_players').insert([
    {
      game_id: game.id,
      user_id: adminUser.id,
      flight_number: null,
      course_handicap: 18,
      accepted_at: acceptedAt,
    },
    {
      game_id: game.id,
      user_id: playerUser.id,
      flight_number: null,
      course_handicap: 18,
      accepted_at: acceptedAt,
    },
  ]);
  if (gpErr) {
    await cleanupTestGame(game.id);
    throw new Error(`Insert game_players feilet: ${gpErr.message}`);
  }

  return {
    id: game.id,
    shortId: game.short_id,
    name: game.name,
    adminUserId: adminUser.id,
    playerUserId: playerUser.id,
  };
}

/**
 * Sletter test-spillet. Cascade på `games.id` rydder `game_players`,
 * `game_registration_requests`, `notifications` (de som har payload-ref til
 * spillet — disse er soft-ref, men vi tar dem manuelt under). Idempotent —
 * trygt å kalle selv om raden allerede er borte.
 */
export async function cleanupTestGame(gameId: string): Promise<void> {
  if (!gameId) return;
  try {
    const admin = adminClient();
    await admin.from('games').delete().eq('id', gameId);
  } catch (err) {
    console.error('[cleanupTestGame] swallow error', err);
  }
}
