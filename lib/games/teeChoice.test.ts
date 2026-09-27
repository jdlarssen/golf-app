import { describe, it, expect } from 'vitest';
import {
  ALL_TEE_GENDERS,
  profileTeeGender,
  resolveTeeGender,
  teeAvailabilityOf,
  teeChoiceToDb,
} from './teeChoice';
import type { TeeBoxRatings } from './teeRating';

// #2209: the one rule every path that puts a player in a game uses. The two
// rules it composes are covered where they live (`playerGenderDefault.test.ts`,
// `clampGenderToTee.test.ts`); what is covered here is the composition and the
// tee → availability reading, which is where a lady silently landing on the
// men's rating would hide.

const FULL_TEE: TeeBoxRatings = {
  slope_mens: 130,
  course_rating_mens: 71.2,
  par_total_mens: 72,
  slope_ladies: 128,
  course_rating_ladies: 73.1,
  par_total_ladies: 73,
  slope_juniors: 120,
  course_rating_juniors: 68.5,
  par_total_juniors: 72,
};

const MENS_ONLY_TEE: TeeBoxRatings = {
  ...FULL_TEE,
  slope_ladies: null,
  course_rating_ladies: null,
  par_total_ladies: null,
  slope_juniors: null,
  course_rating_juniors: null,
  par_total_juniors: null,
};

const MENS_ONLY = { M: true, D: false, J: false };

const LADY = { gender: 'ladies', level: 'normal' };
const JUNIOR = { gender: 'mens', level: 'junior' };
const MAN = { gender: 'mens', level: 'normal' };
const UNKNOWN = { gender: null, level: null };

describe('resolveTeeGender (#2209)', () => {
  it.each([
    ['dame', null, LADY, ALL_TEE_GENDERS, 'D'],
    ['junior', null, JUNIOR, ALL_TEE_GENDERS, 'J'],
    ['ukjent profil', null, UNKNOWN, ALL_TEE_GENDERS, 'M'],
    ['manglende profil', null, null, ALL_TEE_GENDERS, 'M'],
    ['dame på tee med bare herrerating', null, LADY, MENS_ONLY, 'M'],
    ['overstyring slår profil', 'M', LADY, ALL_TEE_GENDERS, 'M'],
    ['overstyring klemmes også', 'D', MAN, MENS_ONLY, 'M'],
  ] as const)('%s', (_label, override, profile, avail, expected) => {
    expect(resolveTeeGender(override, profile, avail)).toBe(expected);
  });
});

describe('teeAvailabilityOf (#2209)', () => {
  it('gir alle tre når ingen tee er kjent', () => {
    expect(teeAvailabilityOf(null)).toEqual(ALL_TEE_GENDERS);
    expect(teeAvailabilityOf(undefined)).toEqual(ALL_TEE_GENDERS);
  });

  it('leser en fullt ratet tee som alle tre', () => {
    expect(teeAvailabilityOf(FULL_TEE)).toEqual({ M: true, D: true, J: true });
  });

  // Same rule as the start code (`getRatingForGender`): one missing field
  // makes the whole set unusable for that category.
  it('et ufullstendig sett gir false for den kategorien', () => {
    expect(teeAvailabilityOf({ ...FULL_TEE, par_total_ladies: null })).toEqual({
      M: true,
      D: false,
      J: true,
    });
    expect(teeAvailabilityOf(MENS_ONLY_TEE)).toEqual(MENS_ONLY);
  });
});

describe('teeChoiceToDb (#2209)', () => {
  it.each([
    ['M', 'mens'],
    ['D', 'ladies'],
    ['J', 'juniors'],
  ] as const)('%s → %s', (choice, expected) => {
    expect(teeChoiceToDb(choice)).toBe(expected);
  });
});

describe('profileTeeGender (#2209)', () => {
  it.each([
    ['dame på fullt ratet tee', LADY, FULL_TEE, 'ladies'],
    ['junior på fullt ratet tee', JUNIOR, FULL_TEE, 'juniors'],
    ['herre på fullt ratet tee', MAN, FULL_TEE, 'mens'],
    ['ukjent profil', UNKNOWN, FULL_TEE, 'mens'],
    ['dame uten tee', LADY, null, 'ladies'],
    ['junior uten tee', JUNIOR, null, 'juniors'],
    ['dame på tee med bare herrerating', LADY, MENS_ONLY_TEE, 'mens'],
    ['junior på tee uten juniorrating', JUNIOR, { ...FULL_TEE, slope_juniors: null }, 'mens'],
  ] as const)('%s', (_label, profile, tee, expected) => {
    expect(profileTeeGender(profile, tee)).toBe(expected);
  });
});
