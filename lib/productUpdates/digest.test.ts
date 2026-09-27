import { describe, it, expect, vi } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import { previousMonthPeriod, sendDigestForPeriod } from './digest';

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

describe('previousMonthPeriod', () => {
  it('mai-1 → forrige måned er april', () => {
    // 1. mai 2026 kl. 09:00 Europe/Oslo = 07:00 UTC
    const may1 = Date.UTC(2026, 4, 1, 7, 0, 0);
    const result = previousMonthPeriod(may1);
    expect(result.periodStart).toBe('2026-04-01');
    expect(result.periodEnd).toBe('2026-04-30');
    expect(result.periodLabel).toBe('april 2026');
  });

  it('jan-1 → forrige måned er desember året før', () => {
    // 1. januar 2027 kl. 09:00 Europe/Oslo = 08:00 UTC (CET vinter)
    const jan1 = Date.UTC(2027, 0, 1, 8, 0, 0);
    const result = previousMonthPeriod(jan1);
    expect(result.periodStart).toBe('2026-12-01');
    expect(result.periodEnd).toBe('2026-12-31');
    expect(result.periodLabel).toBe('desember 2026');
  });

  it('mars-1 → forrige måned er februar (28 dager i ikke-skuddår)', () => {
    const mar1_2026 = Date.UTC(2026, 2, 1, 8, 0, 0);
    const result = previousMonthPeriod(mar1_2026);
    expect(result.periodStart).toBe('2026-02-01');
    expect(result.periodEnd).toBe('2026-02-28');
  });

  it('mars-1 i skuddår → februar 29 dager', () => {
    // 2028 is a leap year (divisible by 4, not by 100)
    const mar1_2028 = Date.UTC(2028, 2, 1, 8, 0, 0);
    const result = previousMonthPeriod(mar1_2028);
    expect(result.periodStart).toBe('2028-02-01');
    expect(result.periodEnd).toBe('2028-02-29');
  });

  it('mid-måned → forrige hele kalendermåned (ikke rullende 30 dager)', () => {
    // 15. mai 2026 → forrige måned er april (ikke 15.apr–15.mai)
    const mid_may = Date.UTC(2026, 4, 15, 12, 0, 0);
    const result = previousMonthPeriod(mid_may);
    expect(result.periodStart).toBe('2026-04-01');
    expect(result.periodEnd).toBe('2026-04-30');
  });
});

describe('sendDigestForPeriod — feilet brukerlesing (#2227)', () => {
  it('avviser og skriver ingen revisjonsrad når mottakerlista ikke kan leses', async () => {
    adminMock = buildSupabaseMock([
      { data: null }, // ingen tidligere utsendelse for perioden
      { data: [{ id: 'pu1', title: 'Nytt', body: 'Tekst', link: null, cta_label: null }] },
      { data: null, error: { message: 'boom' } }, // users
    ]);

    await expect(
      sendDigestForPeriod({ sentByUserId: null, nowMs: Date.UTC(2026, 9, 1, 8) }),
    ).rejects.toThrow(/boom/);

    const auditInsert = adminMock.__fromCalls.find(
      (c) => c.table === 'product_update_digests' && c.method === 'insert',
    );
    expect(auditInsert).toBeUndefined();
  });
});
