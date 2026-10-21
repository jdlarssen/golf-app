// native/app/src/lib/updateGuard.test.ts
// Native #2619: Type A for oppdateringsvakta — sammenligningen mot minste-
// versjonen, 10-minuttersgrensen og at en nettfeil aldri gjør noe.
//
// Vakta har én regel som alt annet henger på: den skal aldri stenge en spiller
// ute på grunn av noe annet enn et BEKREFTET svar fra serveren om at bygget er
// for gammelt. Ukjent byggnummer, uleselig svar, timeout og nettfeil er alle
// «ingen dialog».
import {
  CHECK_INTERVAL_MS,
  createUpdateCheck,
  isBelowMinimum,
  readMinBuild,
} from './updateGuard';

describe('readMinBuild', () => {
  const body = { ios: { minBuild: 7 }, android: { minVersionCode: 9 } };

  it('leser plattformens eget tall', () => {
    expect(readMinBuild(body, 'ios')).toBe(7);
    expect(readMinBuild(body, 'android')).toBe(9);
  });

  it.each([
    ['tom kropp', {}],
    ['plattformen mangler', { android: { minVersionCode: 9 } }],
    ['feil feltnavn', { ios: { minVersionCode: 7 }, android: { minBuild: 9 } }],
    ['tekst i stedet for tall', { ios: { minBuild: '7' }, android: { minVersionCode: 9 } }],
    ['negativt tall', { ios: { minBuild: -1 }, android: { minVersionCode: 9 } }],
    ['brøk', { ios: { minBuild: 1.5 }, android: { minVersionCode: 9 } }],
    ['null', { ios: null, android: { minVersionCode: 9 } }],
  ])('ukjent når %s', (_label, input) => {
    expect(readMinBuild(input as Record<string, unknown>, 'ios')).toBeNull();
  });
});

describe('isBelowMinimum', () => {
  it.each([
    ['lavere', 4, 5, true],
    ['lik', 5, 5, false],
    ['høyere', 6, 5, false],
    ['ukjent byggnummer', null, 5, false],
    ['ukjent minstenivå', 4, null, false],
  ])('%s', (_label, build, min, expected) => {
    expect(isBelowMinimum(build, min)).toBe(expected);
  });
});

describe('createUpdateCheck', () => {
  const OLD_BODY = { ios: { minBuild: 9 }, android: { minVersionCode: 9 } };
  const FINE_BODY = { ios: { minBuild: 1 }, android: { minVersionCode: 1 } };

  function rig(opts: {
    platform?: 'ios' | 'android';
    build?: number | null;
    bodies: Array<Record<string, unknown> | null | Error>;
  }) {
    let clock = 1_000_000;
    const queue = [...opts.bodies];
    const fetchBody = jest.fn(async () => {
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next ?? null;
    });
    const check = createUpdateCheck({
      platform: opts.platform ?? 'ios',
      build: opts.build === undefined ? 5 : opts.build,
      fetchBody,
      now: () => clock,
    });
    return {
      check,
      fetchBody,
      advance: (ms: number) => {
        clock += ms;
      },
    };
  }

  it('sier ja når bygget er lavere enn minstenivået for plattformen', async () => {
    const { check } = rig({ bodies: [OLD_BODY] });
    expect(await check()).toBe(true);
  });

  it('bruker android-tallet på android', async () => {
    const body = { ios: { minBuild: 1 }, android: { minVersionCode: 9 } };
    expect(await rig({ platform: 'android', bodies: [body] }).check()).toBe(true);
    expect(await rig({ platform: 'ios', bodies: [body] }).check()).toBe(false);
  });

  it('sier nei når bygget er likt eller høyere', async () => {
    const equal = { ios: { minBuild: 5 }, android: { minVersionCode: 5 } };
    expect(await rig({ bodies: [equal] }).check()).toBe(false);
    expect(await rig({ bodies: [FINE_BODY] }).check()).toBe(false);
  });

  it('spør aldri serveren når byggnummeret er ukjent (dev, Expo Go)', async () => {
    const { check, fetchBody } = rig({ build: null, bodies: [OLD_BODY] });
    expect(await check()).toBe(false);
    expect(fetchBody).not.toHaveBeenCalled();
  });

  it('sjekker høyst én gang per 10 minutter', async () => {
    const { check, fetchBody, advance } = rig({ bodies: [FINE_BODY, FINE_BODY] });
    await check();
    advance(CHECK_INTERVAL_MS - 1);
    await check();
    expect(fetchBody).toHaveBeenCalledTimes(1);

    advance(1);
    await check();
    expect(fetchBody).toHaveBeenCalledTimes(2);
  });

  it('sjekker igjen når klokka har gått bakover', async () => {
    const { check, fetchBody, advance } = rig({ bodies: [FINE_BODY, FINE_BODY] });
    await check();
    advance(-60_000);
    await check();
    expect(fetchBody).toHaveBeenCalledTimes(2);
  });

  it('starter ikke en ny sjekk mens en pågår', async () => {
    let release: (value: Record<string, unknown>) => void = () => undefined;
    const fetchBody = jest.fn(
      () =>
        new Promise<Record<string, unknown>>((resolve) => {
          release = resolve;
        }),
    );
    const check = createUpdateCheck({
      platform: 'ios',
      build: 5,
      fetchBody,
      now: () => 0,
    });
    const first = check();
    const second = check();
    release(OLD_BODY);
    expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(fetchBody).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['null (nettfeil, timeout, offline)', null],
    ['kast', new Error('boom')],
    ['uleselig kropp', { hei: 'på deg' }],
  ])('gjør ingenting ved %s', async (_label, outcome) => {
    const { check } = rig({ bodies: [outcome] });
    expect(await check()).toBe(false);
  });

  it('viser dialogen igjen ved neste forgrunn uten ny henting innen vinduet', async () => {
    const { check, fetchBody, advance } = rig({ bodies: [OLD_BODY, FINE_BODY] });
    expect(await check()).toBe(true);
    advance(60_000);
    expect(await check()).toBe(true);
    expect(fetchBody).toHaveBeenCalledTimes(1);
  });

  it('beholder «for gammel» når en senere sjekk feiler, og slipper når serveren sier ok', async () => {
    const { check, advance } = rig({ bodies: [OLD_BODY, null, FINE_BODY] });
    expect(await check()).toBe(true);
    advance(CHECK_INTERVAL_MS);
    expect(await check()).toBe(true);
    advance(CHECK_INTERVAL_MS);
    expect(await check()).toBe(false);
  });
});
