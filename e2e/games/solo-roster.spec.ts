import { test, expect } from '@playwright/test';
import {
  envReady,
  skipReason,
  ADMIN_EMAIL,
  signInViaOtp,
  seedSoloFlightlessGame,
  cleanupTestGame,
  type ActiveGame,
} from '../_helpers/games';

/**
 * Regresjonstest for at FlightRoster(flightNumber=null) rendrer deltaker-
 * listen korrekt på Regel 3-stien (solo uten flight-tilordning) (#814).
 *
 * Bakgrunn: SoloRoster var en kopiert variant av FlightRoster. Etter #814
 * brukes FlightRoster(flightNumber=null) direkte. Spec-en verifiserer at
 * [data-testid="solo-participant-list"] vises — eneste assertion, per
 * test-disiplin (maks én render-guard, aldri norsk copy).
 */
test.describe('Solo roster (FlightRoster flightNumber=null) @gate', () => {
  test.skip(!envReady, `E2E-env mangler: ${skipReason}`);
  test.slow();

  let game: ActiveGame | null = null;

  test.beforeAll(async () => {
    game = await seedSoloFlightlessGame('roster-guard');
  });

  test.afterAll(async () => {
    if (game) await cleanupTestGame(game.id);
  });

  test('solo flightless game-home renders participant list via FlightRoster(null)', async ({
    page,
  }) => {
    expect(game).not.toBeNull();
    const gameId = game!.id;

    await page.goto(`/login?next=/games/${gameId}`);
    await signInViaOtp(page, ADMIN_EMAIL!);
    await expect(page).toHaveURL(new RegExp(`/games/${gameId}\\b`), {
      timeout: 15_000,
    });

    // data-testid is set by FlightRoster only on the Regel 3 call-site
    // (soloMode && flightNumber=null). Its presence proves the refactored
    // path renders without error.
    await expect(page.getByTestId('solo-participant-list')).toBeVisible({
      timeout: 10_000,
    });
  });
});
