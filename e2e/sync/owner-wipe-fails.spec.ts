import { test, expect, type Page } from '@playwright/test';
import {
  envReady,
  skipReason,
  adminClient,
  ADMIN_EMAIL,
  PLAYER_EMAIL,
  signInViaOtp,
  logEgressFailures,
  seedActiveStablefordGame,
  cleanupTestGame,
  type ActiveGame,
} from '../_helpers/games';

/**
 * #1959 — the owner guard is fail-CLOSED when the owner-switch wipe throws.
 *
 * The story, on ONE browser profile (shared IndexedDB + localStorage):
 *
 *   1. A (admin) logs in, taps a stroke with the score RPC blocked → the row
 *      stays in A's Dexie queue, owner stamp = A.
 *   2. A's session disappears (cookies cleared). B (player) logs in while
 *      `IDBObjectStore.prototype.clear` throws (init script behind a flag).
 *   3. The round page shows the notice, and NO `upsert_score_if_newer` call
 *      goes out, even when a drain is provoked (focus). A and B share a
 *      flight, so a drain would not even be rejected: A's stroke would land
 *      under B's JWT. The SQL oracle checks that it did not.
 *   4. Flag off + «Prøv igjen» → notice gone, queue wiped, stamp = B, and a
 *      stroke B taps now reaches the server (the engine is running).
 *
 * Not tagged @gate: it rewires IndexedDB and runs one long serial story; the
 * unit + render tests carry the regression lock, this is the staging proof.
 */

const OWNER_KEY = 'golf-app:local-data-owner';
const CLEAR_THROWS_FLAG = 'e2e:owner-wipe-clear-throws';
const RPC_PATH = '/rest/v1/rpc/upsert_score_if_newer';
const STAGING_REF = 'snwmueecmfqqdurxedxv';

// Runs before any app script on every navigation. Only throws while the flag
// is set, so step 4 can lift it without a new context.
const CLEAR_THROWS_INIT = `
  (() => {
    const original = IDBObjectStore.prototype.clear;
    IDBObjectStore.prototype.clear = function (...args) {
      if (window.localStorage.getItem(${JSON.stringify(CLEAR_THROWS_FLAG)}) === '1') {
        throw new DOMException('e2e: clear forced to fail', 'UnknownError');
      }
      return original.apply(this, args);
    };
  })();
`;

async function queueCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('golf-app');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('syncQueue')) {
            db.close();
            resolve(0);
            return;
          }
          const req = db.transaction('syncQueue').objectStore('syncQueue').count();
          req.onsuccess = () => {
            db.close();
            resolve(req.result);
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

async function tapPlusOne(page: Page, gameId: string, hole: number): Promise<void> {
  await page.goto(`/games/${gameId}/holes/${hole}`);
  const score = page.locator('[data-testid="score-number"]').first();
  await expect(score).toBeVisible();
  const plus = page.getByRole('button', { name: '+1' }).first();
  await expect(plus).toBeEnabled();
  const before = (await score.textContent()) ?? '';
  await plus.click();
  await expect(score).not.toHaveText(before);
}

/**
 * Server rows for one hole, optionally only those entered by `enteredBy`.
 * Counted per hole, not per `user_id`: the first «+1» on the hole page is the
 * flight's first row, which is not necessarily the tapping player's own score.
 */
async function serverScoreCount(gameId: string, hole: number, enteredBy?: string) {
  let query = adminClient()
    .from('scores')
    .select('entered_by')
    .eq('game_id', gameId)
    .eq('hole_number', hole);
  if (enteredBy) query = query.eq('entered_by', enteredBy);
  const { data, error } = await query;
  if (error) throw error;
  return data?.length ?? 0;
}

test.describe('Owner guard fail-closed on a throwing switch wipe (#1959)', () => {
  test.skip(!envReady, skipReason);
  test.slow();

  let game: ActiveGame | null = null;

  test.beforeAll(async () => {
    game = await seedActiveStablefordGame('owner-wipe');
  });

  test.afterAll(async () => {
    if (game) await cleanupTestGame(game.id);
  });

  test('no drain under B while the wipe fails; retry wipes and starts the engine', async ({
    browser,
  }) => {
    const gameId = game!.id;
    const context = await browser.newContext();
    await context.addInitScript(CLEAR_THROWS_INIT);
    const page = await context.newPage();
    logEgressFailures(page);

    // Prod guard: every Supabase call from the browser must hit staging.
    const foreignSupabase: string[] = [];
    page.on('request', (req) => {
      const host = new URL(req.url()).hostname;
      if (host.endsWith('.supabase.co') && !host.startsWith(`${STAGING_REF}.`)) {
        foreignSupabase.push(host);
      }
    });

    await test.step('A taps a stroke that cannot reach the server', async () => {
      await context.route(`**${RPC_PATH}`, (route) => route.abort('internetdisconnected'));
      await page.goto(`/login?next=/games/${gameId}/holes/1`);
      await signInViaOtp(page, ADMIN_EMAIL!);
      await tapPlusOne(page, gameId, 1);

      await expect.poll(() => queueCount(page)).toBe(1);
      expect(await page.evaluate((k) => localStorage.getItem(k), OWNER_KEY)).toBe(
        game!.adminUserId,
      );
      await context.unroute(`**${RPC_PATH}`);
    });

    const rpcCallsUnderB: string[] = [];
    // Error-log oracle for B's part. Filtered: Chromium's URL-less
    // «Failed to load resource» lines (local next start 404s /_vercel/insights)
    // and the insights script's parse error — rig noise, not app errors.
    const consoleErrorsUnderB: string[] = [];

    await test.step('B logs in on the same browser while the wipe throws', async () => {
      await context.clearCookies();
      await page.evaluate((flag) => localStorage.setItem(flag, '1'), CLEAR_THROWS_FLAG);
      page.on('request', (req) => {
        if (req.url().includes(RPC_PATH)) rpcCallsUnderB.push(req.url());
      });
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (text.startsWith('Failed to load resource')) return;
        if (text.includes("Unexpected token '<'")) return;
        consoleErrorsUnderB.push(text);
      });

      await page.goto(`/login?next=/games/${gameId}`);
      await signInViaOtp(page, PLAYER_EMAIL!);
      await page.goto(`/games/${gameId}`);

      await expect(page.getByTestId('owner-wipe-failed')).toBeVisible();
      // Provoke the drain paths the engine would use, plus a hole page visit.
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await page.goto(`/games/${gameId}/holes/1`);
      await expect(page.getByTestId('owner-wipe-failed')).toBeVisible();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));

      expect(rpcCallsUnderB, 'no upsert_score_if_newer under B').toEqual([]);
      expect(await queueCount(page)).toBe(1);
      expect(await page.evaluate((k) => localStorage.getItem(k), OWNER_KEY)).toBe(
        game!.adminUserId,
      );
      expect(await serverScoreCount(gameId, 1)).toBe(0);
    });

    await test.step('Flag off + «Prøv igjen» wipes, restamps B and starts the engine', async () => {
      await page.evaluate((flag) => localStorage.removeItem(flag), CLEAR_THROWS_FLAG);
      await page.getByTestId('owner-wipe-failed').getByRole('button').click();

      await expect(page.getByTestId('owner-wipe-failed')).toHaveCount(0);
      await expect.poll(() => queueCount(page)).toBe(0);
      expect(await page.evaluate((k) => localStorage.getItem(k), OWNER_KEY)).toBe(
        game!.playerUserId,
      );
      expect(rpcCallsUnderB, 'A’s wiped stroke never went out').toEqual([]);

      await tapPlusOne(page, gameId, 2);
      await expect
        .poll(() => serverScoreCount(gameId, 2, game!.playerUserId), { timeout: 30_000 })
        .toBe(1);
      expect(await serverScoreCount(gameId, 1)).toBe(0);
    });

    expect(consoleErrorsUnderB, 'console errors under B').toEqual([]);
    expect(foreignSupabase, 'every Supabase call hits staging').toEqual([]);
    await context.close();
  });
});
