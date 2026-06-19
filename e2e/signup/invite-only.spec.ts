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

test.describe('Påmelding · invite_only-modus (full flow) @gate', () => {
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

    // «invite_only» utan invitasjon: viser be-om-plass-containeren (data-testid
    // i stedet for norsk copy — test-disiplin D). Etter #368 er den totale
    // blindvegen erstatta med ein RegistrationForm i manual_approval-modus,
    // så «Send forespørsel»-knappen er no tilsikta til stades. Berre
    // «Meld meg på» (open-mode-knappen) skal vere fråverande.
    await expect(
      page.getByTestId('invite-only-banner'),
    ).toBeVisible();

    // «Meld meg på» (open-mode-knapp) skal ikkje visast på invite_only.
    await expect(
      page.getByRole('button', { name: 'Meld meg på' }),
    ).toHaveCount(0);
  });
});
