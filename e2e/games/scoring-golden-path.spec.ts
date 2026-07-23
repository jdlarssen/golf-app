import { test, expect } from '@playwright/test';
import {
  envReady,
  skipReason,
  adminClient,
  ADMIN_EMAIL,
  PLAYER_EMAIL,
  signInViaOtp,
  seedActiveStablefordGame,
  cleanupTestGame,
  type ActiveGame,
} from '../_helpers/games';

/**
 * Autentisert golden-path for nordstjerne-flyten «Spille en runde» (#674):
 * spiller taster slag → leverer → admin godkjenner → leaderboard viser spilleren.
 *
 * Før dette hadde INGEN e2e den innloggede kjerne-løkka — alle andre game-spec-er
 * asserterer bare logget-ut-redirect, så en regresjon som brøt score-entry,
 * lever-overgangen eller godkjennings-gaten for en INNLOGGET spiller ville
 * passert hele suiten grønn. Env-gardet prod-DB-mønster (se `_helpers/games.ts`):
 * skipper uten service-role + seedede admin/spiller-mailer. Begge spillere ligger
 * i samme flight (1) — kreves for at admin ser spilleren på `/approve`.
 */
test.describe('Scoring golden path (solo stableford)', () => {
  test.skip(!envReady, skipReason);
  test.slow();

  let game: ActiveGame | null = null;
  let playerName = '';

  test.beforeAll(async () => {
    game = await seedActiveStablefordGame('golden');
    const admin = adminClient();
    const { data } = await admin
      .from('users')
      .select('name')
      .eq('id', game.playerUserId)
      .maybeSingle<{ name: string }>();
    playerName = data?.name ?? '';
  });

  test.afterAll(async () => {
    if (game) await cleanupTestGame(game.id);
  });

  test('player scores → submits → admin approves → leaderboard shows the player @gate', async ({
    browser,
  }) => {
    const gameId = game!.id;

    // ── Player: enter scores on two holes ─────────────────────────────────
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    // Lever-knappen viser en window.confirm («uspilte hull») — auto-aksepter.
    playerPage.on('dialog', (d) => d.accept());

    await test.step('Player signs in and enters scores on two holes', async () => {
      await playerPage.goto(`/login?next=/games/${gameId}/holes/1`);
      await signInViaOtp(playerPage, PLAYER_EMAIL!);

      // Les visningen før +1 og assert at den ENDRES — score-number viser par som
      // spøkelse i utgangspunktet, så «≠ —» ville vært tomt. Endring beviser at
      // +1 faktisk registrerte et slag.
      // #1272: vent på at score-visningen er montert (toBeVisible) og at +1-
      // knappen er interaktiv (toBeEnabled) FØR vi leser tekst / klikker. På en
      // kald-kompilert rute er hull-siden ikke øyeblikkelig klar, og et rått klikk
      // på en enda-disabled knapp var en av @gate-flakene.
      await playerPage.goto(`/games/${gameId}/holes/1`);
      const score1 = playerPage.locator('[data-testid="score-number"]').first();
      await expect(score1).toBeVisible();
      const plus1Hole1 = playerPage.getByRole('button', { name: '+1' }).first();
      await expect(plus1Hole1).toBeEnabled();
      const before1 = (await score1.textContent()) ?? '';
      await plus1Hole1.click();
      await expect(score1).not.toHaveText(before1);

      await playerPage.goto(`/games/${gameId}/holes/2`);
      const score2 = playerPage.locator('[data-testid="score-number"]').first();
      await expect(score2).toBeVisible();
      const plus1Hole2 = playerPage.getByRole('button', { name: '+1' }).first();
      await expect(plus1Hole2).toBeEnabled();
      const before2 = (await score2.textContent()) ?? '';
      await plus1Hole2.click();
      await expect(score2).not.toHaveText(before2);
    });

    await test.step('Player submits the scorecard (submitted_at set)', async () => {
      await playerPage.goto(`/games/${gameId}/submit`);
      // #1272: submit-knappen er disabled til sync-køen er drenert (score-
      // upsertene må ha landet). Rått klikk før den er enabled var den «not
      // enabled»-@gate-flaken. Romslig 30s-timeout dekker sync-drain på en
      // treg/kald staging-rute.
      const submitBtn = playerPage.getByTestId('submit-scorecard');
      await expect(submitBtn).toBeEnabled({ timeout: 30_000 });
      await submitBtn.click();
      await expect(playerPage).not.toHaveURL(/\/submit\b/, { timeout: 15_000 });

      const admin = adminClient();
      const { data } = await admin
        .from('game_players')
        .select('submitted_at')
        .eq('game_id', gameId)
        .eq('user_id', game!.playerUserId)
        .maybeSingle<{ submitted_at: string | null }>();
      expect(data?.submitted_at, 'player submitted_at set').toBeTruthy();
    });

    // ── Admin: approve the player's scorecard ─────────────────────────────
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();

    await test.step('Admin approves the submitted scorecard (approved_at set)', async () => {
      await adminPage.goto(`/login?next=/games/${gameId}/approve`);
      await signInViaOtp(adminPage, ADMIN_EMAIL!);
      await adminPage.goto(`/games/${gameId}/approve`);

      if (playerName) {
        await expect(adminPage.getByText(playerName).first()).toBeVisible();
      }
      await adminPage.getByTestId('approve-scorecard').first().click();

      const admin = adminClient();
      await expect
        .poll(
          async () => {
            const { data } = await admin
              .from('game_players')
              .select('approved_at')
              .eq('game_id', gameId)
              .eq('user_id', game!.playerUserId)
              .maybeSingle<{ approved_at: string | null }>();
            return Boolean(data?.approved_at);
          },
          { timeout: 15_000 },
        )
        .toBe(true);
    });

    await test.step('Leaderboard renders the player row', async () => {
      await adminPage.goto(`/games/${gameId}/leaderboard`);
      const board = adminPage.getByTestId('stableford-leaderboard');
      await expect(board).toBeVisible();
      if (playerName) {
        await expect(board.getByText(playerName).first()).toBeVisible();
      }
    });

    await playerCtx.close();
    await adminCtx.close();
  });
});
