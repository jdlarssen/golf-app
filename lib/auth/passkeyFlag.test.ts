import { describe, it, expect } from 'vitest';
import {
  parsePasskeyFlag,
  resolvePasskeyAccess,
  type PasskeyAccess,
} from './passkeyFlag';

describe('parsePasskeyFlag', () => {
  it.each([
    ['on', 'on'],
    ['admin', 'admin'],
    ['off', 'off'],
  ] as const)('maps %s to %s', (raw, expected) => {
    expect(parsePasskeyFlag(raw)).toBe(expected);
  });

  it.each([undefined, null, '', 'true', 'ON', 'Admin', 'yes', 'enabled'])(
    'falls back to off for unrecognised value %s',
    (raw) => {
      expect(parsePasskeyFlag(raw)).toBe('off');
    },
  );
});

describe('resolvePasskeyAccess', () => {
  it.each<[string | undefined | null, boolean, PasskeyAccess]>([
    // off: nothing, regardless of role
    ['off', true, { canEnroll: false, showLoginButton: false }],
    ['off', false, { canEnroll: false, showLoginButton: false }],
    [undefined, true, { canEnroll: false, showLoginButton: false }],
    ['garbage', true, { canEnroll: false, showLoginButton: false }],
    // admin phase: only admins may enroll, but the login button shows to all
    ['admin', true, { canEnroll: true, showLoginButton: true }],
    ['admin', false, { canEnroll: false, showLoginButton: true }],
    // on: everyone
    ['on', true, { canEnroll: true, showLoginButton: true }],
    ['on', false, { canEnroll: true, showLoginButton: true }],
  ])('flag=%s isAdmin=%s', (raw, isAdmin, expected) => {
    expect(resolvePasskeyAccess(raw, isAdmin)).toEqual(expected);
  });
});
