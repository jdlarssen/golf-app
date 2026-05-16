import { describe, it, expect } from 'vitest';
import { parseSideTournamentFromFormData } from './sideTournamentPayload';
import { ALL_CATEGORY_IDS } from '@/lib/scoring/sideTournamentConfig';

/**
 * Test helper. Mirrors `fd` in `gamePayload.test.ts` but uses `append`
 * (not `set`) for the disabled-categories array, since checkbox arrays
 * submit one entry per selection under the same name.
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

describe('parseSideTournamentFromFormData — disabledCategories', () => {
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

  it('ignores submitted disabled-categories when sideturneringen is off', () => {
    // Even if a stale checkbox were submitted, off → empty array.
    const result = parseSideTournamentFromFormData(
      fd({ side_tournament_enabled: 'false' }, ['most_birdies_team']),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.disabledCategories).toEqual([]);
    }
  });

  it('returns empty disabledCategories when enabled and no checkboxes submitted (Full pakke)', () => {
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

  it('parses a subset of disabled categories', () => {
    const result = parseSideTournamentFromFormData(
      fd(
        {
          side_tournament_enabled: 'true',
          side_ld_count: '0',
          side_ctp_count: '0',
        },
        ['most_birdies_team', 'snowman'],
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.disabledCategories).toEqual([
        'most_birdies_team',
        'snowman',
      ]);
    }
  });

  it('parses all 27 category IDs without rejecting any', () => {
    // ALL_CATEGORY_IDS is exhaustive per `sideTournamentConfig.ts`. If a new
    // ID is added there, the parser must accept it without code change here —
    // this guards that round-trip.
    const result = parseSideTournamentFromFormData(
      fd(
        {
          side_tournament_enabled: 'true',
          side_ld_count: '0',
          side_ctp_count: '0',
        },
        [...ALL_CATEGORY_IDS],
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.disabledCategories).toEqual([...ALL_CATEGORY_IDS]);
      // Sanity check: confirm the public ID list is the size we expect after
      // v1.2.0 expansion. If this number drifts, the test that asserts "all 21
      // new category IDs can be parsed" no longer holds — bump intentionally.
      expect(ALL_CATEGORY_IDS.length).toBe(27);
    }
  });

  it('rejects an unknown category id', () => {
    const result = parseSideTournamentFromFormData(
      fd(
        {
          side_tournament_enabled: 'true',
          side_ld_count: '0',
          side_ctp_count: '0',
        },
        ['invalid_category'],
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('bad_side_disabled_categories');
    }
  });

  it('rejects when one of several categories is invalid', () => {
    const result = parseSideTournamentFromFormData(
      fd(
        {
          side_tournament_enabled: 'true',
          side_ld_count: '0',
          side_ctp_count: '0',
        },
        ['most_birdies_team', 'nope', 'snowman'],
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('bad_side_disabled_categories');
    }
  });

  it('combines LD/CTP counts with disabledCategories correctly', () => {
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
      expect(result.payload.disabledCategories).toEqual(['turkey', 'solid']);
    }
  });

  it('still rejects bad LD count even when disabledCategories are valid', () => {
    // Ensures count-validation isn't bypassed by the new field.
    const result = parseSideTournamentFromFormData(
      fd(
        {
          side_tournament_enabled: 'true',
          side_ld_count: '5',
          side_ctp_count: '0',
        },
        ['turkey'],
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('bad_side_ld_count');
    }
  });
});
