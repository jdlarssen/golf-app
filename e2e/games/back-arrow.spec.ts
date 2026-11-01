import { test, expect, type Page } from '@playwright/test';
import {
  ADMIN_EMAIL,
  PLAYER_EMAIL,
  adminClient,
  cleanupTestGame,
  envReady,
  seedActiveStablefordGame,
  seedFinishedModeGame,
  signInViaOtp,
  skipReason,
} from '../_helpers/games';

/**
 * Pila på nettet fører dit du kom fra (#2746, `docs/user-flows.md` §Tilbake).
 * Type D: bare en ekte nettleser viser at historikklista og Next-routeren spiller
 * sammen. Løkka fra #117/#121 er første test.
 *
 * Kjør også i WebKit når denne endres, med en midlertidig config: prosjektet her
 * er bare Chromium, og CI har ikke WebKit. Rader ryddes bare i CI: en lokal
 * kjøring mot staging lar dem stå til de er ført opp for rydding.
 */

const gameIds: string[] = [];

test.afterAll(async () => {
  if (!process.env.CI) return;
  for (const id of gameIds) await cleanupTestGame(id);
});

// `:visible`: Next 16 holder forrige side montert og skjult i bakgrunnen.
const arrow = (page: Page) => page.locator('a[aria-label]:visible', { hasText: /^‹$/ }).first();

/** Navigation API med det pila trenger. Uten det er pila en vanlig lenke. */
const hasHistoryList = (page: Page) =>
  page.evaluate(() => {
    const api = (window as unknown as { navigation?: { entries?: unknown; traverseTo?: unknown } }).navigation;
    return typeof api?.entries === 'function' && typeof api?.traverseTo === 'function';
  });

async function userId(email: string): Promise<string> {
  const { data } = await adminClient().from('users').select('id').ilike('email', email).single<{ id: string }>();
  return data!.id;
}

test.describe('tilbake-pila', () => {
  test.skip(!envReady, skipReason);
  test.beforeEach(({ page }) => page.setDefaultTimeout(30_000));

  test('tavla → hull-oversikt → tavla → pil gir historikken, ikke hull-oversikten (#117)', async ({ page }) => {
    const [me, other] = await Promise.all([userId(PLAYER_EMAIL!), userId(ADMIN_EMAIL!)]);
    const scores: Record<number, Record<string, number>> = {};
    for (let hole = 1; hole <= 18; hole++) scores[hole] = { [me]: 4, [other]: 5 };
    const { id } = await seedFinishedModeGame({
      nameSuffix: 'back-arrow',
      gameMode: 'stableford',
      modeConfig: { kind: 'stableford', team_size: 1 },
      players: [
        { userId: me, courseHandicap: 10 },
        { userId: other, courseHandicap: 10 },
      ],
      scoresByHole: scores,
    });
    gameIds.push(id);

    await signInViaOtp(page, PLAYER_EMAIL!);
    await page.goto('/profile/historikk');
    test.skip(!(await hasHistoryList(page)), 'Nettleseren mangler historikklista');

    // Tavla og hull-oversikten, og pila derfra går tilbake uten å legge noe til.
    await page.goto(`/games/${id}/leaderboard?from=/profile/historikk`);
    await page.goto(`/games/${id}/leaderboard/holes?from=/profile/historikk`);
    await arrow(page).click();
    await expect(page).toHaveURL(new RegExp(`/games/${id}/leaderboard(\\?|$)`));
    await arrow(page).click();
    await expect(page).toHaveURL(/\/profile\/historikk/);

    // Lista fra #117: tavla, hull-oversikt og en ny kopi av tavla oppå.
    await page.goto(`/games/${id}/leaderboard?from=/profile/historikk`);
    await page.goto(`/games/${id}/leaderboard/holes?from=/profile/historikk`);
    await page.goto(`/games/${id}/leaderboard?from=/profile/historikk`);
    await arrow(page).click();
    await expect(page).toHaveURL(/\/profile\/historikk/);
  });

  test('klientnavigasjon: pila går dit du kom fra, ikke til lenkas mål, uten å laste siden på nytt', async ({ page }) => {
    await signInViaOtp(page, PLAYER_EMAIL!);
    await page.goto('/profile');
    test.skip(!(await hasHistoryList(page)), 'Nettleseren mangler historikklista');
    await page.evaluate(() => {
      (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
    });

    // Personvern har Hjem som reserve, så Profil viser at historikken ble brukt.
    await page.locator('a[href="/legal/privacy"]:visible').first().click();
    await expect(page).toHaveURL(/\/legal\/privacy$/);
    await arrow(page).click();
    await expect(page).toHaveURL(/\/profile$/);
    const sameDocument = await page.evaluate(
      () => (window as unknown as { __sameDocument?: boolean }).__sameDocument === true,
    );
    expect(sameDocument).toBe(true);
  });

  // #121 på ny vei: reserven er en lenke, og la den til en side, ville neste pil
  // gått tilbake hit. Tavla → historikk → tavla → historikk … Pila skal klatre.
  test('kald start: to piler etter hverandre klatrer, og går ikke i ring @gate', async ({ context, page }) => {
    const game = await seedActiveStablefordGame('back-arrow-walk');
    gameIds.push(game.id);

    await signInViaOtp(page, PLAYER_EMAIL!);
    const fresh = await context.newPage();
    fresh.setDefaultTimeout(30_000);
    await fresh.goto(`/games/${game.id}/leaderboard?from=/profile/historikk`);
    await arrow(fresh).click();
    await expect(fresh).toHaveURL(/\/profile\/historikk$/);
    await arrow(fresh).click();
    await expect(fresh).toHaveURL(/\/profile$/);
  });

  test('hull 3 → hull 4 → hull 5 → pil gir spillet', async ({ page }) => {
    const game = await seedActiveStablefordGame('back-arrow');
    gameIds.push(game.id);

    await signInViaOtp(page, PLAYER_EMAIL!);
    await page.goto(`/games/${game.id}`);
    test.skip(!(await hasHistoryList(page)), 'Nettleseren mangler historikklista');
    for (const hole of [3, 4, 5]) await page.goto(`/games/${game.id}/holes/${hole}`);

    await arrow(page).click();
    await expect(page).toHaveURL(new RegExp(`/games/${game.id}(\\?|$)`));
  });

  test('hull åpnet fra Hjem: hullets pil går dit du kom fra, ikke til spillet', async ({ page }) => {
    const game = await seedActiveStablefordGame('back-arrow-home');
    gameIds.push(game.id);

    await signInViaOtp(page, PLAYER_EMAIL!);
    await page.goto('/');
    test.skip(!(await hasHistoryList(page)), 'Nettleseren mangler historikklista');
    await page.goto(`/games/${game.id}/holes/3`);

    await arrow(page).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('tavla åpnet rett fra adressefeltet: pila går til spillet', async ({ context, page }) => {
    const game = await seedActiveStablefordGame('back-arrow-cold');
    gameIds.push(game.id);

    await signInViaOtp(page, PLAYER_EMAIL!);
    const fresh = await context.newPage();
    await fresh.goto(`/games/${game.id}/leaderboard`);
    await arrow(fresh).click();
    await expect(fresh).toHaveURL(new RegExp(`/games/${game.id}(\\?|$)`));
  });
});
