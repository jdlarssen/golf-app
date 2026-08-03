import { test, expect } from '@playwright/test';

/**
 * Ekte 404 for ugyldige målgruppe-slugs under pilarsiden (#1267).
 *
 * Under `cacheComponents`/PPR sendes den statiske shellen (status 200) FØR
 * sidens `notFound()`, så en ukjent slug ga soft-404 (HTTP 200). En slug-guard
 * i `proxy.ts` svarer nå 404 direkte, FØR render. Request-context (ingen login,
 * ingen page) speiler hvordan en crawler henter siden anonymt.
 *
 * @gate: rask og tilstandsløs — vokter at proxy-slug-guarden ikke regredierer
 * og igjen slipper ugyldige slugs gjennom som 200. Speiler
 * e2e/public/spillformater-status.spec.ts.
 */
test.describe('målgruppe-slugs: ekte 404 (public, no login)', () => {
  test('ukjent slug svarer 404 @gate', async ({ request }) => {
    const res = await request.get('/arranger-golfturnering/tullball', {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(404);
  });

  test('ukjent slug svarer 404 også med /en-prefiks @gate', async ({
    request,
  }) => {
    const res = await request.get('/en/arranger-golfturnering/tullball', {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(404);
  });

  test('gyldig slug svarer fortsatt 200 @gate', async ({ request }) => {
    const res = await request.get('/arranger-golfturnering/firmagolf');
    expect(res.status()).toBe(200);
  });

  test('hub-en uten slug svarer fortsatt 200 @gate', async ({ request }) => {
    const res = await request.get('/arranger-golfturnering');
    expect(res.status()).toBe(200);
  });
});
