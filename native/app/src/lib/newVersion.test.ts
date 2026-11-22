// native/app/src/lib/newVersion.test.ts
// Native #2975: Type A. Når stripa «Ny versjon er klar.» skal vises: tallet fra
// ruta leses riktig per plattform, sammenligningen, og at ✕ bare skjuler stripa
// for bygget den ble lukket for.
import { parseDismissedBuild, readLatestBuild, shouldShowNewVersion } from './newVersion';

describe('readLatestBuild', () => {
  const body = {
    ios: { minBuild: 1, latestBuild: 15 },
    android: { minVersionCode: 1, latestVersionCode: 16 },
  };

  it('leser latestBuild på iOS og latestVersionCode på Android', () => {
    expect(readLatestBuild(body, 'ios')).toBe(15);
    expect(readLatestBuild(body, 'android')).toBe(16);
  });

  it('gir null når feltet mangler (server fra før #2975) eller har feil form', () => {
    expect(readLatestBuild({ ios: { minBuild: 1 } }, 'ios')).toBeNull();
    expect(readLatestBuild({}, 'android')).toBeNull();
    expect(readLatestBuild({ ios: null }, 'ios')).toBeNull();
    expect(readLatestBuild({ ios: { latestBuild: '15' } }, 'ios')).toBeNull();
    expect(readLatestBuild({ ios: { latestBuild: 15.5 } }, 'ios')).toBeNull();
    expect(readLatestBuild({ ios: { latestBuild: -1 } }, 'ios')).toBeNull();
    // Feltnavnet til den andre plattformen teller ikke.
    expect(readLatestBuild({ ios: { latestVersionCode: 15 } }, 'ios')).toBeNull();
  });
});

describe('shouldShowNewVersion', () => {
  it('viser stripa når et nyere bygg er ute og ingen har lukket den', () => {
    expect(shouldShowNewVersion({ build: 14, latest: 15, dismissed: null })).toBe(true);
  });

  it('viser ingenting når bygget er det nyeste, eller nyere enn det', () => {
    expect(shouldShowNewVersion({ build: 15, latest: 15, dismissed: null })).toBe(false);
    expect(shouldShowNewVersion({ build: 16, latest: 15, dismissed: null })).toBe(false);
  });

  it('viser ingenting når et av tallene er ukjent', () => {
    expect(shouldShowNewVersion({ build: null, latest: 15, dismissed: null })).toBe(false);
    expect(shouldShowNewVersion({ build: 14, latest: null, dismissed: null })).toBe(false);
  });

  it('skjuler stripa for bygget den ble lukket for', () => {
    expect(shouldShowNewVersion({ build: 14, latest: 15, dismissed: 15 })).toBe(false);
  });

  it('viser stripa igjen når et enda nyere bygg kommer', () => {
    expect(shouldShowNewVersion({ build: 14, latest: 16, dismissed: 15 })).toBe(true);
  });

  it('holder den skjult om tallet på serveren går ned igjen', () => {
    expect(shouldShowNewVersion({ build: 13, latest: 15, dismissed: 16 })).toBe(false);
  });
});

describe('parseDismissedBuild', () => {
  it('leser et lagret byggnummer', () => {
    expect(parseDismissedBuild('15')).toBe(15);
  });

  it('gir null for ingenting og for søppel', () => {
    expect(parseDismissedBuild(null)).toBeNull();
    expect(parseDismissedBuild('')).toBeNull();
    expect(parseDismissedBuild('abc')).toBeNull();
    expect(parseDismissedBuild('0')).toBeNull();
  });
});
