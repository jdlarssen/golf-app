import { describe, it, expect } from 'vitest';
import { isDisposableEmailDomain } from './disposableEmail';

/**
 * Type A pure-logic tests for the disposable-email-domain guard (#365).
 * The guard backs the self-registration abuse defence: known throwaway
 * inbox providers are rejected on /login so they can't be used to mass-
 * create accounts via their public, readable inboxes.
 */
describe('isDisposableEmailDomain', () => {
  it.each([
    'spam@mailinator.com',
    'x@guerrillamail.com',
    'foo@10minutemail.com',
    'bar@yopmail.com',
    'baz@temp-mail.org',
    'qux@getnada.com',
    'a@trashmail.com',
    'b@maildrop.cc',
    'c@sharklasers.com',
    'd@1secmail.com',
  ])('flags known disposable domain: %s', (email) => {
    expect(isDisposableEmailDomain(email)).toBe(true);
  });

  it.each([
    'jorgen@gmail.com',
    'someone@outlook.com',
    'me@hotmail.com',
    'user@icloud.com',
    'spiller@online.no',
    'kontakt@tornygolf.no',
    'ansatt@bedrift.no',
    'name@protonmail.com',
  ])('does not flag a normal provider/company domain: %s', (email) => {
    expect(isDisposableEmailDomain(email)).toBe(false);
  });

  it('is case-insensitive on the domain', () => {
    expect(isDisposableEmailDomain('Spam@MailInator.COM')).toBe(true);
  });

  it('trims surrounding whitespace before matching', () => {
    expect(isDisposableEmailDomain('  spam@mailinator.com  ')).toBe(true);
  });

  it('does an exact domain match, not a substring match', () => {
    // A real domain that merely contains a disposable name as a substring
    // must not be flagged.
    expect(isDisposableEmailDomain('user@notmailinator.com')).toBe(false);
    expect(isDisposableEmailDomain('user@mailinator.com.evil.no')).toBe(false);
  });

  it.each(['', 'no-at-sign', 'trailing@', '@leading.com', 'a@@b.com'])(
    'returns false for malformed input without throwing: %s',
    (email) => {
      expect(isDisposableEmailDomain(email)).toBe(false);
    },
  );
});
