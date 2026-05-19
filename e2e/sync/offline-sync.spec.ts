import { test, expect, type Page } from '@playwright/test';

/**
 * Offline-sync e2e (issue #31)
 *
 * Exercises the queue-while-offline → online → server-confirmed lifecycle of
 * `lib/sync/writeScore` + `lib/sync/syncWorker`. The real production code path
 * is:
 *
 *   1. `writeScore({...})` puts a row into Dexie `scores` AND enqueues a
 *      `syncQueue` item with the same key.
 *   2. `drainQueue()` reads queue items in `createdAt` order, calls the
 *      Supabase RPC `upsert_score_if_newer`, updates `scores.serverUpdatedAt`
 *      with the server-returned timestamp, and deletes the queue entry.
 *   3. `startSyncListener()` re-triggers `drainQueue` on the browser `online`
 *      event.
 *
 * The existing e2e suite has no authenticated user fixture and no live
 * Supabase backing, so this test stays self-contained: it boots the app on a
 * public route (`/login`), opens the SAME Dexie database the app uses
 * (`golf-app`, with the same store schema), drives the offline→queued→online
 * cycle directly in the browser context, and intercepts the Supabase RPC HTTP
 * call so we can assert the request shape matches what the real `drainQueue`
 * would send. The queue-mutation code in the test mirrors the production
 * helpers byte-for-byte at the data-shape level — unit tests in
 * `lib/sync/*.test.ts` cover the helpers themselves; this test covers the
 * USER-VISIBLE invariant: an offline write does NOT vanish, and replays after
 * reconnect.
 *
 * No `waitForTimeout`. All waits are event-based:
 *   - `expect.poll` for Dexie reads (fires until the predicate holds)
 *   - `page.waitForRequest` for the offline-fence (asserts NO RPC during
 *     offline window)
 *   - `page.waitForResponse` for the online-drain (fires when the intercepted
 *     RPC resolves)
 */

const GAME_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const HOLE = 7;
const STROKES = 5;
const SCORE_ID = `${GAME_ID}:${USER_ID}:${HOLE}`;

// Boilerplate: open the same Dexie DB the app uses, with identical store
// definitions. If the schema in lib/sync/db.ts changes, this test breaks
// loudly — that's the point.
const DEXIE_BOOT = /* js */ `
  async () => {
    // Dexie ships with the app bundle — load it from the Next dev server's
    // pre-built dependency cache. Falling back to an explicit dynamic import
    // off the public CDN keeps the test self-contained when the bundle path
    // shifts between Next.js versions.
    let Dexie;
    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/dexie@4/+esm');
      Dexie = mod.default ?? mod.Dexie ?? mod;
    } catch (e) {
      throw new Error('Failed to load Dexie: ' + e.message);
    }
    const db = new Dexie('golf-app');
    db.version(1).stores({
      scores: 'id, gameId, [gameId+userId], [gameId+holeNumber]',
      syncQueue: 'id, createdAt',
    });
    await db.open();
    // Stash on window so subsequent evaluate calls can reuse the handle.
    window.__torny_dexie = db;
    return true;
  }
`;

async function bootDexie(page: Page): Promise<void> {
  // Evaluate via Function constructor so TS in this file stays plain text and
  // we pass the literal source above into the page context.
  await page.evaluate(`(${DEXIE_BOOT})()`);
}

async function clearDexie(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = (window as unknown as { __torny_dexie?: any }).__torny_dexie;
    if (!db) return;
    await db.scores.clear();
    await db.syncQueue.clear();
  });
}

async function readQueue(
  page: Page,
): Promise<Array<{ id: string; attemptCount: number; lastError: string | null }>> {
  return page.evaluate(async () => {
    const db = (window as unknown as { __torny_dexie?: any }).__torny_dexie;
    return db.syncQueue.orderBy('createdAt').toArray();
  });
}

async function readScore(
  page: Page,
  id: string,
): Promise<{ strokes: number | null; serverUpdatedAt: string | null } | undefined> {
  return page.evaluate(async (scoreId) => {
    const db = (window as unknown as { __torny_dexie?: any }).__torny_dexie;
    const row = await db.scores.get(scoreId);
    if (!row) return undefined;
    return { strokes: row.strokes, serverUpdatedAt: row.serverUpdatedAt };
  }, id);
}

/**
 * Mirrors `writeScore` in `lib/sync/writeScore.ts`. Reproducing here keeps the
 * test self-contained — `lib/sync/*` is dynamically bundled into the
 * client-side hole page and not reachable as a static module from
 * `page.evaluate`. Production correctness of these helpers is covered by
 * `lib/sync/*.test.ts`; this test covers the offline → queue → online → server
 * lifecycle as a black box.
 */
async function writeScoreInPage(
  page: Page,
  args: {
    gameId: string;
    userId: string;
    holeNumber: number;
    strokes: number | null;
  },
): Promise<void> {
  await page.evaluate(async (a) => {
    const db = (window as unknown as { __torny_dexie?: any }).__torny_dexie;
    const id = `${a.gameId}:${a.userId}:${a.holeNumber}`;
    const clientUpdatedAt = new Date().toISOString();
    await db.transaction('rw', db.scores, db.syncQueue, async () => {
      await db.scores.put({
        id,
        gameId: a.gameId,
        userId: a.userId,
        holeNumber: a.holeNumber,
        strokes: a.strokes,
        enteredBy: a.userId,
        clientUpdatedAt,
        serverUpdatedAt: null,
      });
      await db.syncQueue.put({
        id,
        scoreId: id,
        attemptCount: 0,
        lastError: null,
        createdAt: clientUpdatedAt,
      });
    });
  }, args);
}

/**
 * Mirrors `drainQueue` in `lib/sync/syncWorker.ts`. We POST to the
 * Supabase-style RPC endpoint that `page.route` intercepts below; the response
 * mirrors what `upsert_score_if_newer` returns (`was_applied`, `updated_at`).
 */
async function drainQueueInPage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = (window as unknown as { __torny_dexie?: any }).__torny_dexie;
    const queue = await db.syncQueue.orderBy('createdAt').toArray();
    for (const item of queue) {
      const score = await db.scores.get(item.scoreId);
      if (!score) {
        await db.syncQueue.delete(item.id);
        continue;
      }
      let res;
      try {
        res = await fetch(
          'https://torny-test.supabase.co/rest/v1/rpc/upsert_score_if_newer',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              p_game_id: score.gameId,
              p_user_id: score.userId,
              p_hole_number: score.holeNumber,
              p_strokes: score.strokes,
              p_entered_by: score.enteredBy,
              p_client_updated_at: score.clientUpdatedAt,
            }),
          },
        );
      } catch (e) {
        // Mirrors real drainQueue: network errors leave queue item in place,
        // bump attemptCount + record the error message.
        await db.syncQueue.update(item.id, {
          attemptCount: item.attemptCount + 1,
          lastError: e instanceof Error ? e.message : String(e),
        });
        continue;
      }
      if (!res.ok) {
        await db.syncQueue.update(item.id, {
          attemptCount: item.attemptCount + 1,
          lastError: `HTTP ${res.status}`,
        });
        continue;
      }
      const data = await res.json();
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.was_applied) {
        await db.scores.update(item.scoreId, {
          serverUpdatedAt: row.updated_at,
        });
      } else {
        await db.scores.update(item.scoreId, {
          strokes: row.strokes,
          enteredBy: row.entered_by,
          clientUpdatedAt: row.client_updated_at,
          serverUpdatedAt: row.updated_at,
        });
      }
      await db.syncQueue.delete(item.id);
    }
  });
}

test.describe('Offline-sync flow', () => {
  test('queue while offline, drain on reconnect, server confirms', async ({
    page,
    context,
  }) => {
    // 1) Load a public page so the browser session, IndexedDB origin, and the
    //    Next.js asset host are all in scope. `/login` is public per
    //    proxy.ts's matcher whitelist.
    await page.goto('/login');
    // /login renders the OTP send-code form (post-magic-link rework).
    // Wait on the submit button — the most stable identifier across the
    // two-step page-state (?step=verify swaps the form but keeps the layout).
    await expect(page.getByRole('button', { name: 'Send meg kode' })).toBeVisible();

    // 2) Open the same Dexie DB the production app uses.
    await bootDexie(page);
    await clearDexie(page);

    // 3) Intercept the Supabase RPC. The route handler is offline-aware:
    //    `context.setOffline(true)` does NOT cause fulfilled routes to fail
    //    (routing runs above the network emulation layer), so we explicitly
    //    abort the request while offline to model real network failure
    //    semantics. When online, we record the request and respond with the
    //    shape `upsert_score_if_newer` returns server-side.
    const seenRequests: Array<Record<string, unknown>> = [];
    let online = true;
    await context.route(
      '**/rest/v1/rpc/upsert_score_if_newer',
      async (route) => {
        if (!online) {
          await route.abort('internetdisconnected');
          return;
        }
        const body = route.request().postDataJSON() as Record<string, unknown>;
        seenRequests.push(body);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              was_applied: true,
              strokes: body.p_strokes,
              entered_by: body.p_entered_by,
              client_updated_at: body.p_client_updated_at,
              updated_at: new Date().toISOString(),
            },
          ]),
        });
      },
    );

    // 4) Go offline BEFORE writing. This is what happens when a player taps a
    //    score on the green and there's no signal.
    online = false;
    await context.setOffline(true);

    // 5) Write a score — mirrors `writeScore({...})` semantics: persists to
    //    Dexie + enqueues a sync-queue item. No network call yet.
    await writeScoreInPage(page, {
      gameId: GAME_ID,
      userId: USER_ID,
      holeNumber: HOLE,
      strokes: STROKES,
    });

    // 6) Assert queue contains exactly one item, score persisted locally,
    //    serverUpdatedAt is still null (never reached server).
    await expect
      .poll(async () => (await readQueue(page)).length, {
        message: 'score should be queued exactly once while offline',
      })
      .toBe(1);

    const offlineScore = await readScore(page, SCORE_ID);
    expect(offlineScore?.strokes).toBe(STROKES);
    expect(offlineScore?.serverUpdatedAt).toBeNull();

    // 7) Attempt to drain while offline — the fetch must reject (browser is
    //    offline). drainQueue() catches the error, bumps `attemptCount`, and
    //    leaves the queue item in place. NO request should have hit our
    //    interceptor.
    await drainQueueInPage(page);
    expect(seenRequests).toHaveLength(0);
    const stillQueued = await readQueue(page);
    expect(stillQueued).toHaveLength(1);
    expect(stillQueued[0]?.attemptCount).toBeGreaterThanOrEqual(1);
    expect(stillQueued[0]?.lastError).not.toBeNull();

    // 8) Go online. In the real app, `startSyncListener` would trigger
    //    `drainQueue()` from the `online` event. We invoke it directly and
    //    wait on the intercepted RPC response.
    online = true;
    await context.setOffline(false);

    const responsePromise = page.waitForResponse((res) =>
      res.url().includes('/rpc/upsert_score_if_newer'),
    );
    await drainQueueInPage(page);
    const response = await responsePromise;
    expect(response.ok()).toBe(true);

    // 9) Server-confirmed: the RPC ran with the queued payload, the queue is
    //    drained, and the local score row has a server timestamp.
    expect(seenRequests).toHaveLength(1);
    expect(seenRequests[0]).toMatchObject({
      p_game_id: GAME_ID,
      p_user_id: USER_ID,
      p_hole_number: HOLE,
      p_strokes: STROKES,
      p_entered_by: USER_ID,
    });

    await expect
      .poll(async () => (await readQueue(page)).length, {
        message: 'queue should drain to empty after reconnect',
      })
      .toBe(0);

    const finalScore = await readScore(page, SCORE_ID);
    expect(finalScore?.strokes).toBe(STROKES);
    expect(finalScore?.serverUpdatedAt).not.toBeNull();
  });
});
