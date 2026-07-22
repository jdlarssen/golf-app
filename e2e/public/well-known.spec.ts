import { test, expect } from '@playwright/test';

/**
 * Butikk-kritiske .well-known-filer (#1277).
 *
 * assetlinks.json (Android App Links / TWA) og apple-app-site-association
 * (iOS universal links) MÅ svare 200 med `application/json`, uten
 * auth-redirect. Request-context (ingen login, ingen page) speiler hvordan
 * Google og Apple henter filene anonymt.
 *
 * @gate: rask og tilstandsløs — vokter at proxy-unntaket (#1277) ikke
 * regredierer og igjen fanger stiene i auth-redirecten.
 */
test.describe('.well-known store-kritiske filer (public, no login)', () => {
  test('assetlinks.json svarer 200 + application/json + android_app-form @gate', async ({
    request,
  }) => {
    const res = await request.get('/.well-known/assetlinks.json');

    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]?.target?.namespace).toBe('android_app');
  });

  test('apple-app-site-association svarer 200 + application/json + applinks-form @gate', async ({
    request,
  }) => {
    const res = await request.get('/.well-known/apple-app-site-association');

    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');

    const body = await res.json();
    expect(body.applinks).toBeDefined();
    expect(Array.isArray(body.applinks?.details)).toBe(true);
  });
});
