import { test, expect } from '@playwright/test';
import {
  adminClient,
  ADMIN_EMAIL,
  cleanupTestGame,
  createTestGame,
  envReady,
  PLAYER_EMAIL,
  signInViaOtp,
  skipReason,
  type CreatedGame,
} from '../_helpers/games';

/**
 * E2E for `manual_approval`-modus (#199 chunk 14).
 *
 * Two-actor-flyt: test-spiller sender forespørsel med hilsen, admin
 * navigerer til `/admin/games/[id]/signups`, ser den i Venter-fanen og
 * godkjenner. Etter godkjenning skal raden flytte seg til Godkjent-fanen og
 * spilleren skal være i `game_players`.
 *
 * Vi bruker to browser-contexts (admin + invitee) — samme pattern som
 * `invitation-flow.spec.ts`. Ingen state lekker mellom dem.
 */

test.describe('Påmelding · manual_approval-modus (full flow)', () => {
  test.skip(!envReady, `E2E-env mangler: ${skipReason}`);
  test.slow();

  let game: CreatedGame | null = null;

  test.beforeAll(async () => {
    game = await createTestGame({
      registrationMode: 'manual_approval',
      registrationType: 'solo',
      nameSuffix: 'manual',
    });
  });

  test.afterAll(async () => {
    if (game) {
      await cleanupTestGame(game.id);
    }
  });

  test('spiller sender forespørsel, admin godkjenner, spiller blir lagt til', async ({
    browser,
  }) => {
    expect(game).not.toBeNull();

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();

    await test.step('spiller åpner påmeldings-siden og logger inn', async () => {
      await playerPage.goto(`/signup/${game!.shortId}`);
      await expect(playerPage).toHaveURL(/\/login/, { timeout: 10_000 });
      await signInViaOtp(playerPage, PLAYER_EMAIL!);
      await expect(playerPage).toHaveURL(
        new RegExp(`/signup/${game!.shortId}`),
        { timeout: 15_000 },
      );
    });

    const hilsen = 'Gleder meg!';

    await test.step('spiller fyller inn hilsen og sender forespørsel', async () => {
      await playerPage
        .getByLabel('Valgfri hilsen til arrangøren')
        .fill(hilsen);
      await playerPage.getByRole('button', { name: 'Send forespørsel' }).click();
      // Suksess-banner vises i stedet for redirect. Bruk data-testid (ikkje
      // norsk copy) per test-disiplin D.
      await expect(
        playerPage.getByTestId('request-sent-banner'),
      ).toBeVisible({ timeout: 15_000 });
    });

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    await test.step('admin logger inn og navigerer til påmeldinger', async () => {
      await adminPage.goto('/login');
      await signInViaOtp(adminPage, ADMIN_EMAIL!);
      await adminPage.goto(`/admin/games/${game!.id}/signups`);
      await expect(
        adminPage.getByRole('heading', { name: 'Påmeldinger' }),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step('pending-forespørselen vises med hilsen', async () => {
      // Hilsen vises som blockquote — vi matcher på selve tekst-innholdet.
      // Anførselstegnene i UI-en er guillemets («…»), så vi unngår å hard-
      // koden dem i regexen.
      await expect(adminPage.getByText(hilsen)).toBeVisible();
      await expect(
        adminPage.getByRole('button', { name: 'Godkjenn' }),
      ).toBeVisible();
    });

    await test.step('admin klikker «Godkjenn» og raden flyttes til Godkjent', async () => {
      await adminPage.getByRole('button', { name: 'Godkjenn' }).click();
      // Optimistisk skjuling i klienten fjerner raden umiddelbart. Vi
      // navigerer til Godkjent-fanen for å verifisere persistens.
      await adminPage.goto(
        `/admin/games/${game!.id}/signups?tab=approved`,
      );
      await expect(adminPage.getByText(hilsen)).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('spilleren er nå med i game_players', async () => {
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

    await playerContext.close();
    await adminContext.close();
  });
});
