import { test, expect } from '@playwright/test';
import {
  adminClient,
  cleanupTestGame,
  createTestGame,
  envReady,
  PLAYER_EMAIL,
  signInViaOtp,
  skipReason,
  type CreatedGame,
} from '../_helpers/games';

/**
 * E2E for self-withdraw fra `open`-modus spill (#199 chunk 14).
 *
 * Flow: spiller melder seg på et open-spill, navigerer til /games/[id], ser
 * «Trekk deg fra spillet»-lenken, klikker den, lander på /trekk-fra-confirm,
 * bekrefter, og verifiserer at game_players-raden er borte.
 */

test.describe('Påmelding · self-withdraw (full flow) @gate', () => {
  test.skip(!envReady, `E2E-env mangler: ${skipReason}`);
  test.slow();

  let game: CreatedGame | null = null;

  test.beforeAll(async () => {
    game = await createTestGame({
      registrationMode: 'open',
      registrationType: 'solo',
      nameSuffix: 'withdraw',
    });
  });

  test.afterAll(async () => {
    if (game) {
      await cleanupTestGame(game.id);
    }
  });

  test('spiller melder seg på, trekker seg, og er ute av game_players', async ({
    page,
  }) => {
    expect(game).not.toBeNull();

    await test.step('melder seg på via open-flyten', async () => {
      await page.goto(`/signup/${game!.shortId}`);
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
      await signInViaOtp(page, PLAYER_EMAIL!);
      await expect(page).toHaveURL(
        new RegExp(`/signup/${game!.shortId}`),
        { timeout: 15_000 },
      );
      await page.getByRole('button', { name: 'Meld meg på' }).click();
      await expect(page).toHaveURL(
        new RegExp(`/games/${game!.id}\\b`),
        { timeout: 15_000 },
      );
    });

    await test.step('Trekk-deg-lenken vises på spill-siden', async () => {
      // Lenken er ankret som «Trekk deg fra spillet» (en footer-lenke i
      // pre-active-status — se app/games/[id]/(home)/page.tsx:416).
      const link = page.getByRole('link', { name: 'Trekk deg fra spillet' });
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(
        new RegExp(`/games/${game!.id}/trekk-fra`),
        { timeout: 10_000 },
      );
    });

    await test.step('bekreftelses-siden viser advarsel og confirm-knapp', async () => {
      await expect(
        page.getByRole('heading', {
          name: new RegExp(`Trekk deg fra «${game!.name}»`),
        }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Trekk meg fra spillet' })
        .click();
      // Submit-actionen redirecter til '/' ved suksess.
      await expect(page).toHaveURL(/^http:\/\/localhost:3000\/?(\?.*)?$/, {
        timeout: 15_000,
      });
    });

    await test.step('game_players-raden er slettet', async () => {
      const admin = adminClient();
      const { data: players } = await admin
        .from('game_players')
        .select('user_id, users!inner(email)')
        .eq('game_id', game!.id)
        .returns<{ user_id: string; users: { email: string } }[]>();
      const stillThere = (players ?? []).some(
        (p) => p.users.email.toLowerCase() === PLAYER_EMAIL,
      );
      expect(stillThere).toBe(false);
    });
  });
});
