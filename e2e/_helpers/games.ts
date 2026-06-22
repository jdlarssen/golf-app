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
 * **VIKTIG:** Tørny tester mot `torny-staging`, ALDRI prod (production-only-
 * konvensjonen ble opphevet 2026-06-20 — appen er i ekte prod-bruk). Alle
 * hjelpere her oppretter rader med tydelig `TEST-`-prefiks og gir cleanup-
 * callbacks vi kaller i `afterEach`/`afterAll`. Staging-DB-en deles på tvers av
 * worktree-sesjoner, så hold cleanup scoped til egne id-er.
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
 * Mottak-type for et enkelt OTP-verifiserings-forsøk i `withFreshOtpRetry`.
 * `retryable` skiller en superseded/utløpt token (prøv på nytt med fersk OTP) fra
 * en ekte feil (kast med en gang).
 */
export type OtpAttemptResult<T> =
  | { ok: true; value: T }
  | { ok: false; retryable: boolean };

/**
 * Mint-og-verifiser-med-retry-primitiv (#861).
 *
 * Hver `generateLink`-mint REGENERERER brukerens ene engangs-token og ugyldiggjør
 * den forrige. Når to innlogginger på samme e-post flettes (parallelle Playwright-
 * workers lokalt, eller TTL-drift), kan et tidligere `verifyOtp` lande på en token
 * en senere mint allerede har supersedet → Supabase svarer «expired or invalid» →
 * appen redirecter til `/login?...&error=code_expired`.
 *
 * Vi absorberer racen ved å mint en FERSK OTP per forsøk og prøve på nytt ved en
 * retryable feil, med jittret backoff så to racende workers de-korrelerer i stedet
 * for å låse-steg inn i å ugyldiggjøre hverandre på nytt. `mint` injiseres (ikke
 * hardkodet til `fetchOtpForEmail`) så den deterministiske bevis-spec-en kan kjøre
 * den EKTE attempt/navigerings-logikken med en «forgiftet» mint.
 */
export async function withFreshOtpRetry<T>(
  mint: () => Promise<string>,
  attempt: (otp: string) => Promise<OtpAttemptResult<T>>,
  opts?: { maxAttempts?: number; label?: string },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  let lastReason = 'ingen forsøk kjørt';
  for (let i = 1; i <= maxAttempts; i++) {
    const otp = await mint();
    const res = await attempt(otp);
    if (res.ok) return res.value;
    lastReason = `forsøk ${i}/${maxAttempts} feilet (retryable=${res.retryable})`;
    if (!res.retryable || i === maxAttempts) break;
    // Jittret backoff (~250–650 ms): de-korrelerer parallelle re-mints så to
    // racere ikke umiddelbart ugyldiggjør hverandre på nytt i lås-steg.
    await new Promise((r) => setTimeout(r, 250 + Math.floor(Math.random() * 400)));
  }
  throw new Error(
    `withFreshOtpRetry(${opts?.label ?? 'otp'}) brukte opp ${maxAttempts} forsøk: ${lastReason}`,
  );
}

/**
 * Testbar kjerne for `signInViaOtp`: driver KUN verify-steget på `/login` med en
 * injiserbar `mint`. Produksjons-wrapperen sender `() => fetchOtpForEmail(email)`;
 * bevis-spec-en sender en mint som tvinger `code_expired` på første forsøk (#861).
 *
 * Hvorfor verify-only: send-steget («Send meg kode» → sendCode → signInWithOtp) er
 * rate-limitet to veier (appens `consumeLoginRateLimit` + Supabase sin OTP-send-
 * throttle). Verify-steget kaller aldri rate-limiteren, så vi henter en gyldig OTP
 * via admin-API-et og navigerer rett til `?step=verify`. Den ekte session-settende
 * stien (`verifyOtp` → cookie) kjøres fortsatt.
 *
 * Forutsetter at caller har navigert til `/login?next=<beskyttet>` — vi leser
 * `next` ÉN gang før løkka og re-bruker den på hvert forsøk (et feilet forsøk lander
 * på `/login?...&error=...` uten `next`).
 */
export async function signInViaOtpWith(
  page: Page,
  email: string,
  mint: () => Promise<string>,
): Promise<void> {
  const next = new URL(page.url()).searchParams.get('next') ?? '';

  await withFreshOtpRetry<void>(
    mint,
    async (otp) => {
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

      // Vent på at verify-redirecten lander: enten har vi forlatt `/login`
      // (suksess) eller en `error`-param dukket opp (code_expired/code_invalid).
      await page.waitForURL(
        (url) => !/\/login\b/.test(url.pathname) || url.searchParams.has('error'),
        { timeout: 15_000 },
      );

      const landed = new URL(page.url());
      if (!/\/login\b/.test(landed.pathname)) {
        return { ok: true, value: undefined };
      }
      const err = landed.searchParams.get('error');
      // En supersedet/utløpt token gir code_expired (og av og til code_invalid
      // siden vi alltid mater en fersk, korrekt OTP). Begge er retryable her.
      return {
        ok: false,
        retryable: err === 'code_expired' || err === 'code_invalid',
      };
    },
    { label: `signInViaOtp(${email})` },
  );

  await expect(page).not.toHaveURL(/\/login\b/);
}

/**
 * Logger inn `email` ved å drive KUN verify-steget på `/login`. Tynn wrapper over
 * `signInViaOtpWith` med produksjons-minten (`fetchOtpForEmail`) — beholder retry-
 * mot-`code_expired` (#861) for alle eksisterende callers uten signatur-endring.
 */
export async function signInViaOtp(page: Page, email: string): Promise<void> {
  await signInViaOtpWith(page, email, () => fetchOtpForEmail(email));
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

export type ModePlayerSeed = {
  userId: string;
  courseHandicap: number;
  /** Matchplay-familien: 1/2. Solo/poeng-format: null (default). */
  teamNumber?: number | null;
};

/**
 * Per-hull Wolf-valg (`wolf_hole_choices`). Wolf-scoring leser disse direkte
 * (kanonisk kilde) — uten dem faller modulen tilbake på rotasjon, men outcome
 * blir 'pending' (ingen choice → ingen poeng). Et finished-validerings-orakel
 * MÅ seede dem. DB-CHECK `partner_only_when_partner_choice`: `partnerUserId`
 * settes KUN når `choice === 'partner'`.
 */
export type WolfChoiceSeed = {
  holeNumber: number;
  wolfUserId: string;
  choice: 'partner' | 'lone' | 'blind';
  partnerUserId?: string | null;
};

/**
 * Per-hull Bingo-Bango-Bongo-prestasjonsrad (`bingo_bango_bongo_holes`). BBB-
 * poeng utledes IKKE fra slag — de kommer fra disse radene. Et finished-
 * validerings-orakel MÅ seede dem (ellers deler ingen hull ut poeng). Alle tre
 * felt er nullable (et hull kan mangle en mottaker).
 */
export type BingoBangoBongoHoleSeed = {
  holeNumber: number;
  bingoUserId?: string | null;
  bangoUserId?: string | null;
  bongoUserId?: string | null;
};

/**
 * Seeder et FERDIG spill for `gameMode` med gitte spillere + en score-matrise,
 * der alle `game_players` er accepted+submitted+approved. Brukes av per-modus
 * finish-and-validate-banene (#736, del C): den ekte fetch+scoring+render-
 * pipelinen kjører mot dette, og spec-en asserter at leaderboard-DOM matcher et
 * uavhengig hardkodet orakel.
 *
 * `scoresByHole[holeNumber] = { [userId]: strokes }`. Kun hull i matrisa seedes
 * — send et delsett for å drive en «avgjort tidlig» matchplay. Scores seedes kun
 * for hull-numre som faktisk finnes på banen (så par/SI-oppslag aldri treffer en
 * manglende rad, #642). Caller MÅ kalle `cleanupTestGame(id)` i `afterAll`.
 *
 * Wolf/BBB henter per-hull-valg fra egne tabeller (`wolf_hole_choices` /
 * `bingo_bango_bongo_holes`) som scores IKKE dekker — send dem via `wolfChoices`
 * / `bingoBangoBongoHoles` (#848). Uten dem gir Wolf 'pending' (0 poeng) og BBB
 * 0 poeng, så et validerings-orakel for disse to modusene MÅ seede dem.
 */
export async function seedFinishedModeGame(input: {
  nameSuffix: string;
  gameMode: string;
  modeConfig: Record<string, unknown>;
  players: ModePlayerSeed[];
  scoresByHole: Record<number, Record<string, number>>;
  /** Per-hull Wolf-valg (kun for `gameMode === 'wolf'`). */
  wolfChoices?: WolfChoiceSeed[];
  /** Per-hull BBB-rader (kun for `gameMode === 'bingo_bango_bongo'`). */
  bingoBangoBongoHoles?: BingoBangoBongoHoleSeed[];
}): Promise<{ id: string; courseId: string; teeBoxId: string }> {
  const admin = adminClient();
  const { data: tee } = await admin
    .from('tee_boxes')
    .select('id, course_id')
    .not('par_total_mens', 'is', null)
    .limit(1)
    .maybeSingle<{ id: string; course_id: string }>();
  if (!tee) throw new Error('Ingen tee_box med herre-rating tilgjengelig');

  const { data: holes } = await admin
    .from('course_holes')
    .select('hole_number')
    .eq('course_id', tee.course_id);
  const validHoles = new Set((holes ?? []).map((h) => h.hole_number as number));

  const stampIso = new Date().toISOString();
  const name = `TEST-Mode-${input.gameMode}-${Date.now()}-${input.nameSuffix}`;
  const { data: game, error } = await admin
    .from('games')
    .insert({
      name,
      course_id: tee.course_id,
      tee_box_id: tee.id,
      status: 'finished',
      game_mode: input.gameMode,
      mode_config: input.modeConfig,
      created_by: input.players[0].userId,
    })
    .select('id')
    .single<{ id: string }>();
  if (error || !game) {
    throw new Error(`seed mode game failed: ${error?.message ?? 'no row'}`);
  }
  const gameId = game.id;

  const { error: gpErr } = await admin.from('game_players').insert(
    input.players.map((p) => ({
      game_id: gameId,
      user_id: p.userId,
      team_number: p.teamNumber ?? null,
      flight_number: 1,
      course_handicap: p.courseHandicap,
      accepted_at: stampIso,
      submitted_at: stampIso,
      approved_at: stampIso,
    })),
  );
  if (gpErr) {
    await cleanupTestGame(gameId);
    throw new Error(`game_players insert failed: ${gpErr.message}`);
  }

  const scoreRows: Record<string, unknown>[] = [];
  for (const [holeStr, byUser] of Object.entries(input.scoresByHole)) {
    const hole = Number(holeStr);
    if (!validHoles.has(hole)) continue;
    for (const [userId, strokes] of Object.entries(byUser)) {
      scoreRows.push({
        game_id: gameId,
        user_id: userId,
        hole_number: hole,
        strokes,
        entered_by: userId,
        client_updated_at: stampIso,
      });
    }
  }
  if (scoreRows.length > 0) {
    const { error: sErr } = await admin.from('scores').insert(scoreRows);
    if (sErr) {
      await cleanupTestGame(gameId);
      throw new Error(`scores insert failed: ${sErr.message}`);
    }
  }

  // Wolf per-hull-valg: scoring leser disse direkte. `entered_by` må være en
  // ekte bruker — vi bruker oppretteren (players[0]). Kun hull som finnes seedes.
  if (input.wolfChoices && input.wolfChoices.length > 0) {
    const enteredBy = input.players[0].userId;
    const choiceRows = input.wolfChoices
      .filter((c) => validHoles.has(c.holeNumber))
      .map((c) => ({
        game_id: gameId,
        hole_number: c.holeNumber,
        wolf_user_id: c.wolfUserId,
        choice: c.choice,
        partner_user_id: c.choice === 'partner' ? (c.partnerUserId ?? null) : null,
        entered_by: enteredBy,
      }));
    if (choiceRows.length > 0) {
      const { error: wErr } = await admin
        .from('wolf_hole_choices')
        .insert(choiceRows);
      if (wErr) {
        await cleanupTestGame(gameId);
        throw new Error(`wolf_hole_choices insert failed: ${wErr.message}`);
      }
    }
  }

  // BBB per-hull-prestasjonsrader: poeng utledes herfra, ikke fra slag.
  if (input.bingoBangoBongoHoles && input.bingoBangoBongoHoles.length > 0) {
    const enteredBy = input.players[0].userId;
    const bbbRows = input.bingoBangoBongoHoles
      .filter((h) => validHoles.has(h.holeNumber))
      .map((h) => ({
        game_id: gameId,
        hole_number: h.holeNumber,
        bingo_user_id: h.bingoUserId ?? null,
        bango_user_id: h.bangoUserId ?? null,
        bongo_user_id: h.bongoUserId ?? null,
        entered_by: enteredBy,
      }));
    if (bbbRows.length > 0) {
      const { error: bErr } = await admin
        .from('bingo_bango_bongo_holes')
        .insert(bbbRows);
      if (bErr) {
        await cleanupTestGame(gameId);
        throw new Error(`bingo_bango_bongo_holes insert failed: ${bErr.message}`);
      }
    }
  }

  return { id: gameId, courseId: tee.course_id, teeBoxId: tee.id };
}

export type EphemeralPlayer = { id: string; email: string };

/**
 * Oppretter `count` efemere test-brukere via service-role `auth.admin.createUser`
 * (trigger `on_auth_user_created` lager public.users-raden), og setter
 * `profile_completed_at` + `name` + `hcp_index` så de dukker opp i cup-roster og
 * kan bli `game_players`. Disse logger ALDRI inn selv — de er kun roster-
 * fyllmasse for å nå veiviserens 4-spiller-gulv (#736, del A). Caller MÅ kalle
 * `deleteEphemeralPlayers(ids)` i `afterAll`. Bruker `@torny-e2e.invalid`-domene
 * + `Date.now()`-stamp så leftovers er trivielle å spore på den delte staging-DB-en.
 */
export async function seedEphemeralPlayers(
  count: number,
  opts?: { hcpIndex?: number },
): Promise<EphemeralPlayer[]> {
  const admin = adminClient();
  const out: EphemeralPlayer[] = [];
  const stamp = Date.now();
  for (let i = 0; i < count; i++) {
    const email = `test-ephemeral-${stamp}-${i}@torny-e2e.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error || !data.user) {
      // Best-effort cleanup of any already-created users before bailing.
      await deleteEphemeralPlayers(out.map((p) => p.id));
      throw new Error(`createUser(${email}) failed: ${error?.message ?? 'no user'}`);
    }
    const id = data.user.id;

    // The on_auth_user_created trigger inserts public.users in the same txn, so
    // the row exists here. Poll briefly anyway to absorb any replication lag.
    let updated = false;
    for (let attempt = 0; attempt < 5 && !updated; attempt++) {
      const { data: rows } = await admin
        .from('users')
        .update({
          name: `TEST Ephemeral ${i}`,
          hcp_index: opts?.hcpIndex ?? 18,
          profile_completed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id');
      updated = (rows ?? []).length > 0;
      if (!updated) await new Promise((r) => setTimeout(r, 200));
    }
    if (!updated) {
      await deleteEphemeralPlayers([...out.map((p) => p.id), id]);
      throw new Error(`profile update for ${email} affected 0 rows`);
    }
    out.push({ id, email });
  }
  return out;
}

/** Sletter efemere test-brukere (cascade rydder game_players via FK). Idempotent. */
export async function deleteEphemeralPlayers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const admin = adminClient();
  for (const id of ids) {
    try {
      await admin.auth.admin.deleteUser(id);
    } catch (err) {
      console.error('[deleteEphemeralPlayers] swallow error', err);
    }
  }
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
