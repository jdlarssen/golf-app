import { describe, expect, it } from 'vitest';
import {
  playerFirstName,
  playerName,
  playerNameWithNickname,
  playerNameWithNicknameAfter,
  playerShortName,
} from './playerName';

describe('playerName (#2813)', () => {
  it('shows the name when the player has both a name and a nickname', () => {
    expect(playerName({ name: 'Ola Nordmann', nickname: 'Kalle' })).toBe('Ola Nordmann');
  });

  it('falls back to the nickname when the name is missing', () => {
    expect(playerName({ name: null, nickname: 'Kalle' })).toBe('Kalle');
    expect(playerName({ name: '', nickname: 'Kalle' })).toBe('Kalle');
  });

  it('treats a whitespace-only name as missing', () => {
    expect(playerName({ name: '   ', nickname: 'Kalle' })).toBe('Kalle');
  });

  it('trims the name and the nickname', () => {
    expect(playerName({ name: '  Ola Nordmann  ', nickname: 'Kalle' })).toBe('Ola Nordmann');
    expect(playerName({ name: null, nickname: '  Kalle ' })).toBe('Kalle');
  });

  it('gives null when there is neither, so the caller keeps its own fallback', () => {
    expect(playerName({ name: null, nickname: null })).toBeNull();
    expect(playerName({ name: ' ', nickname: '  ' })).toBeNull();
    expect(playerName({ name: null })).toBeNull();
    expect(playerName(null)).toBeNull();
    expect(playerName(undefined)).toBeNull();
  });
});

describe('playerFirstName (#2813)', () => {
  it('shows the first name, not the nickname', () => {
    expect(playerFirstName({ name: 'Ola Nordmann', nickname: 'Kalle' })).toBe('Ola');
  });

  it('falls back to the whole nickname when the name is missing', () => {
    expect(playerFirstName({ name: null, nickname: 'Store Kalle' })).toBe('Store Kalle');
    expect(playerFirstName({ name: '  ', nickname: 'Kalle' })).toBe('Kalle');
  });

  it('gives null when there is neither', () => {
    expect(playerFirstName({ name: null, nickname: null })).toBeNull();
    expect(playerFirstName(null)).toBeNull();
  });
});

describe('playerShortName (#2813, #2286)', () => {
  it('shows the first name when no one else in the view shares it', () => {
    expect(
      playerShortName({ name: 'Ola Nordmann', nickname: 'Kalle' }, ['Kari Hansen']),
    ).toBe('Ola');
  });

  it('shows the full name when another in the view shares the first name', () => {
    expect(
      playerShortName({ name: 'Ola Nordmann', nickname: 'Kalle' }, ['Ola Hansen']),
    ).toBe('Ola Nordmann');
  });

  it('falls back to the nickname when the name is missing', () => {
    expect(playerShortName({ name: null, nickname: 'Kalle' }, ['Ola Hansen'])).toBe('Kalle');
  });

  it('gives null when there is neither', () => {
    expect(playerShortName({ name: null, nickname: null }, [])).toBeNull();
  });
});

describe('playerNameWithNickname — the board style, unchanged from formatRevealName', () => {
  it('puts the nickname between the first and last name', () => {
    expect(playerNameWithNickname('Ola Nordmann', 'Kalle')).toBe('Ola "Kalle" Nordmann');
    expect(playerNameWithNickname('Ola Erik Nordmann', 'Kalle')).toBe('Ola "Kalle" Nordmann');
  });

  it('appends it to a one-word name, and stands alone without a name', () => {
    expect(playerNameWithNickname('Ola', 'Kalle')).toBe('Ola "Kalle"');
    expect(playerNameWithNickname('', 'Kalle')).toBe('"Kalle"');
  });

  it('is just the name without a nickname', () => {
    expect(playerNameWithNickname('Ola Nordmann', null)).toBe('Ola Nordmann');
    expect(playerNameWithNickname('Ola Nordmann', '  ')).toBe('Ola Nordmann');
  });
});

describe('playerNameWithNicknameAfter — the friends and notifications style', () => {
  it('puts the nickname after the name in «»', () => {
    expect(playerNameWithNicknameAfter('Ola Nordmann', 'Kalle')).toBe('Ola Nordmann «Kalle»');
  });

  it('is just the name without a nickname', () => {
    expect(playerNameWithNicknameAfter('Ola Nordmann', null)).toBe('Ola Nordmann');
    expect(playerNameWithNicknameAfter('Ola Nordmann', undefined)).toBe('Ola Nordmann');
    expect(playerNameWithNicknameAfter('Ola Nordmann', ' ')).toBe('Ola Nordmann');
  });
});
