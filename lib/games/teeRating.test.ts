import { describe, it, expect } from 'vitest';
import { getRatingForGender, type TeeBoxRatings } from './teeRating';

const fullTee: TeeBoxRatings = {
  slope_mens: 122,
  course_rating_mens: 70.1,
  par_total_mens: 72,
  slope_ladies: 132,
  course_rating_ladies: 71.5,
  par_total_ladies: 72,
  slope_juniors: null,
  course_rating_juniors: null,
  par_total_juniors: null,
};

const partialTee: TeeBoxRatings = {
  slope_mens: 122,
  course_rating_mens: 70.1,
  par_total_mens: null,
  slope_ladies: null,
  course_rating_ladies: null,
  par_total_ladies: null,
  slope_juniors: null,
  course_rating_juniors: null,
  par_total_juniors: null,
};

describe('getRatingForGender', () => {
  it('returns full rating when all three values are present', () => {
    expect(getRatingForGender(fullTee, 'mens')).toEqual({
      slope: 122,
      courseRating: 70.1,
      par: 72,
    });
  });

  it('returns null when any of slope/cr/par is missing', () => {
    expect(getRatingForGender(partialTee, 'mens')).toBe(null);
  });

  it('returns null when gender rating-set is entirely empty', () => {
    expect(getRatingForGender(fullTee, 'juniors')).toBe(null);
  });

  it('returns ladies rating when requested', () => {
    expect(getRatingForGender(fullTee, 'ladies')).toEqual({
      slope: 132,
      courseRating: 71.5,
      par: 72,
    });
  });
});
