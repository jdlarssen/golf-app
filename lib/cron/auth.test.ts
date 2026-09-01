// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requireCronAuth } from './auth';

/**
 * Type A. This is the gate that stands between the public internet and three
 * service-role cron routes, and it is now the ONLY copy of it (#1856) — so its
 * two rejection shapes are asserted here rather than three times over in the
 * route suites, which assert only that their handler honours the verdict.
 */

function requestWith(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/cron/whatever', {
    method: 'POST',
    headers,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.CRON_SECRET = 'test-secret';
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('requireCronAuth', () => {
  it('lar en korrekt Bearer-header passere', () => {
    const denied = requireCronAuth(
      requestWith({ authorization: 'Bearer test-secret' }),
      'cron/whatever',
    );

    expect(denied).toBeNull();
  });

  it('manglende CRON_SECRET er en deploy-feil: 500 og logget med rutas prefiks', async () => {
    delete process.env.CRON_SECRET;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const denied = requireCronAuth(
      requestWith({ authorization: 'Bearer test-secret' }),
      'cron/whatever',
    );

    expect(denied?.status).toBe(500);
    await expect(denied?.text()).resolves.toBe('CRON_SECRET not configured');
    expect(errorSpy).toHaveBeenCalledWith('[cron/whatever] CRON_SECRET not set');
  });

  it('feil hemmelighet er en caller-feil: 401, og logges IKKE (skanne-støy)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const denied = requireCronAuth(
      requestWith({ authorization: 'Bearer wrong-secret' }),
      'cron/whatever',
    );

    expect(denied?.status).toBe(401);
    await expect(denied?.text()).resolves.toBe('Unauthorized');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('ingen Authorization-header i det hele tatt → 401', () => {
    expect(requireCronAuth(requestWith(), 'cron/whatever')?.status).toBe(401);
  });

  it('den nakne hemmeligheten uten «Bearer »-prefiks holder ikke', () => {
    const denied = requireCronAuth(
      requestWith({ authorization: 'test-secret' }),
      'cron/whatever',
    );

    expect(denied?.status).toBe(401);
  });
});
