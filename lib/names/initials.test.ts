import { describe, it, expect } from 'vitest';
import { nameInitials } from './initials';

describe('nameInitials', () => {
  it('returns ? for null or undefined', () => {
    expect(nameInitials(null)).toBe('?');
    expect(nameInitials(undefined)).toBe('?');
  });

  it('returns ? for empty or whitespace-only', () => {
    expect(nameInitials('')).toBe('?');
    expect(nameInitials('   ')).toBe('?');
  });

  it('returns single uppercase initial for a one-word name', () => {
    expect(nameInitials('Karl')).toBe('K');
    expect(nameInitials('karl')).toBe('K');
  });

  it('returns first + last initial for a two-word name', () => {
    expect(nameInitials('Karl Hansen')).toBe('KH');
  });

  it('skips middle names — uses first and last only', () => {
    expect(nameInitials('Karl Erik Hansen')).toBe('KH');
    expect(nameInitials('Sondre Reitan Aar Junior')).toBe('SJ');
  });

  it('uppercases lower-case input', () => {
    expect(nameInitials('karl hansen')).toBe('KH');
  });

  it('handles Norwegian unicode characters', () => {
    expect(nameInitials('Bjørn Østby')).toBe('BØ');
    expect(nameInitials('Åge Ødegård')).toBe('ÅØ');
    expect(nameInitials('Ærlig Ådne')).toBe('ÆÅ');
  });

  it('trims leading and trailing whitespace', () => {
    expect(nameInitials('  Karl Hansen  ')).toBe('KH');
  });

  it('collapses multiple spaces', () => {
    expect(nameInitials('Karl   Hansen')).toBe('KH');
  });
});
