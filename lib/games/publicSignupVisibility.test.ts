import { describe, it, expect } from 'vitest';
import {
  isPubliclyViewable,
  signupSourceFromParam,
  type PublicSignupVisibilityInput,
} from './publicSignupVisibility';

describe('isPubliclyViewable', () => {
  it.each<[string, PublicSignupVisibilityInput, boolean]>([
    [
      'scheduled + open + signups open',
      { status: 'scheduled', registration_mode: 'open', signups_closed_at: null },
      true,
    ],
    [
      'scheduled + manual_approval + signups open',
      { status: 'scheduled', registration_mode: 'manual_approval', signups_closed_at: null },
      true,
    ],
    [
      'invite_only is never public',
      { status: 'scheduled', registration_mode: 'invite_only', signups_closed_at: null },
      false,
    ],
    [
      'draft is never public',
      { status: 'draft', registration_mode: 'open', signups_closed_at: null },
      false,
    ],
    [
      'active is never public',
      { status: 'active', registration_mode: 'open', signups_closed_at: null },
      false,
    ],
    [
      'finished is never public',
      { status: 'finished', registration_mode: 'open', signups_closed_at: null },
      false,
    ],
    [
      'manually closed signups hide the page',
      {
        status: 'scheduled',
        registration_mode: 'open',
        signups_closed_at: '2026-07-01T10:00:00Z',
      },
      false,
    ],
  ])('%s → %s', (_label, input, expected) => {
    expect(isPubliclyViewable(input)).toBe(expected);
  });
});

describe('signupSourceFromParam', () => {
  it.each<[string, string | string[] | undefined, 'public_page' | 'poster' | null]>([
    ['public → public_page', 'public', 'public_page'],
    ['plakat → poster', 'plakat', 'poster'],
    ['unknown value is dropped', 'evil', null],
    ['empty string is dropped', '', null],
    ['undefined is dropped', undefined, null],
    ['array is dropped (no guessing on repeated params)', ['public', 'plakat'], null],
  ])('%s', (_label, input, expected) => {
    expect(signupSourceFromParam(input)).toBe(expected);
  });
});
