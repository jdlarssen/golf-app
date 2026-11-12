import { test, expect } from '@playwright/test';
import {
  adminClient,
  cleanupTestGame,
  createTestGame,
  deleteEphemeralPlayers,
  envReady,
  PLAYER_EMAIL,
  seedEphemeralPlayers,
  signInViaOtp,
  skipReason,
  type CreatedGame,
  type EphemeralPlayer,
} from '../_helpers/games';

/**
 * E2E for en full åpen runde (#2837).
 *
 * Nines har fast antall (tre spillere). Tre efemere spillere fyller runden, og
 * test-spilleren som åpner lenka får forespørselsskjemaet i stedet for
 * «Meld meg på», som bare ville feilet med «Spillet er fullt». Forespørselen
 * havner hos arrangøren som en vanlig forespørsel (`pending`).
 */

test.describe('Påmelding · full åpen runde @gate', () => {
  test.skip(!envReady, `E2E-env mangler: ${skipReason}`);
  test.slow();

  let game: CreatedGame | null = null;
  let fillers: EphemeralPlayer[] = [];

  test.beforeAll(async () => {
    game = await createTestGame({
      registrationMode: 'open',
      registrationType: 'solo',
      gameMode: 'nines',
      nameSuffix: 'open-full',
    });
    fillers = await seedEphemeralPlayers(3);
    const { error } = await adminClient()
      .from('game_players')
      .insert(
        fillers.map((p) => ({
          game_id: game!.id,
          user_id: p.id,
          accepted_at: new Date().toISOString(),
        })),
      );
    if (error) throw new Error(`fylling av runden feilet: ${error.message}`);
  });

  test.afterAll(async () => {
    if (game) await cleanupTestGame(game.id);
    await deleteEphemeralPlayers(fillers.map((p) => p.id));
  });

  test('spilleren ber om plass i stedet for å melde seg på', async ({ page }) => {
    expect(game).not.toBeNull();

    await test.step('åpner lenka og logger inn', async () => {
      await page.goto(`/signup/${game!.shortId}`);
      await expect(page.getByTestId('public-landing')).toBeVisible();
      await page.getByTestId('public-landing-join').click();
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
      await signInViaOtp(page, PLAYER_EMAIL!);
      await expect(page).toHaveURL(new RegExp(`/signup/${game!.shortId}`), {
        timeout: 15_000,
      });
    });

    await test.step('runden er full: banneret og forespørselsskjemaet', async () => {
      await expect(page.getByTestId('game-full-request')).toBeVisible();
      await expect(page.getByTestId('add-message-link')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Meld meg på' })).toHaveCount(0);
    });

    await test.step('forespørselen sendes og venter hos arrangøren', async () => {
      // Samme knapp som på en runde med godkjenning (manual-approval.spec.ts).
      await page.getByRole('button', { name: 'Send forespørsel' }).click();
      await expect(page.getByTestId('request-sent-banner')).toBeVisible({ timeout: 15_000 });

      const admin = adminClient();
      const { data: rows } = await admin
        .from('game_registration_requests')
        .select('status, users!game_registration_requests_user_id_fkey(email)')
        .eq('game_id', game!.id)
        .returns<{ status: string; users: { email: string } }[]>();
      const mine = (rows ?? []).filter((r) => r.users.email.toLowerCase() === PLAYER_EMAIL);
      expect(mine.map((r) => r.status)).toEqual(['pending']);
    });
  });
});
