import { describe, it, expect } from 'vitest';
import { buildTeeOffIcs, type TeeOffIcsInput } from './teeOffIcs';

// Type-A unit tests for the tee-off .ics (RFC 5545 iCalendar) builder (#945).
// The builder is a pure function: every time-dependent value (dtstamp) is
// injected so the output is deterministic and testable to the second.

const base: TeeOffIcsInput = {
  uid: 'teeoff-abc123@tornygolf.no',
  gameName: 'Lørdagsturnering',
  courseName: 'Oslo Golfklubb',
  teeOffAt: new Date('2026-07-15T09:00:00Z'),
  durationMinutes: 270,
  reminderMinutes: 60,
  summary: 'Golf: Lørdagsturnering',
  description: 'Tee-off for Lørdagsturnering · https://tornygolf.no',
  dtstamp: new Date('2026-07-01T12:00:00Z'),
};

/** Split an ICS payload into its (unfolded) logical lines. */
function lines(ics: string): string[] {
  // Unfold first (RFC 5545: CRLF + single space/tab continues the prior line),
  // then split on CRLF so assertions read the logical property values. The
  // payload ends with a terminating CRLF, so drop the trailing empty element.
  const ls = ics.replace(/\r\n[ \t]/g, '').split('\r\n');
  if (ls.at(-1) === '') ls.pop();
  return ls;
}

describe('buildTeeOffIcs — structure', () => {
  const ics = buildTeeOffIcs(base);
  const ls = lines(ics);

  it('opens and closes a VCALENDAR', () => {
    expect(ls[0]).toBe('BEGIN:VCALENDAR');
    expect(ls.at(-1)).toBe('END:VCALENDAR');
  });

  it('declares VERSION 2.0 and a PRODID', () => {
    expect(ls).toContain('VERSION:2.0');
    expect(ls.some((l) => l.startsWith('PRODID:'))).toBe(true);
  });

  it('wraps a single VEVENT', () => {
    expect(ls.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(ls.filter((l) => l === 'END:VEVENT')).toHaveLength(1);
  });

  it('carries the stable UID and injected DTSTAMP', () => {
    expect(ls).toContain('UID:teeoff-abc123@tornygolf.no');
    expect(ls).toContain('DTSTAMP:20260701T120000Z');
  });
});

describe('buildTeeOffIcs — time emission (UTC)', () => {
  it('emits DTSTART as the tee-off instant in UTC form', () => {
    const ls = lines(buildTeeOffIcs(base));
    expect(ls).toContain('DTSTART:20260715T090000Z');
  });

  it('emits DTEND as start + durationMinutes', () => {
    // 09:00Z + 270 min = 13:30Z
    const ls = lines(buildTeeOffIcs(base));
    expect(ls).toContain('DTEND:20260715T133000Z');
  });

  it('rolls the date over when duration crosses midnight UTC', () => {
    const ls = lines(
      buildTeeOffIcs({ ...base, teeOffAt: new Date('2026-07-15T22:00:00Z') }),
    );
    expect(ls).toContain('DTSTART:20260715T220000Z');
    // 22:00Z + 270 min = 02:30Z next day
    expect(ls).toContain('DTEND:20260716T023000Z');
  });
});

describe('buildTeeOffIcs — reminder (VALARM)', () => {
  it('adds a DISPLAY alarm one hour before for reminderMinutes=60', () => {
    const ls = lines(buildTeeOffIcs(base));
    expect(ls).toContain('BEGIN:VALARM');
    expect(ls).toContain('ACTION:DISPLAY');
    expect(ls).toContain('TRIGGER:-PT1H');
    expect(ls).toContain('END:VALARM');
  });

  it('uses minute granularity when not a whole hour', () => {
    const ls = lines(buildTeeOffIcs({ ...base, reminderMinutes: 90 }));
    expect(ls).toContain('TRIGGER:-PT90M');
  });

  it('omits the VALARM entirely when reminderMinutes is 0', () => {
    const ls = lines(buildTeeOffIcs({ ...base, reminderMinutes: 0 }));
    expect(ls).not.toContain('BEGIN:VALARM');
  });
});

describe('buildTeeOffIcs — TEXT escaping', () => {
  it('escapes backslash, semicolon and comma in LOCATION', () => {
    const ls = lines(
      buildTeeOffIcs({ ...base, courseName: 'G&K; Bogstad, bane\\1' }),
    );
    expect(ls).toContain('LOCATION:G&K\\; Bogstad\\, bane\\\\1');
  });

  it('escapes newlines in DESCRIPTION as literal \\n', () => {
    const ls = lines(
      buildTeeOffIcs({ ...base, description: 'Linje 1\nLinje 2' }),
    );
    expect(ls.some((l) => l === 'DESCRIPTION:Linje 1\\nLinje 2')).toBe(true);
  });

  it('escapes the SUMMARY too', () => {
    const ls = lines(buildTeeOffIcs({ ...base, summary: 'Golf; runde, 1' }));
    expect(ls).toContain('SUMMARY:Golf\\; runde\\, 1');
  });
});

describe('buildTeeOffIcs — optional course', () => {
  it('omits LOCATION when courseName is null', () => {
    const ls = lines(buildTeeOffIcs({ ...base, courseName: null }));
    expect(ls.some((l) => l.startsWith('LOCATION:'))).toBe(false);
  });

  it('omits LOCATION when courseName is blank', () => {
    const ls = lines(buildTeeOffIcs({ ...base, courseName: '   ' }));
    expect(ls.some((l) => l.startsWith('LOCATION:'))).toBe(false);
  });
});

describe('buildTeeOffIcs — line discipline', () => {
  it('uses CRLF line endings throughout', () => {
    const ics = buildTeeOffIcs(base);
    // Every line break is a CRLF — no lone LF.
    expect(ics.includes('\r\n')).toBe(true);
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it('folds physical lines longer than 75 octets', () => {
    const longName = 'A'.repeat(200);
    const ics = buildTeeOffIcs({ ...base, summary: longName });
    // A folded continuation line begins with CRLF + a single space.
    expect(ics.includes('\r\n ')).toBe(true);
    // No raw physical line exceeds 75 octets.
    const tooLong = ics
      .split('\r\n')
      .some((l) => new TextEncoder().encode(l).length > 75);
    expect(tooLong).toBe(false);
    // Unfolding restores the full summary.
    expect(lines(ics)).toContain(`SUMMARY:${longName}`);
  });
});
