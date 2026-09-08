// native/app/src/lib/teeChoice.test.ts
// Type A — den ene testen for hvilket tee-sett en spiller havner på.
//
// De to reglene helperen komponerer er alt dekket der de bor
// (`lib/games/playerGenderDefault.test.ts`, `lib/games/clampGenderToTee.test.ts`).
// Det som IKKE er dekket noe sted er sammensetningen, og det er nettopp der
// feilene ville blitt stille: en junior som får herretee, eller en overstyring
// som blir borte fordi profilen svarte først. Tee-settet fryser banehandicapet
// ved start, så en feil her er feil slag-tildeling fra første hull.
import {
  ALL_TEE_GENDERS,
  defaultTeeGender,
  resolveTeeGender,
  teeAvailability,
} from './teeChoice';

const ALL = ALL_TEE_GENDERS;
const MENS_ONLY = { M: true, D: false, J: false };

describe('teeAvailability', () => {
  it('leser de tre ratingene av teen', () => {
    expect(
      teeAvailability({ hasMens: true, hasLadies: false, hasJuniors: true }),
    ).toEqual({ M: true, D: false, J: true });
  });

  // Banesteget ligger før spillersteget, men arrangøren kan gå tilbake og
  // tømme valget. Ingen tee = ingen begrensning, som på web.
  it('gir alle tre når ingen tee er valgt', () => {
    expect(teeAvailability(null)).toEqual(ALL);
    expect(teeAvailability(undefined)).toEqual(ALL);
  });
});

describe('defaultTeeGender', () => {
  it.each([
    ['mens', 'normal', 'M'],
    ['ladies', 'normal', 'D'],
    // Junior slår kjønnet — samme regel som på nettsiden.
    ['mens', 'junior', 'J'],
    ['ladies', 'junior', 'J'],
    ['mens', 'senior', 'M'],
    ['ladies', 'senior', 'D'],
  ] as const)('gender=%s level=%s → %s', (gender, level, expected) => {
    expect(defaultTeeGender({ gender, level })).toBe(expected);
  });

  // Kandidatlista er ikke hentet ennå: din egen rad står der alene. Herre er
  // webbens fallback for en ukjent profil, og det skal ikke krasje.
  it('gir herre når profilen mangler', () => {
    expect(defaultTeeGender(null)).toBe('M');
    expect(defaultTeeGender(undefined)).toBe('M');
    expect(defaultTeeGender({ gender: null, level: null })).toBe('M');
  });

  // `gender` og `level` er rå kolonnestrenger. En verdi utenfor enumen er en
  // programfeil hos oss, ikke noe arrangøren skal møte som en krasj.
  it('leser ukjente kolonneverdier som herre og normal', () => {
    expect(defaultTeeGender({ gender: 'D', level: 'Junior' })).toBe('M');
  });
});

describe('resolveTeeGender', () => {
  it('bruker profilen når arrangøren ikke har overstyrt', () => {
    expect(resolveTeeGender(null, { gender: 'ladies', level: 'normal' }, ALL)).toBe('D');
    expect(resolveTeeGender(null, { gender: 'mens', level: 'junior' }, ALL)).toBe('J');
  });

  it('lar overstyringen slå profilen', () => {
    expect(resolveTeeGender('J', { gender: 'ladies', level: 'normal' }, ALL)).toBe('J');
    expect(resolveTeeGender('M', { gender: 'ladies', level: 'junior' }, ALL)).toBe('M');
  });

  // Kjernen i klem-ved-lesning: en spiller lagt til ETTER at teen er valgt
  // ville ellers stått med et sett teen ikke rater, med chipen deaktivert og
  // publiseringen sperret — uten vei ut.
  it('klemmer profil-defaulten til noe teen faktisk rater', () => {
    expect(resolveTeeGender(null, { gender: 'ladies', level: 'normal' }, MENS_ONLY)).toBe('M');
    expect(resolveTeeGender(null, { gender: 'mens', level: 'junior' }, MENS_ONLY)).toBe('M');
  });

  it('klemmer også en overstyring teen ikke rater', () => {
    expect(resolveTeeGender('J', null, MENS_ONLY)).toBe('M');
    expect(resolveTeeGender('M', null, { M: false, D: true, J: false })).toBe('D');
  });

  // En tee helt uten rating skal gi en verdi, ikke ingenting: payloaden må
  // bære et sett, og `teeGenderToDb` oversetter alt annet enn D/J til herre.
  it('gir fortsatt et sett når teen ikke rater noe', () => {
    expect(resolveTeeGender('D', null, { M: false, D: false, J: false })).toBe('D');
  });
});
