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
 * Kjører to-stegs OTP-login i UI på `page`. Forutsetter at `page` allerede er
 * på `/login` (caller styrer URL — vi støtter `?next=` slik at oppfølgende
 * redirect lander der vi vil). Venter på at vi har forlatt `/login` før retur.
 */
export async function signInViaOtp(page: Page, email: string): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Logg inn' })).toBeVisible();
  await page.getByLabel('E-post').fill(email);
  await page.getByRole('button', { name: 'Send meg kode' }).click();

  await expect(page).toHaveURL(/\bstep=verify\b/, { timeout: 15_000 });

  const otp = await fetchOtpForEmail(email);
  await page.getByLabel('Kode').fill(otp);

  // Auto-submit skjer ved OTP_LENGTH=8. For 6-sifrete prosjekter klikker vi
  // fallback-knappen. Begge greiner venter på at URL-en forlater /login.
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
