import { describe, it, expect } from 'vitest';
import { shouldSendMailFallback, OFF_APP_THRESHOLD_MS } from './notify';

describe('shouldSendMailFallback', () => {
  it('returnerer true når last_seen_at er null (aldri vært i appen)', () => {
    expect(shouldSendMailFallback(null)).toBe(true);
  });

  it('returnerer true når last_seen_at er eldre enn terskel', () => {
    const oldDate = new Date(Date.now() - OFF_APP_THRESHOLD_MS - 1000);
    expect(shouldSendMailFallback(oldDate.toISOString())).toBe(true);
  });

  it('returnerer false når last_seen_at er nyere enn terskel', () => {
    const recent = new Date(Date.now() - 60 * 1000); // 1 min siden
    expect(shouldSendMailFallback(recent.toISOString())).toBe(false);
  });

  it('returnerer true når last_seen_at er ugyldig ISO', () => {
    expect(shouldSendMailFallback('not-a-date')).toBe(true);
  });
});
