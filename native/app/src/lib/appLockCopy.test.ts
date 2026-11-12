// #2841: navnet på låsen følger telefonen, og undertekstene (Type A).
import { APP_LOCK_TEXT, appLockLabel, appLockMethodName, appLockSublabel } from './appLockCopy';

const FINGERPRINT = 1;
const FACIAL_RECOGNITION = 2;
const IRIS = 3;

describe('appLockLabel', () => {
  it.each([
    ['iPhone med ansikt', [FACIAL_RECOGNITION], 'ios', 'Lås med Face ID'],
    ['iPhone med finger', [FINGERPRINT], 'ios', 'Lås med Touch ID'],
    ['Android med finger', [FINGERPRINT], 'android', 'Lås med fingeravtrykk'],
    ['Android med bare ansikt', [FACIAL_RECOGNITION], 'android', 'Lås appen'],
    ['Android med finger og ansikt', [FACIAL_RECOGNITION, FINGERPRINT], 'android', 'Lås med fingeravtrykk'],
    ['Android med bare iris', [IRIS], 'android', 'Lås appen'],
    ['ingenting', [], 'ios', 'Lås appen'],
  ])('%s gir «%s»', (_name, types, os, expected) => {
    expect(appLockLabel(types, os)).toBe(expected);
  });
});

describe('appLockMethodName', () => {
  it('er null når telefonen ikke har ansikt eller finger', () => {
    expect(appLockMethodName([IRIS], 'ios')).toBeNull();
    expect(appLockMethodName([], 'android')).toBeNull();
  });
});

describe('appLockSublabel', () => {
  it('sier når appen spør, når metoden er klar', () => {
    expect(appLockSublabel([FACIAL_RECOGNITION], 'ios', { enrolled: true, on: false })).toBe(
      APP_LOCK_TEXT.subtitle,
    );
    expect(appLockSublabel([FACIAL_RECOGNITION], 'ios', { enrolled: true, on: true })).toBe(
      'Appen spør når den åpnes',
    );
  });

  it('ber spilleren slå på metoden først når ingenting er registrert', () => {
    expect(appLockSublabel([FACIAL_RECOGNITION], 'ios', { enrolled: false, on: false })).toBe(
      'Slå på Face ID i innstillingene til telefonen først',
    );
    expect(appLockSublabel([FINGERPRINT], 'android', { enrolled: false, on: false })).toBe(
      'Slå på fingeravtrykk i innstillingene til telefonen først',
    );
    expect(appLockSublabel([IRIS], 'android', { enrolled: false, on: false })).toBe(
      'Slå på ansikt eller fingeravtrykk i innstillingene til telefonen først',
    );
  });

  it('sier at låsen ikke virker når den er på og ingenting er registrert lenger', () => {
    expect(appLockSublabel([FACIAL_RECOGNITION], 'ios', { enrolled: false, on: true })).toBe(
      'Virker ikke før du har registrert Face ID i innstillingene til telefonen',
    );
  });
});
