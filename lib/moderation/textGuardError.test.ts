import { describe, expect, it } from 'vitest';
import { textGuardError } from './textGuardError';

describe('textGuardError', () => {
  it.each([
    [{ code: 'P0001', message: 'blocked_word' }, 'blocked_word'],
    [{ code: 'P0001', message: 'text_too_long' }, 'text_too_long'],
    // expectOne wraps the message: «<context>: <message>»
    [new Error('updateProfile: blocked_word'), 'blocked_word'],
    [{ code: '23505', message: 'duplicate key' }, null],
    [null, null],
    [undefined, null],
    ['blocked_word', null],
  ])('%j → %j', (err, expected) => {
    expect(textGuardError(err)).toBe(expected);
  });
});
