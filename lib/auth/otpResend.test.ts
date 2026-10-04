import { describe, it, expect } from 'vitest';
import {
  OTP_LENGTH,
  OTP_RESEND_SECONDS,
  formatResendCountdown,
  maskSentToEmail,
  parseSentAt,
  resendWaitSeconds,
} from './otpResend';

/**
 * #2349: the login code's numbers and «Ny kode om 0:42». `sent` comes from
 * the URL (stamped by `sendCode`), so anything a person could type there has
 * to land on a sane countdown.
 */

const NOW = Date.UTC(2026, 9, 4, 10, 0, 0);
const NOW_S = NOW / 1000;

describe('parseSentAt', () => {
  it.each<[string, string | undefined, number | null]>([
    ['now', String(NOW_S), NOW],
    ['18 s ago', String(NOW_S - 18), NOW - 18_000],
    ['exactly 10 min ago', String(NOW_S - 600), NOW - 600_000],
    ['10 min and 1 s ago', String(NOW_S - 601), null],
    ['5 s ahead (clock skew)', String(NOW_S + 5), NOW + 5_000],
    ['6 s ahead', String(NOW_S + 6), null],
    ['missing', undefined, null],
    ['empty', '', null],
    ['not a number', 'abc', null],
    ['decimal', `${NOW_S}.5`, null],
    ['negative', `-${NOW_S}`, null],
    ['milliseconds instead of seconds', String(NOW), null],
  ])('%s → %s', (_label, raw, expected) => {
    expect(parseSentAt(raw, NOW)).toBe(expected);
  });
});

describe('resendWaitSeconds', () => {
  it.each<[string, number | null, number]>([
    ['just sent', NOW, OTP_RESEND_SECONDS],
    ['18 s ago', NOW - 18_000, 42],
    ['59.999 s ago', NOW - 59_999, 1],
    ['60 s ago', NOW - 60_000, 0],
    ['10 min ago', NOW - 600_000, 0],
    ['a clock ahead never goes over the cap', NOW + 5_000, OTP_RESEND_SECONDS],
    ['no sent time', null, 0],
  ])('%s → %i', (_label, sentAt, expected) => {
    expect(resendWaitSeconds(sentAt, NOW)).toBe(expected);
  });
});

describe('formatResendCountdown', () => {
  it.each<[number, string]>([
    [60, '1:00'],
    [42, '0:42'],
    [5, '0:05'],
    [0, '0:00'],
  ])('%i → «%s»', (seconds, text) => {
    expect(formatResendCountdown(seconds)).toBe(text);
  });
});

describe('maskSentToEmail', () => {
  it.each<[string, string]>([
    ['kjell@example.test', 'k••••@example.test'],
    ['ola.nordmann@example.com', 'o•••••••••••@example.com'],
    ['a@example.test', 'a@example.test'],
    ['ikke-en-adresse', 'ikke-en-adresse'],
    ['', ''],
  ])('«%s» → «%s»', (email, shown) => {
    expect(maskSentToEmail(email)).toBe(shown);
  });
});

it('the code has eight digits, as Supabase sends it', () => {
  expect(OTP_LENGTH).toBe(8);
});
