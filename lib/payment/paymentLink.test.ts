import { describe, it, expect } from 'vitest';
import { isPaymentUrl } from './paymentLink';

describe('isPaymentUrl (#1049)', () => {
  it('treats http(s) links as clickable URLs', () => {
    expect(isPaymentUrl('https://vipps.no/pay/abc')).toBe(true);
    expect(isPaymentUrl('http://example.com')).toBe(true);
    expect(isPaymentUrl('  https://vipps.no/x  ')).toBe(true);
    expect(isPaymentUrl('HTTPS://VIPPS.NO')).toBe(true);
  });

  it('treats a bare Vipps number as plain text (not a URL)', () => {
    expect(isPaymentUrl('12345')).toBe(false);
    expect(isPaymentUrl('Vipps 12345')).toBe(false);
  });

  it('never treats dangerous schemes as clickable (XSS guard)', () => {
    expect(isPaymentUrl('javascript:alert(1)')).toBe(false);
    expect(isPaymentUrl('data:text/html,<script>')).toBe(false);
    expect(isPaymentUrl('vipps://pay')).toBe(false);
  });

  it('is false for null / empty', () => {
    expect(isPaymentUrl(null)).toBe(false);
    expect(isPaymentUrl(undefined)).toBe(false);
    expect(isPaymentUrl('')).toBe(false);
    expect(isPaymentUrl('   ')).toBe(false);
  });
});
