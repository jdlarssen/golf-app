import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { groupNotificationsByDay, formatDayLabel } from './groupByDay';

type Item = { id: string; created_at: string };

beforeEach(() => {
  // Pin «nå» til en kjent verdi så «I dag»/«I går»-bucketing er deterministisk.
  // 2026-05-24T14:30:00 Europe/Oslo (~12:30 UTC). Mai er sommertid (UTC+2).
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-24T12:30:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('groupNotificationsByDay', () => {
  it('returnerer tom liste for tom input', () => {
    expect(groupNotificationsByDay<Item>([])).toEqual([]);
  });

  it('grupperer flere varsler fra samme dag under én bucket', () => {
    const items: Item[] = [
      { id: 'a', created_at: '2026-05-24T08:00:00Z' },
      { id: 'b', created_at: '2026-05-24T11:00:00Z' },
    ];
    const groups = groupNotificationsByDay(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('I dag');
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('lager separate buckets per dag', () => {
    const items: Item[] = [
      { id: 'a', created_at: '2026-05-24T10:00:00Z' }, // i dag
      { id: 'b', created_at: '2026-05-23T10:00:00Z' }, // i går
      { id: 'c', created_at: '2026-05-22T10:00:00Z' }, // 22. mai
    ];
    const groups = groupNotificationsByDay(items);
    expect(groups).toHaveLength(3);
    expect(groups[0].label).toBe('I dag');
    expect(groups[1].label).toBe('I går');
    expect(groups[2].label).toMatch(/22\.\s*mai/i);
  });

  it('beholder rekkefølge fra input (caller har allerede sortert ny→gammel)', () => {
    const items: Item[] = [
      { id: 'newest', created_at: '2026-05-24T15:00:00Z' },
      { id: 'middle', created_at: '2026-05-24T10:00:00Z' },
      { id: 'oldest', created_at: '2026-05-23T10:00:00Z' },
    ];
    const groups = groupNotificationsByDay(items);
    expect(groups[0].items.map((i) => i.id)).toEqual(['newest', 'middle']);
    expect(groups[1].items.map((i) => i.id)).toEqual(['oldest']);
  });
});

describe('formatDayLabel', () => {
  it('returnerer «I dag» for samme dato', () => {
    const today = new Date('2026-05-24T08:00:00Z');
    expect(formatDayLabel(today)).toBe('I dag');
  });

  it('returnerer «I går» for dagen før', () => {
    const yesterday = new Date('2026-05-23T20:00:00Z');
    expect(formatDayLabel(yesterday)).toBe('I går');
  });

  it('returnerer formatert dato for eldre datoer', () => {
    const older = new Date('2026-05-15T10:00:00Z');
    expect(formatDayLabel(older)).toMatch(/15\.\s*mai/i);
  });

  it('inkluderer år når datoen er fra et tidligere år', () => {
    const lastYear = new Date('2025-12-10T10:00:00Z');
    expect(formatDayLabel(lastYear)).toMatch(/10\.\s*des\.?\s*2025/i);
  });
});
