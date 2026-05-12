import { describe, it, expect } from 'vitest';
import { buildGameInsertPayload, parseOsloDateTimeLocal } from './gamePayload';

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

describe('parseOsloDateTimeLocal', () => {
  it('parses summer (CEST/+02:00) wall-clock to UTC', () => {
    // 2026-06-15 09:00 Oslo = 07:00 UTC
    expect(parseOsloDateTimeLocal('2026-06-15T09:00')).toBe(
      '2026-06-15T07:00:00.000Z',
    );
  });

  it('parses winter (CET/+01:00) wall-clock to UTC', () => {
    // 2026-12-15 09:00 Oslo = 08:00 UTC
    expect(parseOsloDateTimeLocal('2026-12-15T09:00')).toBe(
      '2026-12-15T08:00:00.000Z',
    );
  });

  it('throws on a malformed string', () => {
    expect(() => parseOsloDateTimeLocal('not a date')).toThrow();
  });

  it('resolves the ambiguous fall-back hour to post-transition CET (+01:00)', () => {
    // 2026-10-25 02:30 Europe/Oslo is ambiguous (DST ended at 03:00→02:00).
    // Implementation deliberately falls back to post-transition offset (+01:00):
    // 02:30 CET = 01:30 UTC.
    expect(parseOsloDateTimeLocal('2026-10-25T02:30')).toBe(
      '2026-10-25T01:30:00.000Z',
    );
  });
});

describe('buildGameInsertPayload (draft mode)', () => {
  it('requires only name', () => {
    const result = buildGameInsertPayload(fd({ name: 'Vinter-cup' }), 'draft');
    expect(result.errorCode).toBeUndefined();
    expect(result.name).toBe('Vinter-cup');
    expect(result.course_id).toBeNull();
    expect(result.tee_box_id).toBeNull();
    expect(result.players).toEqual([]);
  });

  it('rejects empty name', () => {
    const result = buildGameInsertPayload(fd({ name: '   ' }), 'draft');
    expect(result.errorCode).toBe('name_required');
  });

  it('accepts a partial player list without team-balance check', () => {
    const result = buildGameInsertPayload(
      fd({
        name: 'Test',
        player_0_id: 'u1', player_0_team: '1', player_0_flight: '1',
        player_1_id: 'u2', player_1_team: '1', player_1_flight: '1',
        player_2_id: 'u3', player_2_team: '2', player_2_flight: '1',
      }),
      'draft',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.players).toHaveLength(3);
  });

  it('still rejects duplicate players in draft mode', () => {
    const result = buildGameInsertPayload(
      fd({
        name: 'Test',
        player_0_id: 'u1', player_0_team: '1', player_0_flight: '1',
        player_1_id: 'u1', player_1_team: '2', player_1_flight: '1',
      }),
      'draft',
    );
    expect(result.errorCode).toBe('duplicate_player');
  });

  it('coerces empty course/tee-box to null without error', () => {
    const result = buildGameInsertPayload(
      fd({ name: 'Test', course_id: '', tee_box_id: '' }),
      'draft',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.course_id).toBeNull();
    expect(result.tee_box_id).toBeNull();
  });
});

describe('buildGameInsertPayload (publish mode)', () => {
  it('requires course', () => {
    const result = buildGameInsertPayload(fd({ name: 'Test' }), 'publish');
    expect(result.errorCode).toBe('course_required');
  });

  it('requires 8 balanced players', () => {
    const result = buildGameInsertPayload(
      fd({
        name: 'Test', course_id: 'c1', tee_box_id: 't1',
        player_0_id: 'u1', player_0_team: '1', player_0_flight: '1',
      }),
      'publish',
    );
    expect(result.errorCode).toBe('players_required');
  });

  it('accepts a full balanced lineup', () => {
    const entries: Record<string, string> = {
      name: 'Test', course_id: 'c1', tee_box_id: 't1',
    };
    for (let i = 0; i < 8; i++) {
      entries[`player_${i}_id`] = `u${i}`;
      entries[`player_${i}_team`] = String(Math.floor(i / 2) + 1);
      entries[`player_${i}_flight`] = String(Math.floor(i / 2) < 2 ? 1 : 2);
    }
    const result = buildGameInsertPayload(fd(entries), 'publish');
    expect(result.errorCode).toBeUndefined();
    expect(result.players).toHaveLength(8);
  });
});
