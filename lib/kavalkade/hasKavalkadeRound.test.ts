import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { hasFinishedRoundInKavalkadeYear } from './hasKavalkadeRound';

/**
 * Porten foran teaseren og lenken på forsiden (#2131): har spilleren i det hele
 * tatt en ferdig runde i året?
 *
 * SQL-vinduet er en uke bredere enn året (nyttårs-slingringen i
 * `loadKavalkadeInput`), så en runde spilt 2. januar kan komme med i lesingen
 * selv om den hører til året etter. `effectiveYear` er det som avgjør, og det
 * er den grensa denne testen vokter.
 */

type Round = { scheduled_tee_off_at: string | null; ended_at: string | null };

let rows: { games: Round }[] = [];
let queryError: { message: string } | null = null;

function fakeClient(): SupabaseClient<Database> {
  const builder = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    gte: () => builder,
    lt: () => builder,
    returns: () => Promise.resolve({ data: rows, error: queryError }),
  };
  return { from: () => builder } as unknown as SupabaseClient<Database>;
}

beforeEach(() => {
  rows = [];
  queryError = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('hasFinishedRoundInKavalkadeYear', () => {
  it('er falsk for en spiller uten ferdige runder', async () => {
    await expect(hasFinishedRoundInKavalkadeYear(fakeClient(), 'u1')).resolves.toBe(
      false,
    );
  });

  it('er sann når minst én runde hører til året', async () => {
    rows = [
      { games: { scheduled_tee_off_at: '2026-07-04T08:00:00Z', ended_at: '2026-07-04T13:00:00Z' } },
    ];
    await expect(hasFinishedRoundInKavalkadeYear(fakeClient(), 'u1')).resolves.toBe(
      true,
    );
  });

  // Slingringsmonnet henter runder fra romjula året før — de teller ikke.
  it('teller ikke en runde fra fjoråret som slingringsmonnet dro med', async () => {
    rows = [
      { games: { scheduled_tee_off_at: '2025-12-28T09:00:00Z', ended_at: '2025-12-28T14:00:00Z' } },
    ];
    await expect(hasFinishedRoundInKavalkadeYear(fakeClient(), 'u1')).resolves.toBe(
      false,
    );
  });

  // Året leses på Oslo-klokka, ikke på UTC: en runde som slo ut 1. januar kl.
  // 00.30 norsk tid er 31. desember i UTC, og ville ellers havnet i fjoråret.
  it('leser året på Oslo-klokka', async () => {
    rows = [
      { games: { scheduled_tee_off_at: '2025-12-31T23:30:00Z', ended_at: '2026-01-01T04:00:00Z' } },
    ];
    await expect(hasFinishedRoundInKavalkadeYear(fakeClient(), 'u1')).resolves.toBe(
      true,
    );
    await expect(
      hasFinishedRoundInKavalkadeYear(fakeClient(), 'u1', 2025),
    ).resolves.toBe(false);
  });

  // Forsiden skal aldri feile på en teaser.
  it('svarer falskt når lesingen feiler', async () => {
    queryError = { message: 'boom' };
    await expect(hasFinishedRoundInKavalkadeYear(fakeClient(), 'u1')).resolves.toBe(
      false,
    );
  });
});
