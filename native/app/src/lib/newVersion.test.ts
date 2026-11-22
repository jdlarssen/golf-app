// native/app/src/lib/newVersion.test.ts
// Native #2975: Type A. Når arket «Versjon … er klar» og påminnelsen på Profil
// skal vises: tallet, versjonen og nyhetene fra ruta leses riktig per
// plattform, sammenligningen, og at et lukket ark bare gjelder bygget det ble
// lukket for.
import {
  newVersionMode,
  parseSeenBuild,
  readLatestRelease,
  releaseName,
} from './newVersion';

describe('readLatestRelease', () => {
  const body = {
    ios: { minBuild: 1, latestBuild: 15, latestVersion: '1.2.0', notes: ['Raskere tavle', 'Ny knapp'] },
    android: { minVersionCode: 1, latestVersionCode: 16, latestVersion: '1.3.0', notes: [] },
  };

  it('leser bygg, versjon og nyheter for plattformen', () => {
    expect(readLatestRelease(body, 'ios')).toEqual({
      build: 15,
      version: '1.2.0',
      notes: ['Raskere tavle', 'Ny knapp'],
    });
    expect(readLatestRelease(body, 'android')).toEqual({ build: 16, version: '1.3.0', notes: [] });
  });

  it('gir null når byggnummeret mangler eller har feil form', () => {
    expect(readLatestRelease({ ios: { minBuild: 1 } }, 'ios')).toBeNull();
    expect(readLatestRelease({}, 'android')).toBeNull();
    expect(readLatestRelease({ ios: null }, 'ios')).toBeNull();
    expect(readLatestRelease({ ios: { latestBuild: '15' } }, 'ios')).toBeNull();
    expect(readLatestRelease({ ios: { latestBuild: 15.5 } }, 'ios')).toBeNull();
    expect(readLatestRelease({ ios: { latestBuild: -1 } }, 'ios')).toBeNull();
    // Feltnavnet til den andre plattformen teller ikke.
    expect(readLatestRelease({ ios: { latestVersionCode: 15 } }, 'ios')).toBeNull();
  });

  it('klarer seg uten versjon og nyheter, og hopper over tomme og rare linjer', () => {
    expect(readLatestRelease({ ios: { latestBuild: 15 } }, 'ios')).toEqual({
      build: 15,
      version: null,
      notes: [],
    });
    expect(
      readLatestRelease(
        { ios: { latestBuild: 15, latestVersion: '', notes: ['  Ny tavle  ', '', 7, null, '   '] } },
        'ios',
      ),
    ).toEqual({ build: 15, version: null, notes: ['Ny tavle'] });
    expect(readLatestRelease({ ios: { latestBuild: 15, notes: 'ikke en liste' } }, 'ios')?.notes).toEqual(
      [],
    );
  });
});

describe('releaseName', () => {
  it('viser versjon og bygg slik TestFlight gjør', () => {
    expect(releaseName({ build: 15, version: '1.2.0', notes: [] })).toBe('1.2.0 (15)');
  });

  it('viser bare bygget når versjonen mangler', () => {
    expect(releaseName({ build: 15, version: null, notes: [] })).toBe('15');
  });
});

describe('newVersionMode', () => {
  it('viser arket når et nyere bygg er ute og ikke er sett', () => {
    expect(newVersionMode({ build: 14, latest: 15, seen: null })).toBe('sheet');
  });

  it('viser påminnelsen når arket er sett for det bygget, til appen er oppdatert', () => {
    expect(newVersionMode({ build: 14, latest: 15, seen: 15 })).toBe('reminder');
    expect(newVersionMode({ build: 15, latest: 15, seen: 15 })).toBe('none');
  });

  it('viser arket igjen når et enda nyere bygg kommer', () => {
    expect(newVersionMode({ build: 14, latest: 16, seen: 15 })).toBe('sheet');
  });

  it('viser ingenting når bygget er det nyeste, eller nyere enn det', () => {
    expect(newVersionMode({ build: 15, latest: 15, seen: null })).toBe('none');
    expect(newVersionMode({ build: 16, latest: 15, seen: null })).toBe('none');
  });

  it('viser ingenting når et av tallene er ukjent', () => {
    expect(newVersionMode({ build: null, latest: 15, seen: null })).toBe('none');
    expect(newVersionMode({ build: 14, latest: null, seen: null })).toBe('none');
  });

  it('holder arket borte om tallet på serveren går ned igjen', () => {
    expect(newVersionMode({ build: 13, latest: 15, seen: 16 })).toBe('reminder');
  });
});

describe('parseSeenBuild', () => {
  it('leser et lagret byggnummer', () => {
    expect(parseSeenBuild('15')).toBe(15);
  });

  it('gir null for ingenting og for søppel', () => {
    expect(parseSeenBuild(null)).toBeNull();
    expect(parseSeenBuild('')).toBeNull();
    expect(parseSeenBuild('abc')).toBeNull();
    expect(parseSeenBuild('0')).toBeNull();
  });
});
