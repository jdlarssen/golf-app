import { describe, it, expect } from 'vitest';
import { parseSideTournamentFromFormData } from './sideTournamentPayload';
import { ALL_CATEGORY_IDS } from '@/lib/scoring/sideTournamentConfig';

/**
 * Test helper. Uses `append` (not `set`) for the disabled-categories array so a
 * hostile POST can submit one entry per selection under the same name — the
 * shape the parser must now ignore.
 */
function fd(
  entries: Record<string, string>,
  disabledCategories: string[] = [],
): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  for (const c of disabledCategories) data.append('side_disabled_categories', c);
  return data;
}

describe('parseSideTournamentFromFormData — disabledCategories alltid tom (#1139)', () => {
  it('returns empty disabledCategories when sideturneringen is off', () => {
    const result = parseSideTournamentFromFormData(
      fd({ side_tournament_enabled: 'false' }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.enabled).toBe(false);
      expect(result.payload.disabledCategories).toEqual([]);
    }
  });

  it('returns empty disabledCategories when enabled (Full pakke er eneste oppførsel)', () => {
    const result = parseSideTournamentFromFormData(
      fd({
        side_tournament_enabled: 'true',
        side_ld_count: '1',
        side_ctp_count: '1',
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.enabled).toBe(true);
      expect(result.payload.disabledCategories).toEqual([]);
    }
  });

  it('ignores any submitted side_disabled_categories (hostile-POST guard)', () => {
    // Kategori-config-UI-en er fjernet (#1139). En håndlaget POST kan fortsatt
    // sende side_disabled_categories — inkludert ugyldige verdier — men parseren
    // hardkoder tom liste, så ingen kategori kan slås av via serveren.
    const result = parseSideTournamentFromFormData(
      fd(
        {
          side_tournament_enabled: 'true',
          side_ld_count: '0',
          side_ctp_count: '0',
        },
        [...ALL_CATEGORY_IDS, 'invalid_category'],
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.disabledCategories).toEqual([]);
    }
  });

  it('combines LD/CTP counts, disabledCategories still empty', () => {
    const result = parseSideTournamentFromFormData(
      fd(
        {
          side_tournament_enabled: 'true',
          side_ld_count: '2',
          side_ctp_count: '1',
        },
        ['turkey', 'solid'],
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.enabled).toBe(true);
      expect(result.payload.ldCount).toBe(2);
      expect(result.payload.ctpCount).toBe(1);
      expect(result.payload.disabledCategories).toEqual([]);
    }
  });

  it('still rejects a bad LD count', () => {
    const result = parseSideTournamentFromFormData(
      fd({
        side_tournament_enabled: 'true',
        side_ld_count: '5',
        side_ctp_count: '0',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('bad_side_ld_count');
    }
  });
});

describe('parseSideTournamentFromFormData — hull per plass (#2283)', () => {
  const on = (extra: Record<string, string>) =>
    fd({ side_tournament_enabled: 'true', side_ld_count: '1', side_ctp_count: '2', ...extra });

  it('gives null holes when no hole field is sent (the app and older forms)', () => {
    const result = parseSideTournamentFromFormData(on({}));
    expect(result.ok && result.payload.ldHoles).toBeNull();
    expect(result.ok && result.payload.ctpHoles).toBeNull();
  });

  it('gives null holes when every field is blank', () => {
    const result = parseSideTournamentFromFormData(
      on({ side_ld_hole_1: '', side_ctp_hole_1: ' ', side_ctp_hole_2: '' }),
    );
    expect(result.ok && result.payload.ldHoles).toBeNull();
    expect(result.ok && result.payload.ctpHoles).toBeNull();
  });

  it('keeps one element per slot, null for a slot without a hole', () => {
    const result = parseSideTournamentFromFormData(
      on({ side_ld_hole_1: '9', side_ctp_hole_2: '7' }),
    );
    expect(result.ok && result.payload.ldHoles).toEqual([9]);
    expect(result.ok && result.payload.ctpHoles).toEqual([null, 7]);
  });

  it('never reads a slot past the count', () => {
    const result = parseSideTournamentFromFormData(
      on({ side_ld_hole_1: '9', side_ld_hole_2: '19' }),
    );
    expect(result.ok && result.payload.ldHoles).toEqual([9]);
  });

  it('gives null holes when the side tournament is off, whatever is sent', () => {
    const result = parseSideTournamentFromFormData(
      fd({ side_tournament_enabled: 'false', side_ctp_hole_1: '7' }),
    );
    expect(result.ok && result.payload.ctpHoles).toBeNull();
    expect(result.ok && result.payload.ldHoles).toBeNull();
  });

  it.each(['0', '19', 'x', '7.5', '-3'])('refuses hole %s', (raw) => {
    expect(parseSideTournamentFromFormData(on({ side_ld_hole_1: raw }))).toEqual({
      ok: false,
      errorCode: 'bad_side_ld_holes',
    });
    expect(parseSideTournamentFromFormData(on({ side_ctp_hole_2: raw }))).toEqual({
      ok: false,
      errorCode: 'bad_side_ctp_holes',
    });
  });

  it('refuses two slots of one category on the same hole, but allows both categories on one hole', () => {
    expect(
      parseSideTournamentFromFormData(on({ side_ctp_hole_1: '7', side_ctp_hole_2: '7' })),
    ).toEqual({ ok: false, errorCode: 'bad_side_ctp_holes' });

    const both = parseSideTournamentFromFormData(on({ side_ld_hole_1: '7', side_ctp_hole_1: '7' }));
    expect(both.ok && both.payload.ldHoles).toEqual([7]);
    expect(both.ok && both.payload.ctpHoles).toEqual([7, null]);
  });
});
