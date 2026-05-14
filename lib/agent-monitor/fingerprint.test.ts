import { describe, it, expect } from 'vitest';
import { fingerprint } from './fingerprint';

describe('fingerprint', () => {
  it('produces a stable hash for the same input', () => {
    const a = fingerprint({ source: 'vercel', message: 'TypeError: x is undefined' });
    const b = fingerprint({ source: 'vercel', message: 'TypeError: x is undefined' });
    expect(a).toBe(b);
  });

  it('produces a different hash for different sources', () => {
    const a = fingerprint({ source: 'vercel', message: 'same' });
    const b = fingerprint({ source: 'supabase_pg', message: 'same' });
    expect(a).not.toBe(b);
  });

  it('strips timestamps, request IDs, and UUIDs before hashing', () => {
    const a = fingerprint({
      source: 'vercel',
      message: 'Error in req_abc123 at 2026-05-14T03:14:22.123Z: user 550e8400-e29b-41d4-a716-446655440000 not found',
    });
    const b = fingerprint({
      source: 'vercel',
      message: 'Error in req_xyz789 at 2026-05-14T04:55:01.000Z: user 6ba7b810-9dad-11d1-80b4-00c04fd430c8 not found',
    });
    expect(a).toBe(b);
  });

  it('strips line/column numbers in stack traces', () => {
    const a = fingerprint({
      source: 'vercel',
      message: 'at /app/lib/foo.ts:42:13\nat /app/lib/bar.ts:18:5',
    });
    const b = fingerprint({
      source: 'vercel',
      message: 'at /app/lib/foo.ts:99:8\nat /app/lib/bar.ts:22:1',
    });
    expect(a).toBe(b);
  });

  it('returns a 16-char hex string', () => {
    const fp = fingerprint({ source: 'vercel', message: 'anything' });
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });
});
