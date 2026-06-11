import { describe, it, expect } from 'vitest';
import { formatHolesList } from './formatHolesList';

describe('formatHolesList', () => {
  it('returnerer tom streng for tom liste', () => {
    expect(formatHolesList([], 'hull')).toBe('');
  });

  it('enkelt hull rendres som "hull N"', () => {
    expect(formatHolesList([7], 'hull')).toBe('hull 7');
  });

  it('sammenhengende hull rendres som range med en-dash', () => {
    expect(formatHolesList([10, 11, 12, 13, 14, 15, 16, 17, 18], 'hull')).toBe('hull 10–18');
  });

  it('to sammenhengende hull rendres som range', () => {
    expect(formatHolesList([4, 5], 'hull')).toBe('hull 4–5');
  });

  it('spredte hull rendres som kommaliste', () => {
    expect(formatHolesList([4, 7, 12], 'hull')).toBe('hull 4, 7, 12');
  });

  it('blandet (range + spredte) kombineres', () => {
    expect(formatHolesList([1, 2, 3, 7, 10, 11, 15], 'hull')).toBe('hull 1–3, 7, 10–11, 15');
  });

  it('usortert input sorteres før formattering', () => {
    expect(formatHolesList([12, 4, 7], 'hull')).toBe('hull 4, 7, 12');
  });

  it('duplikater fjernes', () => {
    expect(formatHolesList([5, 5, 6, 6, 7], 'hull')).toBe('hull 5–7');
  });

  it('engelsk prefiks fungerer', () => {
    expect(formatHolesList([1, 2, 3], 'holes')).toBe('holes 1–3');
  });

  it('standard prefiks er hull (bakoverkompatibilitet)', () => {
    expect(formatHolesList([7])).toBe('hull 7');
  });
});
