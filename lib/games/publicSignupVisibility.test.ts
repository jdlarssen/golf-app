import { describe, it, expect } from 'vitest';
import {
  isPubliclyViewable,
  isOpenForSignups,
  isOrganisedBy,
  isSignupWindowOpen,
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

describe('isSignupWindowOpen', () => {
  it.each<[string, Pick<PublicSignupVisibilityInput, 'status' | 'signups_closed_at'>, boolean]>([
    ['scheduled + signups open', { status: 'scheduled', signups_closed_at: null }, true],
    [
      'scheduled + manually closed',
      { status: 'scheduled', signups_closed_at: '2026-07-01T10:00:00Z' },
      false,
    ],
    ['draft is not open for signups', { status: 'draft', signups_closed_at: null }, false],
    ['active is not open for signups', { status: 'active', signups_closed_at: null }, false],
    ['finished is not open for signups', { status: 'finished', signups_closed_at: null }, false],
  ])('%s → %s', (_label, input, expected) => {
    expect(isSignupWindowOpen(input)).toBe(expected);
  });
});

describe('isOpenForSignups (#2269)', () => {
  const T = '2026-07-01T10:00:00Z';
  it.each<[string, PublicSignupVisibilityInput & { group_id: string | null }, boolean]>([
    ['club round, invite only: members sign up', { status: 'scheduled', registration_mode: 'invite_only', signups_closed_at: null, group_id: 'c1' }, true],
    ['club round, closed', { status: 'scheduled', registration_mode: 'open', signups_closed_at: T, group_id: 'c1' }, false],
    ['no club, invite only', { status: 'scheduled', registration_mode: 'invite_only', signups_closed_at: null, group_id: null }, false],
    ['no club, open', { status: 'scheduled', registration_mode: 'open', signups_closed_at: null, group_id: null }, true],
  ])('%s → %s', (_label, input, expected) => {
    expect(isOpenForSignups(input)).toBe(expected);
  });
});

describe('isOrganisedBy', () => {
  it.each<[string, string | null, boolean]>([
    ['the viewer organised it', 'u1', true],
    ['someone else organised it', 'u2', false],
    ['no organiser (admin-made)', null, false],
  ])('%s → %s', (_label, createdBy, expected) => {
    expect(isOrganisedBy({ created_by: createdBy }, 'u1')).toBe(expected);
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
