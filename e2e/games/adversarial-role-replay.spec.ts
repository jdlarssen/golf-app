import { createClient } from '@supabase/supabase-js';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  envReady,
  skipReason,
  adminClient,
  ADMIN_EMAIL,
  PLAYER_EMAIL,
  SUPABASE_URL,
  signInViaOtp,
  seedActiveStablefordGame,
  cleanupTestGame,
  fetchOtpForEmail,
  withFreshOtpRetry,
  seedEphemeralPlayers,
  deleteEphemeralPlayers,
  type ActiveGame,
  type EphemeralPlayer,
} from '../_helpers/games';

/**
 * Adversarial role-replay spec (#849).
 *
 * Replays key lifecycle steps as the WRONG role to catch RLS holes mid-flow:
 *
 *   Role A — anon (logged out)
 *     · Game-home / hole / scorecard / submit redirects to /login.
 *     · Direct PostgREST write to scores affects 0 rows (anon client, no session).
 *
 *   Role B — non-participant (logged in, not in the game)
 *     · Cannot read active game scores (0 rows returned by RLS).
 *     · Hostile PATCH to game_players affects 0 rows.
 *     · Hostile PATCH to scores affects 0 rows.
 *
 *   Role C — withdrawn player
 *     · After withdrawal (withdrawn_at set), write to scores affects 0 rows.
 *     · (Withdrawn player is still auth'd but excluded by RLS.)
 *
 *   Role D — non-admin creator adding an INELIGIBLE player (#921)
 *     · Hostile direct INSERT of a stranger (no friendship/co-play/club) into the
 *       creator's own game_players is rejected by the guard_game_players_invite_
 *       eligibility trigger (42501).
 *     · Same INSERT of an ELIGIBLE friend SUCCEEDS — proving the trigger matches
 *       the #906 action guard (getInviteEligibleIds) and never false-blocks.
 *
 * Assertions: HTTP redirect URL, or .select()-returns-0-rows. NEVER on Norwegian
 * copy (test discipline D). Hostile writes use supabase-js clients signed in as
 * the attacker role so we test RLS at the DB layer, not the server-action layer.
 *
 * Tagged @lifecycle (seeds multiple roles + logs in; individual tests are >15s).
 * Env-gated to staging; never touches prod.
 */

// ANON_KEY is public by design (it ships to every browser), but keep the
// literal out of the repo — read from env like SUPABASE_URL; the staging
// value lives in .env.staging.local (#1197).
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Build an unauthenticated anon supabase-js client. No session — exactly what a
 * logged-out browser would have if it tried to call the REST API directly.
 */
function anonClient() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');
  if (!ANON_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY not set');
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Build a supabase-js client signed in as `email`. We mint an OTP via the
 * admin API (no rate-limit hit), then call verifyOtp to get a real session.
 * Returns the authed client; caller should sign out when done.
 */
async function signedInClient(email: string) {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');
  if (!ANON_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY not set');
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Same supersede-race as the page-driven login (#861): a concurrent mint on
  // this email can invalidate our token before verifyOtp runs. Retry with a
  // fresh OTP on an expired/invalid error instead of throwing on the first miss.
  await withFreshOtpRetry<void>(
    () => fetchOtpForEmail(email),
    async (otp) => {
      const { error } = await client.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });
      if (!error) return { ok: true, value: undefined };
      const msg = error.message?.toLowerCase() ?? '';
      return { ok: false, retryable: msg.includes('expired') || msg.includes('invalid') };
    },
    { label: `signedInClient(${email})` },
  );
  return client;
}

/**
 * Seed a real score row (service-role) so a hostile UPDATE/READ has an EXISTING
 * row to target. Without this, a 0-row result is vacuous — it would hold even
 * with RLS wide open, simply because there was nothing to touch. With a real row
 * present, 0-rows proves RLS actually filtered/blocked it.
 */
async function seedScoreRow(
  gameId: string,
  userId: string,
  hole: number,
  strokes: number,
): Promise<void> {
  const admin = adminClient();
  const { error } = await admin.from('scores').insert({
    game_id: gameId,
    user_id: userId,
    hole_number: hole,
    strokes,
    entered_by: userId,
    client_updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`seedScoreRow failed: ${error.message}`);
}

/**
 * Non-vacuity guard: assert (via service-role, bypassing RLS) that ≥1 score row
 * exists for the game. Call this right before a hostile read/update so a passing
 * 0-row assertion can only mean "RLS blocked it", never "there was nothing here".
 */
async function assertScoresExist(gameId: string): Promise<void> {
  const admin = adminClient();
  const { data } = await admin.from('scores').select('id').eq('game_id', gameId);
  expect(
    (data ?? []).length,
    'non-vacuity: a real score row must exist before the hostile attempt',
  ).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// Role A — anon (logged out) page redirect tests (no seeds needed)
// ---------------------------------------------------------------------------

test.describe('Role A – anon redirects to /login @lifecycle', () => {
  test.skip(!envReady, `E2E-env mangler: ${skipReason}`);

  const FAKE_ID = '00000000-0000-0000-0000-000000000000';

  test('game home redirects to /login', async ({ page }) => {
    test.slow();
    await page.goto(`/games/${FAKE_ID}`);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test('hole entry redirects to /login', async ({ page }) => {
    test.slow();
    await page.goto(`/games/${FAKE_ID}/holes/1`);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test('scorecard redirects to /login', async ({ page }) => {
    test.slow();
    await page.goto(`/games/${FAKE_ID}/scorecard`);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test('submit redirects to /login', async ({ page }) => {
    test.slow();
    await page.goto(`/games/${FAKE_ID}/submit`);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// Role A — anon direct PostgREST write (no session)
// ---------------------------------------------------------------------------

test.describe('Role A – anon direct DB write blocked @lifecycle', () => {
  test.skip(!envReady, `E2E-env mangler: ${skipReason}`);

  let game: ActiveGame | null = null;

  test.beforeAll(async () => {
    game = await seedActiveStablefordGame('RoleA-write');
    // Seed a real score so the hostile UPDATE below targets an existing row.
    await seedScoreRow(game.id, game.adminUserId, 1, 4);
  });

  test.afterAll(async () => {
    if (game) await cleanupTestGame(game.id);
  });

  test('anon cannot write scores — RLS returns 0 rows', async () => {
    test.slow();
    expect(game).not.toBeNull();
    await assertScoresExist(game!.id);
    const anon = anonClient();
    const { data, error } = await anon
      .from('scores')
      .update({ strokes: 99 })
      .eq('game_id', game!.id)
      .select();
    // RLS blocks: error may be null (PostgREST silent) or set; data must be empty.
    // We assert 0 rows returned — never use Norwegian copy.
    const rowCount = (data ?? []).length;
    expect(
      rowCount,
      `anon write to scores returned ${rowCount} rows (expected 0) — RLS hole!`,
    ).toBe(0);
    // Also assert that the error is not a network/infra failure (that would mask
    // a real test infrastructure problem as a false-positive RLS result).
    if (error) {
      // "permission denied" / "row-level security" errors from PostgREST are expected.
      // Unexpected: connection refused, timeout, invalid JWT format issues.
      expect(
        error.message,
        `anon write got unexpected error: ${error.message}`,
      ).toMatch(/permission|rls|denied|security|policy|violat/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Role B — non-participant (authed, not in the game)
// ---------------------------------------------------------------------------

test.describe('Role B – non-participant blocked from active game @lifecycle', () => {
  test.skip(!envReady, `E2E-env mangler: ${skipReason}`);
  test.describe.configure({ mode: 'serial' });

  let game: ActiveGame | null = null;
  // Browser session signed in as the non-participant player
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // The non-participant is PLAYER_EMAIL — a real test user who can receive an
    // OTP (so we can drive both a browser session and a signed-in REST client),
    // but who is NOT a member of the game we seed here. We seed a minimal active
    // game with ONLY the admin as participant; PLAYER_EMAIL is the outsider.
    const admin = adminClient();
    const { data: adminUser } = await admin
      .from('users')
      .select('id')
      .ilike('email', ADMIN_EMAIL!)
      .maybeSingle<{ id: string }>();
    if (!adminUser) throw new Error(`Admin user ${ADMIN_EMAIL} not found`);

    const { data: tee } = await admin
      .from('tee_boxes')
      .select('id, course_id')
      .not('par_total_mens', 'is', null)
      .limit(1)
      .maybeSingle<{ id: string; course_id: string }>();
    if (!tee) throw new Error('No tee_box available');

    const { data: newGame, error: gameErr } = await admin
      .from('games')
      .insert({
        name: `TEST-RoleB-NonParticipant-${Date.now()}`,
        course_id: tee.course_id,
        tee_box_id: tee.id,
        game_mode: 'stableford',
        mode_config: {},
        registration_mode: 'invite_only',
        registration_type: 'solo',
        status: 'active',
        created_by: adminUser.id,
      })
      .select('id, short_id')
      .single<{ id: string; short_id: string }>();
    if (gameErr || !newGame) throw new Error(`Game insert failed: ${gameErr?.message}`);

    const acceptedAt = new Date().toISOString();
    const { error: gpErr } = await admin.from('game_players').insert({
      game_id: newGame.id,
      user_id: adminUser.id,
      flight_number: 1,
      course_handicap: 18,
      accepted_at: acceptedAt,
    });
    if (gpErr) {
      await cleanupTestGame(newGame.id);
      throw new Error(`game_players insert failed: ${gpErr.message}`);
    }

    // Seed a real score (the admin participant's) so the non-participant read +
    // scores-PATCH tests are non-vacuous: a 0-row result then proves RLS
    // isolation, not that the table was simply empty.
    await seedScoreRow(newGame.id, adminUser.id, 1, 4);

    game = {
      id: newGame.id,
      shortId: newGame.short_id,
      name: `TEST-RoleB-NonParticipant`,
      adminUserId: adminUser.id,
      playerUserId: '', // PLAYER_EMAIL is NOT in this game
    };

    // Open browser session signed in as PLAYER_EMAIL (who is NOT in the game)
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await page.goto('/login?next=/');
    await signInViaOtp(page, PLAYER_EMAIL!);
  });

  test.afterAll(async () => {
    if (game) await cleanupTestGame(game.id);
    await ctx?.close();
  });

  test('non-participant cannot read active game scores via RLS', async () => {
    test.slow();
    expect(game).not.toBeNull();
    await assertScoresExist(game!.id);
    // Use a signed-in client for PLAYER_EMAIL (who is not in this game).
    const client = await signedInClient(PLAYER_EMAIL!);
    try {
      const { data } = await client
        .from('scores')
        .select('id')
        .eq('game_id', game!.id);
      const rowCount = (data ?? []).length;
      expect(
        rowCount,
        `non-participant read ${rowCount} score rows from active game (expected 0) — RLS hole!`,
      ).toBe(0);
    } finally {
      await client.auth.signOut();
    }
  });

  test('hostile PATCH to game_players affects 0 rows', async () => {
    test.slow();
    expect(game).not.toBeNull();
    const client = await signedInClient(PLAYER_EMAIL!);
    try {
      // Try to add yourself to the game by updating a game_players row
      const { data, error } = await client
        .from('game_players')
        .update({ course_handicap: 0 })
        .eq('game_id', game!.id)
        .select();
      const rowCount = (data ?? []).length;
      expect(
        rowCount,
        `non-participant PATCH to game_players returned ${rowCount} rows (expected 0) — RLS hole!`,
      ).toBe(0);
      if (error) {
        expect(error.message).toMatch(/permission|rls|denied|security|policy|violat/i);
      }
    } finally {
      await client.auth.signOut();
    }
  });

  test('hostile PATCH to scores affects 0 rows', async () => {
    test.slow();
    expect(game).not.toBeNull();
    await assertScoresExist(game!.id);
    const client = await signedInClient(PLAYER_EMAIL!);
    try {
      const { data, error } = await client
        .from('scores')
        .update({ strokes: 1 })
        .eq('game_id', game!.id)
        .select();
      const rowCount = (data ?? []).length;
      expect(
        rowCount,
        `non-participant PATCH to scores returned ${rowCount} rows (expected 0) — RLS hole!`,
      ).toBe(0);
      if (error) {
        expect(error.message).toMatch(/permission|rls|denied|security|policy|violat/i);
      }
    } finally {
      await client.auth.signOut();
    }
  });

  test('non-participant page request: game home redirects or shows 404', async () => {
    test.slow();
    expect(game).not.toBeNull();
    // Non-participant (PLAYER_EMAIL not in game) navigates to the game home.
    // Expected: redirect to /login (RLS 401), notFound() (404 rendered), or
    // some redirect away from the game. It must NOT show the game content.
    const response = await page.goto(`/games/${game!.id}`, { waitUntil: 'commit' });
    // Either redirected to /login, or the server returned 404, or the page is
    // not at the game URL (notFound() causes a different URL/content).
    const currentUrl = page.url();
    const isOnGamePage =
      currentUrl.includes(`/games/${game!.id}`) &&
      !currentUrl.includes('/login');
    if (isOnGamePage) {
      // If we landed on the game page, assert there's no game content (it should
      // be a 404 page). We check status or a 404 indicator.
      const status = response?.status() ?? 0;
      expect(
        status,
        `non-participant accessed game page (status ${status}) — should be 404 or redirect`,
      ).toBeGreaterThanOrEqual(400);
    }
    // Otherwise we were redirected to /login (or another page) — that's fine.
  });
});

// ---------------------------------------------------------------------------
// Role C — withdrawn player cannot write scores
// ---------------------------------------------------------------------------

test.describe('Role C – withdrawn player write blocked @lifecycle', () => {
  test.skip(!envReady, `E2E-env mangler: ${skipReason}`);

  let game: ActiveGame | null = null;

  test.beforeAll(async () => {
    game = await seedActiveStablefordGame('RoleC-withdrawn');
    // Score the player legitimately entered while still active (hole 5). After
    // withdrawal the UPDATE test targets THIS row, so its 0-row result proves the
    // withdrawn_at guard blocked the write — not that there was nothing to update.
    await seedScoreRow(game.id, game.playerUserId, 5, 4);
    // Withdraw the player (service-role) in beforeAll so BOTH write attempts run
    // against an already-withdrawn participant — neither test depends on the
    // other's ordering (no implicit serial dependency).
    const admin = adminClient();
    const { data: gpRows, error: withdrawErr } = await admin
      .from('game_players')
      .update({ withdrawn_at: new Date().toISOString() })
      .eq('game_id', game.id)
      .eq('user_id', game.playerUserId)
      .select('user_id');
    if (withdrawErr) throw new Error(`service-role withdraw failed: ${withdrawErr.message}`);
    if ((gpRows ?? []).length !== 1) {
      throw new Error(`withdraw should affect exactly 1 row, got ${(gpRows ?? []).length}`);
    }
  });

  test.afterAll(async () => {
    if (game) await cleanupTestGame(game!.id);
  });

  test('withdrawn player: score INSERT affects 0 rows', async () => {
    test.slow();
    expect(game).not.toBeNull();

    // Sign in as the (now withdrawn) player and attempt a fresh score INSERT.
    const client = await signedInClient(PLAYER_EMAIL!);
    try {
      const { data, error } = await client
        .from('scores')
        .insert({
          game_id: game!.id,
          user_id: game!.playerUserId,
          hole_number: 1,
          strokes: 4,
          entered_by: game!.playerUserId,
          client_updated_at: new Date().toISOString(),
        })
        .select();
      const rowCount = (data ?? []).length;
      expect(
        rowCount,
        `withdrawn player INSERT to scores returned ${rowCount} rows (expected 0) — RLS hole!`,
      ).toBe(0);
      if (error) {
        expect(error.message).toMatch(/permission|rls|denied|security|policy|violat/i);
      }
    } finally {
      await client.auth.signOut();
    }
  });

  test('withdrawn player: score update affects 0 rows', async () => {
    test.slow();
    expect(game).not.toBeNull();
    // The hole-5 row seeded in beforeAll exists at the DB layer → non-vacuous.
    await assertScoresExist(game!.id);

    // Player was withdrawn in beforeAll. Attempt to UPDATE their existing score.
    const client = await signedInClient(PLAYER_EMAIL!);
    try {
      const { data, error } = await client
        .from('scores')
        .update({ strokes: 99 })
        .eq('game_id', game!.id)
        .eq('user_id', game!.playerUserId)
        .select();
      const rowCount = (data ?? []).length;
      expect(
        rowCount,
        `withdrawn player UPDATE to scores returned ${rowCount} rows (expected 0) — RLS hole!`,
      ).toBe(0);
      if (error) {
        expect(error.message).toMatch(/permission|rls|denied|security|policy|violat/i);
      }
    } finally {
      await client.auth.signOut();
    }
  });
});

// ---------------------------------------------------------------------------
// Role D — non-admin creator hostile INSERT into game_players (#921)
// ---------------------------------------------------------------------------
//
// #906 scoped "Inviter spillere" to friends/co-players/club members for a
// non-admin creator at the ACTION layer. #921 closes the RLS-layer half: a
// crafted direct PostgREST INSERT must be rejected by the BEFORE INSERT trigger
// guard_game_players_invite_eligibility when the recipient is ineligible — and
// must SUCCEED for an eligible (friend) recipient, proving the trigger mirrors
// getInviteEligibleIds (AGENTS.md trap #4) and never false-blocks a legit add.
//
// Setup: PLAYER_EMAIL owns a fresh DRAFT game (created_by = player, so the
// "game_players creator insert" RLS policy applies to the player's own INSERT).
// Two ephemeral users — `friend` (seeded accepted friendship → eligible) and
// `stranger` (freshly created → no friendship/co-play/club → ineligible). The
// creator is NOT a participant, so SELECT-RLS hides game_players on read-back;
// we assert on the INSERT error and verify presence/absence via the service role.
//
// The stranger-blocked vs friend-allowed pair shares the same creator, game and
// insert shape — the ONLY difference is eligibility, so it isolates the trigger
// as the differentiator (the creator-insert RLS policy permits both).
test.describe('Role D – non-admin creator invite-eligibility on game_players @lifecycle', () => {
  test.skip(!envReady, `E2E-env mangler: ${skipReason}`);
  test.describe.configure({ mode: 'serial' });

  let gameId = '';
  let playerUserId = '';
  let friend: EphemeralPlayer | null = null;
  let stranger: EphemeralPlayer | null = null;

  test.beforeAll(async () => {
    const admin = adminClient();

    const { data: playerUser } = await admin
      .from('users')
      .select('id')
      .ilike('email', PLAYER_EMAIL!)
      .maybeSingle<{ id: string }>();
    if (!playerUser) throw new Error(`Player user ${PLAYER_EMAIL} not found`);
    playerUserId = playerUser.id;

    const { data: tee } = await admin
      .from('tee_boxes')
      .select('id, course_id')
      .not('par_total_mens', 'is', null)
      .limit(1)
      .maybeSingle<{ id: string; course_id: string }>();
    if (!tee) throw new Error('No tee_box available');

    // DRAFT game OWNED BY THE NON-ADMIN PLAYER (created_by = player). group_id
    // null → eligibility reduces to friends ∪ co-players.
    const { data: game, error: gameErr } = await admin
      .from('games')
      .insert({
        name: `TEST-RoleD-InviteEligibility-${Date.now()}`,
        course_id: tee.course_id,
        tee_box_id: tee.id,
        game_mode: 'stableford',
        mode_config: {},
        registration_mode: 'invite_only',
        registration_type: 'solo',
        status: 'draft',
        created_by: playerUserId,
      })
      .select('id')
      .single<{ id: string }>();
    if (gameErr || !game) throw new Error(`Game insert failed: ${gameErr?.message}`);
    gameId = game.id;

    // Fresh ephemeral users have NO friendship/co-play/club → stranger is a
    // guaranteed INELIGIBLE recipient.
    const players = await seedEphemeralPlayers(2);
    friend = players[0];
    stranger = players[1];

    // Seed an ACCEPTED friendship player↔friend so the friend is eligible via the
    // friend branch of is_invite_eligible (mirrors connectedIdsFromRows: any
    // direction, accepted or pending). FK on_delete_cascade clears it in afterAll.
    const { error: friErr } = await admin.from('friendships').insert({
      requester_id: playerUserId,
      addressee_id: friend.id,
      status: 'accepted',
    });
    if (friErr) throw new Error(`friendship seed failed: ${friErr.message}`);
  });

  test.afterAll(async () => {
    if (gameId) await cleanupTestGame(gameId);
    const ids = [friend?.id, stranger?.id].filter(Boolean) as string[];
    await deleteEphemeralPlayers(ids); // cascade clears friendships + game_players
  });

  test('ineligible stranger: hostile INSERT is rejected by the trigger', async () => {
    test.slow();
    expect(stranger).not.toBeNull();
    const client = await signedInClient(PLAYER_EMAIL!);
    try {
      const { error } = await client.from('game_players').insert({
        game_id: gameId,
        user_id: stranger!.id,
        accepted_at: null,
      });
      // The BEFORE INSERT trigger RAISEs insufficient_privilege (42501) → PostgREST
      // surfaces an error. Assert the write was rejected (never on Norwegian copy).
      expect(
        error,
        'hostile INSERT of an ineligible user_id must be rejected by the trigger',
      ).not.toBeNull();
      if (error) {
        expect(
          error.code === '42501' ||
            /eligible|permission|denied|insufficient|policy|violat/i.test(error.message),
          `unexpected error shape: ${error.code} ${error.message}`,
        ).toBeTruthy();
      }
      // Non-vacuity: confirm via service-role that no row was inserted.
      const admin = adminClient();
      const { data: rows } = await admin
        .from('game_players')
        .select('user_id')
        .eq('game_id', gameId)
        .eq('user_id', stranger!.id);
      expect((rows ?? []).length, 'ineligible stranger must not have been added').toBe(0);
    } finally {
      await client.auth.signOut();
    }
  });

  test('eligible friend: same hostile INSERT succeeds (no false-block)', async () => {
    test.slow();
    expect(friend).not.toBeNull();
    const client = await signedInClient(PLAYER_EMAIL!);
    try {
      const { error } = await client.from('game_players').insert({
        game_id: gameId,
        user_id: friend!.id,
        accepted_at: null,
      });
      // Same creator, game and insert shape as the stranger case — only eligibility
      // differs. An eligible friend must pass the trigger AND the creator-insert RLS
      // WITH CHECK, proving the DB layer agrees with the #906 action guard (trap #4).
      expect(
        error,
        `eligible friend INSERT was rejected (${error?.code}: ${error?.message}) — trigger false-block!`,
      ).toBeNull();
      // Confirm via service-role that the friend row now exists.
      const admin = adminClient();
      const { data: rows } = await admin
        .from('game_players')
        .select('user_id')
        .eq('game_id', gameId)
        .eq('user_id', friend!.id);
      expect((rows ?? []).length, 'eligible friend should have been added').toBe(1);
    } finally {
      await client.auth.signOut();
    }
  });
});
