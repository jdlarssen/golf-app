import { describe, it, expect } from 'vitest';
import { formatKr } from './formatKr';

describe('formatKr', () => {
  it('formaterer hele kr med kr-suffiks', () => {
    expect(formatKr(200)).toBe('200 kr');
    expect(formatKr(0)).toBe('0 kr');
  });

  it('bruker mellomrom som tusenskille', () => {
    expect(formatKr(1400)).toBe('1 400 kr');
    expect(formatKr(1234567)).toBe('1 234 567 kr');
  });

  it('bruker ekte minus-tegn for negative beløp', () => {
    expect(formatKr(-67)).toBe('−' + '67 kr');
    expect(formatKr(-1500)).toBe('−' + '1 500 kr');
  });

  it('avrunder til hele kr og unngår «−0 kr»', () => {
    expect(formatKr(66.7)).toBe('67 kr');
    expect(formatKr(-0.4)).toBe('0 kr');
  });
});
