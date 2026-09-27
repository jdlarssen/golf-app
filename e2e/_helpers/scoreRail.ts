import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The hole page's score rail (#2251). Scores are entered on the rail docked at
 * the bottom; the flight above it is one row per player (or team). A tap moves
 * the rail on to the next player without a score, so a spec that wants to read
 * back what it just entered reads that player's row, not the active one.
 */

/** The score number in the row the rail is entering now. */
export function activeScoreNumber(page: Page): Locator {
  return page.locator(
    '[data-testid="flight-row"][data-active="true"] [data-testid="score-number"]',
  );
}

/** The score number in one player's row («—» until a score is entered). */
export function rowScoreNumber(page: Page, playerId: string): Locator {
  return page.locator(
    `[data-testid="flight-row"][data-player-id="${playerId}"] [data-testid="score-number"]`,
  );
}

/**
 * Tap par on the rail for the active player and wait until their row shows a
 * score. Returns the player id the tap went to. The rail's window is par −1 …
 * par +3, so par is always the second button.
 */
export async function tapParOnRail(page: Page): Promise<string> {
  const activeRow = page.locator('[data-testid="flight-row"][data-active="true"]');
  await expect(activeRow).toBeVisible();
  const playerId = await activeRow.getAttribute('data-player-id');
  if (!playerId) throw new Error('the active flight row has no data-player-id');

  const par = page.getByTestId('rail-option').nth(1);
  await expect(par).toBeEnabled();
  await par.click();
  await expect(rowScoreNumber(page, playerId)).not.toHaveText('—');
  return playerId;
}
