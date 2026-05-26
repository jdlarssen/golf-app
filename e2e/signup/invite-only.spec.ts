import { test, expect } from '@playwright/test';
import {
  cleanupTestGame,
  createTestGame,
  envReady,
  PLAYER_EMAIL,
  signInViaOtp,
  skipReason,
  type CreatedGame,
} from '../_helpers/games';

/**
 * E2E for `invite_only`-modus (#199 chunk 14).
 *
 * Dette er default-moduset (matcher dagens kompis-flyt). Når en logget-inn
 * bruker uten pending invitation lander på /signup/[shortId], skal
 * landingen vise «Dette spillet krever invitasjon»-melding og INGEN
 * «Meld meg på»-knapp.
 */

test.describe('Påmelding · invite_only-modus (full flow)', () => {
  test.skip(!envReady, `E2E-env mangler: ${skipReason}`);
  test.slow();

  let game: CreatedGame | null = null;

  test.beforeAll(async () => {
    game = await createTestGame({
      registrationMode: 'invite_only',
      registrationType: 'solo',
      nameSuffix: 'invite-only',
    });
  });

  test.afterAll(async () => {
    if (game) {
      await cleanupTestGame(game.id);
    }
  });

  test('invite_only viser krever-invitasjon-melding uten påmeldings-knapp', async ({
    page,
  }) => {
    expect(game).not.toBeNull();

    await page.goto(`/signup/${game!.shortId}`);
    // Bouncer til /login først.
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await signInViaOtp(page, PLAYER_EMAIL!);
    await expect(page).toHaveURL(
      new RegExp(`/signup/${game!.shortId}`),
      { timeout: 15_000 },
    );

    await expect(
      page.getByText(/Dette spillet krever invitasjon/i),
    ).toBeVisible();

    // Ingen påmeldings-knapper skal være synlige.
    await expect(
      page.getByRole('button', { name: 'Meld meg på' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Send forespørsel' }),
    ).toHaveCount(0);
  });
});
