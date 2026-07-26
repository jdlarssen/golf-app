import { test, expect } from '@playwright/test';

/**
 * Ekte 404 for ugyldige bane-slugs (#1329, del 2 av #1286).
 *
 * Samme underliggende problem som spillformater
 * (`e2e/public/spillformater-status.spec.ts`): under `cacheComponents`/PPR
 * sendes den statiske shellen (status 200) FØR sidens `notFound()`, så en
 * ukjent slug ga soft-404 (HTTP 200). Bane-slugs er DB-drevne (i motsetning
 * til spillformaters TS-konstant), så guarden (`lib/courses/slugGuard.ts`)
 * henter et manifest fra `/api/public-course-slugs` — testen for «gyldig
 * slug» bruker DERFOR det samme manifestet istedenfor en hardkodet
 * bane-slug, og hopper over seg selv hvis miljøet ikke har noen offentlig
 * kvalifiserte baner ennå (tomt manifest er en gyldig tilstand, ikke en
 * regresjon).
 *
 * @gate: rask og tilstandsløs — vokter at proxy-slug-guarden (#1329) ikke
 * regredierer og igjen slipper ugyldige bane-slugs gjennom som 200.
 */
test.describe('bane-slugs: ekte 404 (public, no login)', () => {
  test('ukjent slug svarer 404 @gate', async ({ request }) => {
    const res = await request.get('/baner/denne-banen-finnes-ikke', {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(404);
  });

  test('ukjent slug svarer 404 også med /en-prefiks @gate', async ({
    request,
  }) => {
    const res = await request.get('/en/baner/denne-banen-finnes-ikke', {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(404);
  });

  test('liste-siden uten slug svarer fortsatt 200 @gate', async ({
    request,
  }) => {
    const res = await request.get('/baner');
    expect(res.status()).toBe(200);
  });

  test('gyldig slug fra manifestet svarer fortsatt 200 @gate', async ({
    request,
  }) => {
    const manifestRes = await request.get('/api/public-course-slugs');
    expect(manifestRes.status()).toBe(200);
    const { slugs } = (await manifestRes.json()) as { slugs: string[] };

    test.skip(
      slugs.length === 0,
      'Ingen offentlig kvalifiserte baner i dette miljøet ennå — ingenting å regresjonssjekke.',
    );

    const res = await request.get(`/baner/${slugs[0]}`);
    expect(res.status()).toBe(200);
  });
});
