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
 * E2E for selv-påmelding i `open`-modus (#199 chunk 14).
 *
 * Happy path: admin oppretter et TEST-spill via service-role, test-spiller
 * navigerer til `/signup/[shortId]`, klikker «Meld meg på», og lander på
 * `/games/[id]`. Vi verifiserer både UI-overgangen og at det faktisk ble
 * INSERT i `game_players` (RLS-policyen + admin-client-fallbacken bekreftes).
 *
 * Logget-ut-smoke kjører alltid og bekrefter at proxy-en redirecter til
 * `/login?next=...`. Den krever ikke service-role, så lokale utviklere uten
 * env får i det minste én ankerassertion.
 */

test.describe('Påmelding · open-modus (logged-out smoke)', () => {
  test('uautentisert bruker redirectes til /login med next-param', async ({
    page,
  }) => {
    // Vi vet ikke om denne shortId-en finnes — det er greit. Proxy redirecter
    // før page-handleren rekker å returnere notFound(). Smoke-en bekrefter
    // bare at gating funker.
    await page.goto('/signup/abcd1234');
    await expect(page).toHaveURL(
      /\/login\?next=%2Fsignup%2Fabcd1234/,
      { timeout: 10_000 },
    );
  });
});

test.describe('Påmelding · open-modus (full flow) @gate', () => {
  test.skip(!envReady, `E2E-env mangler: ${skipReason}`);
  test.slow();

  let game: CreatedGame | null = null;

  test.beforeAll(async () => {
    game = await createTestGame({
      registrationMode: 'open',
      registrationType: 'solo',
      nameSuffix: 'open',
    });
  });

  test.afterAll(async () => {
    if (game) {
      await cleanupTestGame(game.id);
    }
  });

  test('spiller melder seg på via «Meld meg på» og lander i spillet', async ({
    page,
  }) => {
    expect(game).not.toBeNull();

    await test.step('navigerer til /signup/[shortId] og logger inn', async () => {
      await page.goto(`/signup/${game!.shortId}`);
      // Proxy bouncer til /login med next-param.
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
      await signInViaOtp(page, PLAYER_EMAIL!);
      // Etter login skal vi være tilbake på påmeldings-siden.
      await expect(page).toHaveURL(
        new RegExp(`/signup/${game!.shortId}`),
        { timeout: 15_000 },
      );
    });

    await test.step('«Meld meg på»-knappen vises og kan klikkes', async () => {
      const cta = page.getByRole('button', { name: 'Meld meg på' });
      await expect(cta).toBeVisible();
      await cta.click();
      // Server-action redirecter til /games/[id] ved suksess.
      await expect(page).toHaveURL(
        new RegExp(`/games/${game!.id}\\b`),
        { timeout: 15_000 },
      );
    });

    await test.step('brukeren finnes i game_players via service-role', async () => {
      const admin = adminClient();
      const { data: players } = await admin
        .from('game_players')
        .select('user_id, users!inner(email)')
        .eq('game_id', game!.id)
        .returns<{ user_id: string; users: { email: string } }[]>();
      const found = (players ?? []).some(
        (p) => p.users.email.toLowerCase() === PLAYER_EMAIL,
      );
      expect(found).toBe(true);
    });
  });
});
