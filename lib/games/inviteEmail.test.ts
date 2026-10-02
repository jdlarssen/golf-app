import { describe, it, expect } from 'vitest';
import {
  MAX_WIZARD_INVITE_EMAILS,
  isPlausibleInviteEmail,
  normalizeInviteEmail,
  parseInviteEmailList,
} from './inviteEmail';

describe('normalizeInviteEmail / isPlausibleInviteEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeInviteEmail('  Ola@Example.COM ')).toBe('ola@example.com');
  });

  it.each([
    ['ola@example.com', true],
    ['a@', true],
    ['', false],
    ['ola.example.no', false],
  ])('%s → %s', (email, expected) => {
    expect(isPlausibleInviteEmail(email)).toBe(expected);
  });
});

describe('parseInviteEmailList', () => {
  it('normalises, drops addresses without @ and removes duplicates', () => {
    expect(
      parseInviteEmailList([' Ola@Example.com', 'ola@example.com', 'not-an-address', '', 'kari@example.com']),
    ).toEqual(['ola@example.com', 'kari@example.com']);
  });

  it('stops at ten', () => {
    const many = Array.from({ length: 14 }, (_, i) => `p${i}@example.com`);
    const out = parseInviteEmailList(many);
    expect(MAX_WIZARD_INVITE_EMAILS).toBe(10);
    expect(out).toHaveLength(10);
    expect(out[9]).toBe('p9@example.com');
  });

  it('ignores values that are not text (a File from FormData)', () => {
    expect(parseInviteEmailList([new Blob(['x']), 'a@example.com'])).toEqual(['a@example.com']);
  });
});
